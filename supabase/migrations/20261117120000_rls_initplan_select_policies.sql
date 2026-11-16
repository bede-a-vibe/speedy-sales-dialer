-- 17 Nov 2026: SELECT policies called is_team_member(auth.uid()) etc. once PER
-- ROW. A 1,000-row call_logs page joined to contacts took 813 ms as an
-- authenticated user (65 ms as owner); "All time" fired 26 pages at once and
-- timed out, so Insights showed 0 dials. Wrapping in (select ...) makes Postgres
-- evaluate it once per query (InitPlan): 67 ms. Same rules, same access.
alter policy "Users can view all call logs" on public.call_logs using ((select public.is_team_member((select auth.uid()))));
alter policy "Authenticated users can view contacts" on public.contacts using ((select public.is_team_member((select auth.uid()))));
alter policy "Users can view all call scores" on public.call_scores using ((select public.is_team_member((select auth.uid()))));
alter policy "View client deals (admin/coach)" on public.client_deals using (((select public.is_admin_or_coach((select auth.uid()))) or (created_by = (select auth.uid()))));
alter policy "authenticated_read_contact_audit" on public.contact_audit using ((select public.is_admin_or_coach((select auth.uid()))));
alter policy "Authenticated users can view contact notes" on public.contact_notes using ((select public.is_team_member((select auth.uid()))));
alter policy "Authenticated users or coaches can view dialpad calls" on public.dialpad_calls using ((((select auth.uid()) = user_id) or (select public.is_admin_or_coach((select auth.uid())))));
alter policy "Own or manager read fathom meetings" on public.fathom_meetings using (((user_id = (select auth.uid())) or (select public.is_admin_or_coach((select auth.uid())))));
alter policy "Team members can view meeting reschedules" on public.meeting_reschedules using ((select public.is_team_member((select auth.uid()))));
alter policy "Authenticated users can view pipeline items" on public.pipeline_items using ((select public.is_team_member((select auth.uid()))));
alter policy "Users can view all profiles" on public.profiles using ((((select auth.uid()) = user_id) or (select public.is_team_member((select auth.uid())))));
