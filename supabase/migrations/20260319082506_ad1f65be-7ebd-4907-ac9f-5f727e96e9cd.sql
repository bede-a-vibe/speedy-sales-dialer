-- Add deal_value and reschedule_count columns
ALTER TABLE public.pipeline_items
  ADD COLUMN deal_value numeric DEFAULT NULL,
  ADD COLUMN reschedule_count integer NOT NULL DEFAULT 0;

-- Update validate_pipeline_item to increment reschedule_count
CREATE OR REPLACE FUNCTION public.validate_pipeline_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.pipeline_type IN ('follow_up', 'booked') AND NEW.scheduled_for IS NULL THEN
    RAISE EXCEPTION 'scheduled_for is required for follow_up and booked pipeline items';
  END IF;

  IF NEW.pipeline_type <> 'booked' THEN
    NEW.appointment_outcome := NULL;
    NEW.outcome_recorded_at := NULL;
    NEW.outcome_notes := '';
    NEW.deal_value := NULL;
  ELSIF NEW.appointment_outcome = 'rescheduled' THEN
    NEW.status := 'open';
    NEW.completed_at := NULL;
    -- Increment reschedule_count
    IF TG_OP = 'UPDATE' AND OLD.appointment_outcome IS DISTINCT FROM NEW.appointment_outcome THEN
      NEW.reschedule_count := COALESCE(OLD.reschedule_count, 0) + 1;
    END IF;
    IF NEW.outcome_recorded_at IS NULL THEN
      NEW.outcome_recorded_at := now();
    END IF;
  ELSIF NEW.appointment_outcome IS NOT NULL THEN
    NEW.status := 'completed';
    IF NEW.outcome_recorded_at IS NULL THEN
      NEW.outcome_recorded_at := now();
    END IF;
    -- Only allow deal_value for showed_closed
    IF NEW.appointment_outcome <> 'showed_closed' THEN
      NEW.deal_value := NULL;
    END IF;
  ELSE
    NEW.outcome_recorded_at := NULL;
    NEW.outcome_notes := COALESCE(NEW.outcome_notes, '');
  END IF;

  IF NEW.pipeline_type = 'booked' AND NEW.status = 'completed' AND NEW.appointment_outcome IS NULL THEN
    RAISE EXCEPTION 'appointment_outcome is required for completed booked pipeline items';
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;