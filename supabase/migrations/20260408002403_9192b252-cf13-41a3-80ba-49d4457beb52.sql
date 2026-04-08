
-- 1. Add phone_e164 column
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_e164 text;

-- 2. Backfill phone_e164 from existing phone values (AU normalisation)
UPDATE public.contacts
SET phone_e164 = CASE
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^04[0-9]{8}$'
    THEN '+61' || substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 2)
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^4[0-9]{8}$'
    THEN '+61' || regexp_replace(phone, '[^0-9]', '', 'g')
  WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^61[0-9]{9}$'
    THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
  WHEN length(regexp_replace(phone, '[^0-9]', '', 'g')) BETWEEN 8 AND 15
    THEN '+' || regexp_replace(phone, '[^0-9]', '', 'g')
  ELSE NULL
END
WHERE phone IS NOT NULL AND phone <> '' AND phone_e164 IS NULL;

-- 3. Create trigger function to auto-populate phone_e164
CREATE OR REPLACE FUNCTION public.normalize_phone_e164()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  digits text;
BEGIN
  IF NEW.phone IS NOT DISTINCT FROM OLD.phone AND NEW.phone_e164 IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    NEW.phone_e164 := NULL;
    RETURN NEW;
  END IF;

  digits := regexp_replace(NEW.phone, '[^0-9]', '', 'g');

  IF digits ~ '^04[0-9]{8}$' THEN
    NEW.phone_e164 := '+61' || substring(digits FROM 2);
  ELSIF digits ~ '^4[0-9]{8}$' THEN
    NEW.phone_e164 := '+61' || digits;
  ELSIF digits ~ '^61[0-9]{9}$' THEN
    NEW.phone_e164 := '+' || digits;
  ELSIF length(digits) BETWEEN 8 AND 15 THEN
    NEW.phone_e164 := '+' || digits;
  ELSE
    NEW.phone_e164 := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Create trigger
DROP TRIGGER IF EXISTS trg_normalize_phone_e164 ON public.contacts;
CREATE TRIGGER trg_normalize_phone_e164
  BEFORE INSERT OR UPDATE OF phone ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_phone_e164();

-- 5. Index for fast E.164 lookups
CREATE INDEX IF NOT EXISTS idx_contacts_phone_e164 ON public.contacts (phone_e164) WHERE phone_e164 IS NOT NULL;

-- 6. Harden DNC in sync_pipeline_outcome_to_contact
CREATE OR REPLACE FUNCTION public.sync_pipeline_outcome_to_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _new_status text;
  _follow_up_date timestamptz;
  _is_dnc boolean;
BEGIN
  IF NEW.pipeline_type <> 'booked' THEN RETURN NEW; END IF;
  IF NEW.appointment_outcome IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.appointment_outcome IS NOT DISTINCT FROM NEW.appointment_outcome THEN
    RETURN NEW;
  END IF;

  -- DNC guard: never reactivate a DNC contact
  SELECT is_dnc INTO _is_dnc FROM public.contacts WHERE id = NEW.contact_id;
  IF _is_dnc IS TRUE THEN
    RAISE LOG '[sync_pipeline_outcome_to_contact] Skipping status update for DNC contact %', NEW.contact_id;
    RETURN NEW;
  END IF;

  CASE NEW.appointment_outcome
    WHEN 'showed_closed' THEN _new_status := 'closed';
    WHEN 'no_show' THEN _new_status := 'follow_up';
    WHEN 'showed_verbal_commitment' THEN _new_status := 'follow_up';
    WHEN 'showed_no_close' THEN _new_status := 'not_interested';
    WHEN 'rescheduled' THEN _new_status := 'booked';
    ELSE _new_status := 'called';
  END CASE;

  UPDATE public.contacts
  SET status = _new_status,
      latest_appointment_outcome = NEW.appointment_outcome,
      latest_appointment_scheduled_for = COALESCE(NEW.scheduled_for, latest_appointment_scheduled_for),
      latest_appointment_recorded_at = COALESCE(NEW.outcome_recorded_at, now()),
      updated_at = now()
  WHERE id = NEW.contact_id;

  IF NEW.appointment_outcome IN ('no_show', 'showed_verbal_commitment') THEN
    _follow_up_date := now() + interval '2 days';
    INSERT INTO public.pipeline_items (
      contact_id, pipeline_type, assigned_user_id, created_by, scheduled_for, notes, status
    ) VALUES (
      NEW.contact_id, 'follow_up', NEW.assigned_user_id, NEW.created_by, _follow_up_date,
      CASE NEW.appointment_outcome
        WHEN 'no_show' THEN 'Auto follow-up: No show on ' || to_char(COALESCE(NEW.scheduled_for, now()), 'Mon DD, YYYY')
        WHEN 'showed_verbal_commitment' THEN 'Auto follow-up: Verbal commitment on ' || to_char(COALESCE(NEW.scheduled_for, now()), 'Mon DD, YYYY')
      END,
      'open'
    );
  END IF;

  RETURN NEW;
END;
$$;
