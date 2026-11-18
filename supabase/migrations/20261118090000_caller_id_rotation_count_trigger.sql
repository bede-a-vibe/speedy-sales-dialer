-- Caller ID rotation: count dials in the database.
--
-- The browser used to bump dialpad_settings.rotation_dial_count through the
-- increment_rotation_dial_count RPC, but that call almost never ran in
-- production (Ben's counter read 20 after 9,326 outbound calls from 12 Oct to
-- 18 Nov 2026), so the caller ID never rotated. Every outbound Dialpad call
-- already lands in dialpad_calls with user_id and direction, whichever path
-- placed it, so count there instead. The dialer picks
-- pool[floor(rotation_dial_count / 40) % pool_size].

CREATE OR REPLACE FUNCTION public.bump_rotation_dial_count_on_outbound_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.direction = 'outbound' AND NEW.user_id IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR OLD.direction IS DISTINCT FROM 'outbound'
       OR OLD.user_id IS NULL
     ) THEN
    UPDATE public.dialpad_settings
       SET rotation_dial_count = COALESCE(rotation_dial_count, 0) + 1
     WHERE user_id = NEW.user_id
       AND is_active = true;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.bump_rotation_dial_count_on_outbound_call() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dialpad_calls_rotation_count ON public.dialpad_calls;
CREATE TRIGGER trg_dialpad_calls_rotation_count
  AFTER INSERT OR UPDATE OF direction, user_id ON public.dialpad_calls
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_rotation_dial_count_on_outbound_call();
