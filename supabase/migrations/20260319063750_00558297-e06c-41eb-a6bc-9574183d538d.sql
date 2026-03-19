-- Prevent duplicate call logs: same contact + user within 5 seconds
CREATE OR REPLACE FUNCTION public.prevent_duplicate_call_log()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.call_logs
    WHERE contact_id = NEW.contact_id
      AND user_id = NEW.user_id
      AND created_at > (now() - interval '5 seconds')
  ) THEN
    RAISE EXCEPTION 'Duplicate call log: same contact and user within 5 seconds'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_duplicate_call_log
  BEFORE INSERT ON public.call_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_call_log();