ALTER TABLE public.pipeline_items ADD COLUMN IF NOT EXISTS expected_close_date date, ADD COLUMN IF NOT EXISTS closed_at timestamptz;
UPDATE public.pipeline_items SET closed_at = COALESCE(outcome_recorded_at, completed_at, updated_at)
  WHERE pipeline_type='booked' AND closed_at IS NULL AND (appointment_outcome='showed_closed' OR deal_stage IN ('won','lost'));
UPDATE public.pipeline_items SET expected_close_date = (COALESCE(scheduled_for, created_at) AT TIME ZONE 'Australia/Melbourne')::date + 14
  WHERE pipeline_type='booked' AND expected_close_date IS NULL AND closed_at IS NULL;
CREATE OR REPLACE FUNCTION public.set_pipeline_close_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.pipeline_type = 'booked' THEN
    IF NEW.expected_close_date IS NULL THEN
      NEW.expected_close_date := (COALESCE(NEW.scheduled_for, now()) AT TIME ZONE 'Australia/Melbourne')::date + 14;
    END IF;
    IF NEW.closed_at IS NULL AND (NEW.appointment_outcome = 'showed_closed' OR NEW.deal_stage IN ('won','lost')) THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pipeline_close_fields ON public.pipeline_items;
CREATE TRIGGER trg_pipeline_close_fields BEFORE INSERT OR UPDATE ON public.pipeline_items FOR EACH ROW EXECUTE FUNCTION public.set_pipeline_close_fields();