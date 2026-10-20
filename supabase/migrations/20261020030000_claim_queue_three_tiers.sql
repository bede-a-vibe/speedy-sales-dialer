-- Bede's dialling order (20 Oct 2026):
--   1. leads nobody has dialled
--   2. leads dialled but never picked up
--   3. leads who have picked up (any logged pickup, incl. gatekeeper, or a connected Dialpad
--      call of 30 s+), always at the back
-- Within a tier the existing order stands (golden-hour DM, mobile reachability, priority score,
-- attempts, random). Leads at 10+ attempts were already out (call_attempt_count < 10 filter).
-- Patches claim_dialer_leads_core in place by text so the rest of the function is untouched;
-- idempotent. Applied to prod 20 Oct 2026.
do $$
declare src text; n int;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p join pg_namespace n2 on n2.oid=p.pronamespace where n2.nspname='public' and p.proname='claim_dialer_leads_core';
  if position('ever_connected' in src) > 0 then raise notice 'already applied'; return; end if;
  src := replace(src, 'l.session_id AS lock_session_id,',
    'l.session_id AS lock_session_id,
      (COALESCE(c.call_attempt_count, 0) = 0 AND c.last_called_at IS NULL) AS never_dialled,
      (EXISTS (SELECT 1 FROM public.call_logs cl WHERE cl.contact_id = c.id AND (cl.reached_connection IS TRUE OR cl.outcome IN (''not_interested'',''dnc'',''follow_up'',''booked'',''gatekeeper'',''disqualified'')))
       OR EXISTS (SELECT 1 FROM public.dialpad_calls d WHERE d.contact_id = c.id AND d.is_connected IS TRUE AND COALESCE(d.talk_time_seconds, 0) >= 30)) AS ever_connected,');
  src := replace(src, 'LEAST(COALESCE(vc.call_attempt_count, 0), 4) ASC,',
    'vc.never_dialled DESC, vc.ever_connected ASC, LEAST(COALESCE(vc.call_attempt_count, 0), 4) ASC,');
  src := regexp_replace(src, 'FROM inserted_locks il\s+JOIN public\.contacts c ON c\.id = il\.contact_id\s+ORDER BY',
    'FROM inserted_locks il
    JOIN public.contacts c ON c.id = il.contact_id
    JOIN visible_contacts vc ON vc.id = c.id
    ORDER BY vc.never_dialled DESC, vc.ever_connected ASC,');
  n := (length(src) - length(replace(src, 'never_dialled', ''))) / length('never_dialled');
  if n <> 3 then raise exception 'expected 3 never_dialled references (alias + two ORDER BYs), found %', n; end if;
  execute src;
end $$;
