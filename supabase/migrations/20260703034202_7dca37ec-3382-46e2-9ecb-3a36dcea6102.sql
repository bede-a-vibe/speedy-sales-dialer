
-- 1) Fix mutable search_path
ALTER FUNCTION public.auto_classify_phone_types() SET search_path = public;
ALTER FUNCTION public.bulk_update_google_reviews(updates jsonb) SET search_path = public;
ALTER FUNCTION public.classify_au_phone_type(phone_number text) SET search_path = public;
ALTER FUNCTION public.export_contacts_for_ghl_link() SET search_path = public;

-- 2) Revoke default PUBLIC execute on all SECURITY DEFINER functions in public schema
REVOKE EXECUTE ON FUNCTION public.admin_list_users_with_last_login() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_update_google_reviews(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_dialer_leads(uuid,int,int,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_dialer_leads(uuid,int,int,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.export_contacts_for_ghl_link() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.export_contacts_for_linking(int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dialer_queue_count(uuid,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dialer_queue_count(uuid,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_coach(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_dialer_leads(uuid,int,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.preview_dialer_leads(uuid,int,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_dialer_lead_locks(uuid, uuid[], int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_dialer_lead_locks(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_ghl_contact_id(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_booking_to_ghl() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_pipeline_outcome_to_contact() FROM PUBLIC, anon, authenticated;

-- 3) Grant EXECUTE to authenticated only where the client actually needs it,
--    plus helpers referenced inside RLS policies.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users_with_last_login() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dialer_leads(uuid,int,int,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dialer_leads(uuid,int,int,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dialer_queue_count(uuid,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dialer_queue_count(uuid,text[],text[],text[],text,text,text,numeric,int,text,text,text,text,boolean,text,boolean,boolean,text[],text[],text,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_dialer_lead_locks(uuid, uuid[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_dialer_lead_locks(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ghl_contact_id(uuid, text) TO authenticated;

-- 4) Tighten overly permissive RLS policies (UPDATE/INSERT/DELETE/ALL with true)
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON public.contacts;
CREATE POLICY "Admins and coaches can update contacts"
  ON public.contacts
  FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_coach(auth.uid()))
  WITH CHECK (public.is_admin_or_coach(auth.uid()));

DROP POLICY IF EXISTS "Service role full access on pending_ghl_pushes" ON public.pending_ghl_pushes;
CREATE POLICY "Service role full access on pending_ghl_pushes"
  ON public.pending_ghl_pushes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
