-- 17 Nov 2026 Insights accuracy audit.
-- 1. Real moves per booking. reschedule_count also counts entry-error date fixes.
create or replace function public.move_count(p public.pipeline_items) returns integer
language sql stable set search_path = public as $$
  select count(*)::int from public.meeting_reschedules r where r.pipeline_item_id = p.id and r.kind = 'move'
$$;
grant execute on function public.move_count(public.pipeline_items) to authenticated, anon;

-- 2. Reason codes must match src/lib/appointments.ts (GHL vocabulary and free text broke the breakdowns).
alter table public.pipeline_items drop constraint if exists pipeline_items_outcome_reason_vocab;
alter table public.pipeline_items add constraint pipeline_items_outcome_reason_vocab check (
  outcome_reason is null
  or outcome_reason in ('price_budget','think_partner','timing','agency_trust','other',
    'dq_too_small','dq_wrong_fit','dq_not_dm','dq_no_capacity',
    'ns_forgot','ns_ghosted','ns_emergency','ns_wrong_time','ns_other',
    'cx_not_interested','cx_competitor','cx_timing','cx_price','cx_other',
    'rs_prospect','rs_us','rs_clash',
    'rs_phone_no_laptop','rs_phone_not_quiet','rs_phone_driving','rs_phone_other'));
