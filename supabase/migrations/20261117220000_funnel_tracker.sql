-- Funnel Flowthrough Tracker (Insights > Tracker), 17 Nov 2026.
-- Already applied live; written idempotently so a replay is a no-op.
--
-- Tier 1 = 3+ on the tools including the owner AND $50k+ revenue a month.
-- Tier 2 = everything else. Same rule for cold and ads. The TS mirror is
-- tierFor() in src/lib/appointments.ts.

-- 1. Monthly revenue on the contact, captured by the setter at booking.
alter table public.contacts
  add column if not exists monthly_revenue numeric,
  add column if not exists monthly_revenue_source text,
  add column if not exists monthly_revenue_evidence text,
  add column if not exists monthly_revenue_set_at timestamptz;
comment on column public.contacts.monthly_revenue is 'Monthly revenue in AUD as the prospect said it. Feeds the booking tier (public.tier_for).';
comment on column public.contacts.monthly_revenue_source is 'setter (captured at booking) or call_transcript.';

-- 2. Tier and booking method on the booking.
alter table public.pipeline_items
  add column if not exists booking_tier text,
  add column if not exists booking_tier_source text,
  add column if not exists booking_method text;

alter table public.pipeline_items drop constraint if exists pipeline_items_booking_tier_chk;
alter table public.pipeline_items add constraint pipeline_items_booking_tier_chk
  check (booking_tier is null or booking_tier in ('tier_1', 'tier_2'));

alter table public.pipeline_items drop constraint if exists pipeline_items_booking_method_chk;
alter table public.pipeline_items add constraint pipeline_items_booking_method_chk
  check (booking_method is null or booking_method in ('manual_set', 'self_booked', 'booking_request'));

comment on column public.pipeline_items.booking_tier is 'tier_1 | tier_2, null = unknown. From tier_for(team_size, monthly_revenue) or the setter''s override.';
comment on column public.pipeline_items.booking_tier_source is 'auto (from tier_for) or setter (overridden at booking).';
comment on column public.pipeline_items.booking_method is 'manual_set (setter booked by phone), self_booked (lead booked the calendar, a DB), booking_request (a call-me request).';

-- 3. The tier rule. Unknown inputs stay null unless one input alone already rules out Tier 1.
create or replace function public.tier_for(_team_size integer, _monthly_revenue numeric)
returns text
language sql
immutable
as $$
  select case
    when _team_size is null or _monthly_revenue is null then
      case
        when (_team_size is not null and _team_size < 3)
          or (_monthly_revenue is not null and _monthly_revenue < 50000) then 'tier_2'
        else null
      end
    when _team_size >= 3 and _monthly_revenue >= 50000 then 'tier_1'
    else 'tier_2'
  end
$$;
grant execute on function public.tier_for(integer, numeric) to authenticated;

-- 4. Daily inputs the dialer cannot see: rostered hours per setter (cold), ad spend / clicks / leads (ads).
create table if not exists public.tracker_daily_inputs (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  funnel text not null check (funnel in ('cold', 'ads')),
  user_id uuid null,
  rostered_hours numeric,
  ad_spend numeric,
  clicks integer,
  leads integer,
  notes text,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (day, funnel, user_id)
);
-- The ads row has user_id null and Postgres treats nulls as distinct here, so
-- the app looks the row up and updates it by id rather than relying on upsert.
create index if not exists tracker_daily_inputs_day_idx on public.tracker_daily_inputs (day);

-- 5. Monthly targets (the EST columns in the sheet).
create table if not exists public.tracker_targets (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  funnel text not null check (funnel in ('cold', 'ads')),
  metric text not null,
  value numeric,
  unique (month, funnel, metric)
);

-- 6. Setter / closer pay, for the P&L.
create table if not exists public.rep_comp_plans (
  user_id uuid primary key,
  role text not null check (role in ('setter', 'closer')),
  base_annual numeric not null default 0,
  plan_key text not null default 'setter_2026_marginal',
  active_from date
);

