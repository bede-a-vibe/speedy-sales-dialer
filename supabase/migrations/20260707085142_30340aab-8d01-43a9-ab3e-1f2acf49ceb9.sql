-- =====================================================================
-- PHASE 2: Contact Lifecycle Spine (additive, non-breaking)
-- =====================================================================

-- 1) Columns -----------------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS lifecycle_reason text NULL,
  ADD COLUMN IF NOT EXISTS owner_id uuid NULL;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_lifecycle_stage_check;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_lifecycle_stage_check
  CHECK (lifecycle_stage IN ('new','attempting','connected','qualified','booked','won','lost'));

CREATE INDEX IF NOT EXISTS contacts_lifecycle_stage_idx ON public.contacts(lifecycle_stage);
CREATE INDEX IF NOT EXISTS contacts_owner_id_idx ON public.contacts(owner_id);

-- 2) Stage rank helper (terminal states share the top rank) -----------
CREATE OR REPLACE FUNCTION public.lifecycle_rank(stage text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE stage
    WHEN 'new'        THEN 0
    WHEN 'attempting' THEN 1
    WHEN 'connected'  THEN 2
    WHEN 'qualified'  THEN 3
    WHEN 'booked'     THEN 4
    WHEN 'won'        THEN 5
    WHEN 'lost'       THEN 5
    ELSE -1
  END;
$$;

-- 3) Forward-only advance helper --------------------------------------
CREATE OR REPLACE FUNCTION public.advance_contact_lifecycle(
  _contact_id uuid,
  _target text,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_stage text;
BEGIN
  SELECT lifecycle_stage INTO current_stage FROM public.contacts WHERE id = _contact_id;
  IF current_stage IS NULL THEN RETURN; END IF;

  -- Terminal states (won/lost) do not regress to earlier stages.
  IF current_stage IN ('won','lost') AND _target NOT IN ('won','lost') THEN
    RETURN;
  END IF;

  IF public.lifecycle_rank(_target) > public.lifecycle_rank(current_stage)
     OR (_target IN ('won','lost') AND current_stage NOT IN ('won','lost'))
     OR (_target = 'won' AND current_stage = 'lost') -- closed-won always wins over lost
  THEN
    UPDATE public.contacts
       SET lifecycle_stage  = _target,
           lifecycle_reason = COALESCE(_reason, lifecycle_reason)
     WHERE id = _contact_id;
  END IF;
END;
$$;

-- 4) Backfill lifecycle_stage + lifecycle_reason ----------------------
UPDATE public.contacts c
SET lifecycle_stage = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.pipeline_items p
        WHERE p.contact_id = c.id AND p.appointment_outcome = 'showed_closed'
      ) THEN 'won'
      WHEN c.is_dnc OR c.status = 'dnc' THEN 'lost'
      WHEN c.status = 'lost' THEN 'lost'
      WHEN c.last_outcome IN ('not_interested','wrong_number','disqualified','dnc') THEN 'lost'
      WHEN EXISTS (
        SELECT 1 FROM public.pipeline_items p
        WHERE p.contact_id = c.id AND p.pipeline_type = 'booked' AND p.status = 'open'
      ) THEN 'booked'
      WHEN c.status = 'booked' THEN 'booked'
      WHEN COALESCE(c.buying_signal_strength,'') IN ('high','strong','very_high')
        OR COALESCE(c.authority_level,'') IN ('decision_maker','owner','high','ceo','founder') THEN 'qualified'
      WHEN EXISTS (
        SELECT 1 FROM public.call_logs cl
        WHERE cl.contact_id = c.id AND cl.reached_connection = true
      ) THEN 'connected'
      WHEN c.call_attempt_count > 0 OR c.status = 'no_answer' THEN 'attempting'
      ELSE 'new'
    END,
    lifecycle_reason = CASE
      WHEN c.is_dnc OR c.status = 'dnc' THEN 'dnc'
      WHEN c.last_outcome IN ('not_interested','wrong_number','disqualified') THEN c.last_outcome::text
      WHEN c.status = 'lost' THEN 'lost'
      ELSE NULL
    END;

