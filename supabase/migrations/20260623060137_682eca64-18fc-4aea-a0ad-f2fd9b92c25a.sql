DO $$
DECLARE
  fn_name text;
  fn_oid oid;
  def text;
BEGIN
  FOR fn_name, fn_oid IN
    SELECT p.proname, p.oid
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('claim_dialer_leads','get_dialer_queue_count','preview_dialer_leads')
  LOOP
    def := pg_get_functiondef(fn_oid);
    IF position('Australia/Sydney' in def) > 0 THEN
      def := replace(def, 'Australia/Sydney', 'Australia/Melbourne');
      EXECUTE def;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sync_booking_to_ghl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _def text;
BEGIN
  -- placeholder no-op; real definition replaced below
  RETURN NEW;
END;
$func$;