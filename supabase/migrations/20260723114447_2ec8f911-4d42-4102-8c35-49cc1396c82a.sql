
-- 1. Backup tables: enable RLS, admin-only read
ALTER TABLE public.dm_phone_dedupe_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read dm_phone_dedupe_backup"
  ON public.dm_phone_dedupe_backup FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.state_label_fix_backup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read state_label_fix_backup"
  ON public.state_label_fix_backup FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. ghl_import_exclude: add admin-only policy (service_role bypasses RLS anyway)
GRANT SELECT ON public.ghl_import_exclude TO authenticated;
GRANT ALL ON public.ghl_import_exclude TO service_role;
CREATE POLICY "Admins manage ghl_import_exclude"
  ON public.ghl_import_exclude FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Replace always-true policies with role-scoped ones
DROP POLICY IF EXISTS "Service role full access on pending_ghl_pushes" ON public.pending_ghl_pushes;
CREATE POLICY "Service role manages pending_ghl_pushes"
  ON public.pending_ghl_pushes FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service role only" ON public.ghl_import_state;
CREATE POLICY "Service role manages ghl_import_state"
  ON public.ghl_import_state FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can manage client meetings" ON public.client_meetings;
CREATE POLICY "Admins manage client meetings"
  ON public.client_meetings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Revoke EXECUTE from anon/PUBLIC on SECURITY DEFINER functions in public
-- These functions rely on auth.uid() internally; anon must not call them.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
  END LOOP;
END $$;

-- Admin-only functions: also revoke from authenticated (call via edge function/service role)
REVOKE EXECUTE ON FUNCTION public.bulk_update_google_reviews(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.export_contacts_for_ghl_link() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.export_contacts_for_linking(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_ghl_contact_id(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.find_exact_phone_duplicate_groups() FROM authenticated;
