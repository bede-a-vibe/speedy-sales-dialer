CREATE TYPE public.appointment_outcome AS ENUM ('no_show', 'rescheduled', 'showed_closed', 'showed_no_close');

ALTER TABLE public.pipeline_items
ADD COLUMN appointment_outcome public.appointment_outcome,
ADD COLUMN outcome_recorded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN outcome_notes TEXT NOT NULL DEFAULT '';

ALTER TABLE public.contacts
ADD COLUMN latest_appointment_outcome public.appointment_outcome,
ADD COLUMN latest_appointment_scheduled_for TIMESTAMP WITH TIME ZONE,
ADD COLUMN latest_appointment_recorded_at TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION public.validate_pipeline_item()
RETURNS TRIGGER
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
  ELSIF NEW.appointment_outcome = 'rescheduled' THEN
    NEW.status := 'open';
    NEW.completed_at := NULL;
    IF NEW.outcome_recorded_at IS NULL THEN
      NEW.outcome_recorded_at := now();
    END IF;
  ELSIF NEW.appointment_outcome IS NOT NULL THEN
    NEW.status := 'completed';
    IF NEW.outcome_recorded_at IS NULL THEN
      NEW.outcome_recorded_at := now();
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

DROP TRIGGER IF EXISTS validate_pipeline_items_on_write ON public.pipeline_items;
CREATE TRIGGER validate_pipeline_items_on_write
BEFORE INSERT OR UPDATE ON public.pipeline_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_pipeline_item();

DROP TRIGGER IF EXISTS update_pipeline_items_updated_at ON public.pipeline_items;
CREATE TRIGGER update_pipeline_items_updated_at
BEFORE UPDATE ON public.pipeline_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_contacts_updated_at ON public.contacts;
CREATE TRIGGER update_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();