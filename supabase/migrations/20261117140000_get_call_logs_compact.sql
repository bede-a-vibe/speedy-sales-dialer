-- 17 Nov 2026: one-round-trip call logs for Insights (All time was 26 pages).
-- Positional arrays plus one copy of each contact's report fields. SECURITY
-- INVOKER so RLS applies. Field order must match expandCompactCallLogs() in
-- src/hooks/useCallLogs.ts.
create or replace function public.get_call_logs_compact(_from timestamptz, _to timestamptz)
returns json
language sql stable security invoker set search_path = public as $$
  with l as (
    select * from public.call_logs cl
     where (_from is null or cl.created_at >= _from) and (_to is null or cl.created_at <= _to)
  )
  select json_build_object(
    'rows', coalesce((select json_agg(json_build_array(
        l.id, l.contact_id, l.user_id, l.outcome, l.follow_up_date, l.created_at,
        l.dialpad_call_id, l.transcript_synced_at, l.dialpad_talk_time_seconds, l.dialpad_total_duration_seconds,
        l.reached_connection, l.reached_problem_awareness, l.reached_solution_awareness, l.reached_commitment,
        l.opener_used_id, l.drop_off_reason,
        l.exit_reason_connection, l.exit_reason_problem, l.exit_reason_solution, l.exit_reason_commitment, l.exit_reason_booking
      ) order by l.created_at desc, l.id desc) from l), '[]'::json),
    'contacts', coalesce((select json_object_agg(c.id, json_build_array(
        c.business_name, c.industry, c.trade_type, c.state, c.business_size, c.work_type, c.prospect_tier,
        c.buying_signal_strength, c.phone_type, c.has_google_ads, c.has_facebook_ads, c.dm_phone, c.gbp_rating, c.review_count))
      from public.contacts c where c.id in (select distinct contact_id from l)), '{}'::json)
  );
$$;
grant execute on function public.get_call_logs_compact(timestamptz, timestamptz) to authenticated;
revoke execute on function public.get_call_logs_compact(timestamptz, timestamptz) from anon, public;
