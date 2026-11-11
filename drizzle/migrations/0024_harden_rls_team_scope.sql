CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;
REVOKE ALL ON FUNCTION public.is_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid) TO authenticated, service_role;

-- Backup / work tables: lock down to server-side only
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dup_merge_safe_20260805','archived_no_web_backup','dup_merge_plan_20260805','dm_selfdup_backup','dm_name_cleanup_backup','state_match_work','state_backfill_backup','contacts_dir_bleed_backup_20261102','no_show_revival_backup_20260804','au_locality_state','dup_merge_backup_20260805','verbal_commit_revival_backup_20260804','junk_archive_preview']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Shared team tables: only real team members (with an assigned role)
ALTER POLICY "Users can view all call logs" ON public.call_logs USING (public.is_team_member(auth.uid()));
ALTER POLICY "Users can view all call scores" ON public.call_scores USING (public.is_team_member(auth.uid()));
ALTER POLICY "Authenticated users can view client meetings" ON public.client_meetings USING (public.is_team_member(auth.uid()));
ALTER POLICY "Authenticated users can view contact notes" ON public.contact_notes USING (public.is_team_member(auth.uid()));
ALTER POLICY "Authenticated users can view contacts" ON public.contacts USING (public.is_team_member(auth.uid()));
ALTER POLICY "ghl_appts_read_authenticated" ON public.ghl_appointments USING (public.is_team_member(auth.uid()));
ALTER POLICY "Signed-in users read KPI settings" ON public.kpi_settings USING (public.is_team_member(auth.uid()));
ALTER POLICY "meeting_outcome_log_read" ON public.meeting_outcome_log USING (public.is_team_member(auth.uid()));
ALTER POLICY "meeting_outcome_log_insert" ON public.meeting_outcome_log WITH CHECK (public.is_team_member(auth.uid()) AND (recorded_by IS NULL OR recorded_by = auth.uid()));
ALTER POLICY "authenticated read confusion" ON public.opener_confusion_daily USING (public.is_team_member(auth.uid()));
ALTER POLICY "Authenticated users can view pipeline items" ON public.pipeline_items USING (public.is_team_member(auth.uid()));
ALTER POLICY "Everyone reads playbook locks" ON public.playbook_locks USING (public.is_team_member(auth.uid()));
ALTER POLICY "Users can view all profiles" ON public.profiles USING (auth.uid() = user_id OR public.is_team_member(auth.uid()));

-- Audit trails: managers only
ALTER POLICY "authenticated_read_contact_audit" ON public.contact_audit USING (public.is_admin_or_coach(auth.uid()));
ALTER POLICY "authenticated_read_deal_audit" ON public.deal_audit USING (public.is_admin_or_coach(auth.uid()));