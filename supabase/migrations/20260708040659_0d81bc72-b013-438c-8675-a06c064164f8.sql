
ALTER TABLE public.ghl_import_exclude ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ghl_import_exclude FROM anon, authenticated;
GRANT ALL ON public.ghl_import_exclude TO service_role;

DROP POLICY IF EXISTS "Authenticated users can insert client deals" ON public.client_deals;
DROP POLICY IF EXISTS "Authenticated users can update client deals" ON public.client_deals;
DROP POLICY IF EXISTS "Authenticated users can delete client deals" ON public.client_deals;
DROP POLICY IF EXISTS "Authenticated users can view client deals" ON public.client_deals;

CREATE POLICY "View client deals (admin/coach)" ON public.client_deals
  FOR SELECT TO authenticated
  USING (public.is_admin_or_coach(auth.uid()) OR created_by = auth.uid());

CREATE POLICY "Insert client deals (admin/coach)" ON public.client_deals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_coach(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Update client deals (admin/coach)" ON public.client_deals
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_coach(auth.uid()))
  WITH CHECK (public.is_admin_or_coach(auth.uid()));

CREATE POLICY "Delete client deals (admin/coach)" ON public.client_deals
  FOR DELETE TO authenticated
  USING (public.is_admin_or_coach(auth.uid()));

ALTER FUNCTION public.set_lead_derived_fields() SET search_path = public;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_booking_to_ghl() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_pipeline_outcome_to_contact() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_call_log_lifecycle() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_contact_status_lifecycle() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_pipeline_lifecycle() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_contact_lifecycle(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_ghl_contact_id(uuid, text) FROM authenticated;