insert into public.rep_comp_plans (user_id, role, base_annual, plan_key)
values
  ('7f855655-583c-4f70-afca-fafb327ef5db', 'setter', 55000, 'setter_2026_marginal'),
  ('79a0a291-c732-4a3f-91ff-000330d810d4', 'setter', 55000, 'setter_2026_marginal')
on conflict (user_id) do nothing;

-- 7. RLS. Team members read inputs and targets; admin / coach write.
-- A rep may write their own rostered-hours row (cold funnel, their own user_id).
alter table public.tracker_daily_inputs enable row level security;
alter table public.tracker_targets enable row level security;
alter table public.rep_comp_plans enable row level security;

drop policy if exists tracker_daily_inputs_read on public.tracker_daily_inputs;
create policy tracker_daily_inputs_read on public.tracker_daily_inputs
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'coach'::app_role)
    or public.has_role(auth.uid(), 'sales_rep'::app_role)
  );

drop policy if exists tracker_daily_inputs_manager_write on public.tracker_daily_inputs;
create policy tracker_daily_inputs_manager_write on public.tracker_daily_inputs
  for all to authenticated
  using (public.is_admin_or_coach(auth.uid()))
  with check (public.is_admin_or_coach(auth.uid()));

drop policy if exists tracker_daily_inputs_own_hours_insert on public.tracker_daily_inputs;
create policy tracker_daily_inputs_own_hours_insert on public.tracker_daily_inputs
  for insert to authenticated
  with check (funnel = 'cold' and user_id = auth.uid() and ad_spend is null and clicks is null and leads is null);

drop policy if exists tracker_daily_inputs_own_hours_update on public.tracker_daily_inputs;
create policy tracker_daily_inputs_own_hours_update on public.tracker_daily_inputs
  for update to authenticated
  using (funnel = 'cold' and user_id = auth.uid())
  with check (funnel = 'cold' and user_id = auth.uid() and ad_spend is null and clicks is null and leads is null);

drop policy if exists tracker_targets_read on public.tracker_targets;
create policy tracker_targets_read on public.tracker_targets
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'admin'::app_role)
    or public.has_role(auth.uid(), 'coach'::app_role)
    or public.has_role(auth.uid(), 'sales_rep'::app_role)
  );

drop policy if exists tracker_targets_manager_write on public.tracker_targets;
create policy tracker_targets_manager_write on public.tracker_targets
  for all to authenticated
  using (public.is_admin_or_coach(auth.uid()))
  with check (public.is_admin_or_coach(auth.uid()));

drop policy if exists rep_comp_plans_manager_all on public.rep_comp_plans;
create policy rep_comp_plans_manager_all on public.rep_comp_plans
  for all to authenticated
  using (public.is_admin_or_coach(auth.uid()))
  with check (public.is_admin_or_coach(auth.uid()));

grant select, insert, update, delete on public.tracker_daily_inputs to authenticated;
grant select, insert, update, delete on public.tracker_targets to authenticated;
grant select, insert, update, delete on public.rep_comp_plans to authenticated;

-- 8. "Missed (late or double booked)": a no-show WE caused. Reason codes must match src/lib/appointments.ts.
alter table public.pipeline_items drop constraint if exists pipeline_items_outcome_reason_vocab;
alter table public.pipeline_items add constraint pipeline_items_outcome_reason_vocab check (
  outcome_reason is null
  or outcome_reason in ('price_budget','think_partner','timing','agency_trust','other',
    'dq_too_small','dq_wrong_fit','dq_not_dm','dq_no_capacity',
    'ns_forgot','ns_ghosted','ns_emergency','ns_wrong_time','ns_other','ns_missed_by_us',
    'cx_not_interested','cx_competitor','cx_timing','cx_price','cx_other',
    'rs_prospect','rs_us','rs_clash',
    'rs_phone_no_laptop','rs_phone_not_quiet','rs_phone_driving','rs_phone_other'));