-- 5) Backfill owner_id from newest pipeline_items assignment ----------
UPDATE public.contacts c
SET owner_id = sub.assigned_user_id
FROM (
  SELECT DISTINCT ON (contact_id) contact_id, assigned_user_id
  FROM public.pipeline_items
  WHERE assigned_user_id IS NOT NULL
  ORDER BY contact_id, created_at DESC
) sub
WHERE sub.contact_id = c.id
  AND c.owner_id IS NULL;

-- 6) Auto-advance trigger — call_logs INSERT --------------------------
CREATE OR REPLACE FUNCTION public.trg_call_log_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.outcome = 'booked' THEN
    PERFORM public.advance_contact_lifecycle(NEW.contact_id, 'booked', NULL);
  ELSIF NEW.outcome = 'dnc' THEN
    PERFORM public.advance_contact_lifecycle(NEW.contact_id, 'lost', 'dnc');
  ELSIF NEW.outcome IN ('not_interested','wrong_number','disqualified') THEN
    PERFORM public.advance_contact_lifecycle(NEW.contact_id, 'lost', NEW.outcome::text);
  ELSIF NEW.reached_connection THEN
    PERFORM public.advance_contact_lifecycle(NEW.contact_id, 'connected', NULL);
  ELSE
    PERFORM public.advance_contact_lifecycle(NEW.contact_id, 'attempting', NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_logs_lifecycle_advance ON public.call_logs;
CREATE TRIGGER call_logs_lifecycle_advance
AFTER INSERT ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.trg_call_log_lifecycle();

-- 7) Auto-advance trigger — contacts status / dnc changes -------------
-- Skip if lifecycle_stage was explicitly changed in the same UPDATE
-- (manual UI override always wins).
CREATE OR REPLACE FUNCTION public.trg_contact_status_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.lifecycle_stage IS DISTINCT FROM OLD.lifecycle_stage THEN
    RETURN NEW;
  END IF;

  IF NEW.is_dnc AND NOT OLD.is_dnc THEN
    PERFORM public.advance_contact_lifecycle(NEW.id, 'lost', 'dnc');
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'booked' THEN
      PERFORM public.advance_contact_lifecycle(NEW.id, 'booked', NULL);
    ELSIF NEW.status = 'dnc' THEN
      PERFORM public.advance_contact_lifecycle(NEW.id, 'lost', 'dnc');
    ELSIF NEW.status IN ('not_interested','lost') THEN
      PERFORM public.advance_contact_lifecycle(NEW.id, 'lost', NEW.status);
    ELSIF NEW.status IN ('called','no_answer','follow_up') THEN
      PERFORM public.advance_contact_lifecycle(NEW.id, 'attempting', NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_status_lifecycle ON public.contacts;
CREATE TRIGGER contacts_status_lifecycle
AFTER UPDATE OF status, is_dnc ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.trg_contact_status_lifecycle();

-- 8) Auto-advance trigger — pipeline_items INSERT/UPDATE --------------
CREATE OR REPLACE FUNCTION public.trg_pipeline_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.appointment_outcome = 'showed_closed' THEN
    PERFORM public.advance_contact_lifecycle(NEW.contact_id, 'won', NULL);
    RETURN NEW;
  END IF;

  IF NEW.pipeline_type = 'booked'
     AND (TG_OP = 'INSERT'
          OR OLD.pipeline_type IS DISTINCT FROM NEW.pipeline_type
          OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.status = 'open'
  THEN
    PERFORM public.advance_contact_lifecycle(NEW.contact_id, 'booked', NULL);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pipeline_items_lifecycle ON public.pipeline_items;
CREATE TRIGGER pipeline_items_lifecycle
AFTER INSERT OR UPDATE ON public.pipeline_items
FOR EACH ROW EXECUTE FUNCTION public.trg_pipeline_lifecycle();
