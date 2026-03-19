
-- Trigger function: when a pipeline_item's appointment_outcome changes,
-- 1) Sync the outcome to the contact record
-- 2) Auto-create a follow-up if outcome is no_show or showed_verbal_commitment
CREATE OR REPLACE FUNCTION public.sync_pipeline_outcome_to_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _new_status text;
  _follow_up_date timestamptz;
BEGIN
  -- Only act on booked pipeline items with a new/changed appointment_outcome
  IF NEW.pipeline_type <> 'booked' THEN
    RETURN NEW;
  END IF;

  IF NEW.appointment_outcome IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if outcome didn't actually change
  IF TG_OP = 'UPDATE' AND OLD.appointment_outcome IS NOT DISTINCT FROM NEW.appointment_outcome THEN
    RETURN NEW;
  END IF;

  -- Determine new contact status based on outcome
  CASE NEW.appointment_outcome
    WHEN 'showed_closed' THEN
      _new_status := 'closed';
    WHEN 'no_show' THEN
      _new_status := 'follow_up';
    WHEN 'showed_verbal_commitment' THEN
      _new_status := 'follow_up';
    WHEN 'showed_no_close' THEN
      _new_status := 'not_interested';
    WHEN 'rescheduled' THEN
      _new_status := 'booked';
    ELSE
      _new_status := 'called';
  END CASE;

  -- Update the contact record
  UPDATE public.contacts
  SET status = _new_status,
      latest_appointment_outcome = NEW.appointment_outcome,
      latest_appointment_scheduled_for = COALESCE(NEW.scheduled_for, latest_appointment_scheduled_for),
      latest_appointment_recorded_at = COALESCE(NEW.outcome_recorded_at, now()),
      updated_at = now()
  WHERE id = NEW.contact_id;

  -- Auto-create follow-up for no_show or verbal_commitment
  IF NEW.appointment_outcome IN ('no_show', 'showed_verbal_commitment') THEN
    _follow_up_date := now() + interval '2 days';

    INSERT INTO public.pipeline_items (
      contact_id,
      pipeline_type,
      assigned_user_id,
      created_by,
      scheduled_for,
      notes,
      status
    ) VALUES (
      NEW.contact_id,
      'follow_up',
      NEW.assigned_user_id,
      NEW.created_by,
      _follow_up_date,
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

-- Attach the trigger to pipeline_items (AFTER so validate_pipeline_item runs first)
DROP TRIGGER IF EXISTS trg_sync_pipeline_outcome_to_contact ON public.pipeline_items;
CREATE TRIGGER trg_sync_pipeline_outcome_to_contact
  AFTER INSERT OR UPDATE ON public.pipeline_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_pipeline_outcome_to_contact();
