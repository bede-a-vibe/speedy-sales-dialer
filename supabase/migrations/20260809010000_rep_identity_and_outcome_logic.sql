-- Rep identity + meeting outcome logic.
--
-- Already applied to prod (xhcvwhcpaeetmmzkuwyw) via query_database; this file is
-- the version-controlled record.
--
-- Problem this solves: meetings sync in from GHL calendars, but the person who
-- took the meeting often has no dialer login, so nobody can say what happened.
-- Matteo Banzon had 159 meetings and 126 of them unrecorded for exactly this
-- reason. Identity has to work before outcomes can.

-- ── 1. GHL users ──────────────────────────────────────────────────────────────
-- Mirror of the GHL location's user list, so the account gap is visible and
-- Dialpad (which costs money per seat) can be tracked separately from a dialer
-- login (which does not).

create table if not exists public.ghl_users (
  ghl_user_id         text primary key,
  name                text,
  first_name          text,
  last_name           text,
  email               text,
  phone               text,
  ghl_role            text,
  ghl_type            text,
  is_deleted          boolean not null default false,
  takes_meetings      boolean not null default false,
  needs_dialpad       boolean not null default false,
  provisioned_user_id uuid,
  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.ghl_users enable row level security;

drop policy if exists ghl_users_read on public.ghl_users;
create policy ghl_users_read on public.ghl_users
  for select to authenticated using (public.is_admin_or_coach(auth.uid()));

drop policy if exists ghl_users_write on public.ghl_users;
create policy ghl_users_write on public.ghl_users
  for all to authenticated
  using (public.is_admin_or_coach(auth.uid()))
  with check (public.is_admin_or_coach(auth.uid()));

drop trigger if exists trg_ghl_users_updated_at on public.ghl_users;
create trigger trg_ghl_users_updated_at before update on public.ghl_users
  for each row execute function public.update_updated_at_column();

-- ── 2. Outcome reasons + reschedule tracking ──────────────────────────────────

alter table public.ghl_appointments
  add column if not exists outcome_reason      text,
  add column if not exists reschedule_count    integer not null default 0,
  add column if not exists original_start_time timestamptz;

-- Append-only history. The current row holds only the LATEST state, which is not
-- enough: a meeting that was no-showed and then rebooked would otherwise lose the
-- no-show entirely when the new sitting is recorded.
create table if not exists public.meeting_outcome_log (
  id             uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.ghl_appointments(id) on delete cascade,
  scheduled_for  timestamptz,
  outcome        text,
  outcome_reason text,
  notes          text,
  recorded_by    uuid,
  recorded_at    timestamptz not null default now(),
  source         text not null default 'rep'   -- 'rep' | 'ghl' | 'system'
);

create index if not exists idx_meeting_outcome_log_appt
  on public.meeting_outcome_log (appointment_id, recorded_at desc);

alter table public.meeting_outcome_log enable row level security;

drop policy if exists meeting_outcome_log_read on public.meeting_outcome_log;
create policy meeting_outcome_log_read on public.meeting_outcome_log
  for select to authenticated using (true);

drop policy if exists meeting_outcome_log_insert on public.meeting_outcome_log;
create policy meeting_outcome_log_insert on public.meeting_outcome_log
  for insert to authenticated with check (true);

-- ── 3. Reschedule detection ───────────────────────────────────────────────────
-- GHL reschedules an appointment by moving start_time on the SAME event id, so
-- the move is invisible unless it is detected here. Three things have to be true
-- afterwards: the move is counted, the old sitting's outcome is not lost, and the
-- new sitting does not inherit a stale outcome.

create or replace function public.handle_appointment_reschedule()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.start_time is distinct from old.start_time
     and old.start_time is not null and new.start_time is not null then

    new.reschedule_count    := coalesce(old.reschedule_count, 0) + 1;
    new.original_start_time := coalesce(old.original_start_time, old.start_time);

    if old.outcome is not null then
      insert into meeting_outcome_log
        (appointment_id, scheduled_for, outcome, outcome_reason, notes, recorded_by, recorded_at, source)
      values
        (old.id, old.start_time, old.outcome, old.outcome_reason, old.outcome_notes,
         old.outcome_recorded_by, coalesce(old.outcome_recorded_at, now()), 'rep');
    end if;

    insert into meeting_outcome_log
      (appointment_id, scheduled_for, outcome, outcome_reason, notes, recorded_at, source)
    values
      (old.id, old.start_time, 'rescheduled', null,
       'Moved to ' || to_char(new.start_time at time zone 'Australia/Melbourne', 'YYYY-MM-DD HH24:MI'),
       now(), 'ghl');

    if new.start_time > now() then
      new.outcome             := null;
      new.outcome_reason      := null;
      new.outcome_notes       := null;
      new.outcome_recorded_at := null;
      new.outcome_recorded_by := null;
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_ghl_appointments_reschedule on public.ghl_appointments;
create trigger trg_ghl_appointments_reschedule
  before update on public.ghl_appointments
  for each row execute function public.handle_appointment_reschedule();

-- ── 4. Disposition RPC with mandatory reasons ─────────────────────────────────

drop function if exists public.set_appointment_outcome(uuid, text, text);

create or replace function public.set_appointment_outcome(
  _appointment_id uuid, _outcome text, _reason text default null, _notes text default null
) returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_start timestamptz;
begin
  if _outcome is not null and _outcome not in ('showed','noshow','cancelled','rescheduled','invalid') then
    raise exception 'Invalid outcome: %', _outcome;
  end if;

  -- A reason is mandatory for the two outcomes whose "why" is the whole point of
  -- recording them. Without it the cancelled/no-show buckets fill with rows
  -- nobody can act on.
  if _outcome in ('cancelled','noshow') and coalesce(btrim(_reason),'') = '' then
    raise exception 'A reason is required when marking a meeting as %', _outcome;
  end if;

  select start_time into v_start from ghl_appointments where id = _appointment_id;

  update ghl_appointments
     set outcome             = _outcome,
         outcome_reason      = _reason,
         outcome_notes       = _notes,
         outcome_recorded_at = case when _outcome is null then null else now() end,
         outcome_recorded_by = case when _outcome is null then null else auth.uid() end
   where id = _appointment_id;

  if _outcome is not null then
    insert into meeting_outcome_log
      (appointment_id, scheduled_for, outcome, outcome_reason, notes, recorded_by, source)
    values (_appointment_id, v_start, _outcome, _reason, _notes, auth.uid(), 'rep');
  end if;
end;
$fn$;

-- ── 5. Unified view gains rep identity + reschedule data ──────────────────────
-- (Full definition; a plain CREATE OR REPLACE cannot reorder view columns.)

drop view if exists public.v_meetings_unified;

create view public.v_meetings_unified as
select
  'ghl'::text                              as stream,
  a.id                                     as id,
  a.contact_id,
  coalesce(a.calendar_name,'GHL calendar') as meeting_type,
  a.title,
  a.start_time,
  a.booked_at,
  a.original_start_time,
  a.reschedule_count,
  null::uuid                               as assigned_user_id,
  a.ghl_assigned_user_id                   as ghl_user_id,
  coalesce(gu.name, 'Unassigned')          as rep_name,
  gu.provisioned_user_id                   as rep_user_id,
  a.meeting_link,
  coalesce(
    a.outcome,
    case a.appointment_status
      when 'showed' then 'showed' when 'noshow' then 'noshow'
      when 'cancelled' then 'cancelled' when 'invalid' then 'invalid' else null end,
    case when a.start_time >= now() then 'upcoming' else 'pending' end
  )                                        as resolved_outcome,
  a.outcome_reason,
  a.outcome_notes,
  (a.outcome is not null)                  as dialer_dispositioned,
  coalesce(a.attributed_channel, public.contact_channel(c.lead_channel, c.lead_type)) as channel,
  coalesce(a.attributed_source, nullif(btrim(c.lead_source),''), 'Unknown')           as source,
  (a.contact_id is not null)               as is_linked,
  c.business_name, c.contact_person, c.phone, c.lifecycle_stage, c.owner_id,
  d.first_deal_at, d.total_amount, d.mrr,
  (d.first_deal_at is not null and d.first_deal_at >= coalesce(a.booked_at, a.start_time)::date) as led_to_deal
from public.ghl_appointments a
left join public.contacts c on c.id = a.contact_id
left join public.ghl_users gu on gu.ghl_user_id = a.ghl_assigned_user_id
left join lateral (
  select min(cd.start_date) first_deal_at, sum(cd.amount) total_amount,
         sum(case cd.billing_period when 'monthly' then cd.amount
                                    when 'weekly' then cd.amount*52.0/12.0 else 0 end) mrr
  from public.client_deals cd where cd.contact_id = a.contact_id and cd.status <> 'churned'
) d on true

union all

select
  'dialer'::text,
  pi.id,
  pi.contact_id,
  'Dialer booking',
  nullif(btrim(pi.notes),''),
  pi.scheduled_for,
  pi.created_at,
  null::timestamptz,
  coalesce(pi.reschedule_count, 0),
  pi.assigned_user_id,
  pr.ghl_user_id,
  coalesce(pr.display_name, pr.email, 'Unassigned'),
  pi.assigned_user_id,
  null::text,
  case
    when pi.status = 'canceled'                 then 'cancelled'
    when pi.appointment_outcome = 'no_show'     then 'noshow'
    when pi.appointment_outcome = 'rescheduled' then 'rescheduled'
    when pi.appointment_outcome is not null     then 'showed'
    when pi.scheduled_for >= now()              then 'upcoming'
    else 'pending'
  end,
  pi.appointment_outcome::text,
  nullif(btrim(pi.outcome_notes),''),
  (pi.appointment_outcome is not null),
  public.contact_channel(c.lead_channel, c.lead_type),
  coalesce(nullif(btrim(c.lead_source),''), 'Unknown'),
  true,
  c.business_name, c.contact_person, c.phone, c.lifecycle_stage, c.owner_id,
  d.first_deal_at, d.total_amount, d.mrr,
  (d.first_deal_at is not null and d.first_deal_at >= coalesce(pi.created_at, pi.scheduled_for)::date)
from public.pipeline_items pi
join public.contacts c on c.id = pi.contact_id
left join public.profiles pr on pr.user_id = pi.assigned_user_id
left join lateral (
  select min(cd.start_date) first_deal_at, sum(cd.amount) total_amount,
         sum(case cd.billing_period when 'monthly' then cd.amount
                                    when 'weekly' then cd.amount*52.0/12.0 else 0 end) mrr
  from public.client_deals cd where cd.contact_id = pi.contact_id and cd.status <> 'churned'
) d on true
where pi.pipeline_type = 'booked';

-- Required, not cosmetic: this view joins client_deals, whose SELECT policy is
-- admin/coach only. Without security_invoker every rep would see deal values.
alter view public.v_meetings_unified set (security_invoker = true);
grant select on public.v_meetings_unified to authenticated;

-- ── 6. Funnel RPCs ────────────────────────────────────────────────────────────

drop function if exists public.get_source_funnel(timestamptz, timestamptz, text, text, text);

create function public.get_source_funnel(
  _from timestamptz, _to timestamptz, _basis text default 'scheduled',
  _group text default 'channel', _stream text default 'all'
) returns table (
  channel text, source text, meetings_booked bigint, showed bigint, noshow bigint,
  cancelled bigint, rescheduled bigint, reschedules bigint, pending bigint, upcoming bigint,
  contacts_booked bigint, contacts_showed bigint, contacts_won bigint,
  total_amount numeric, mrr numeric,
  show_rate_pct numeric, reschedule_rate_pct numeric,
  close_from_show_pct numeric, close_from_booked_pct numeric
) language sql stable security invoker set search_path to 'public' as $fn$
  with filtered as (
    select v.*, case when _group = 'source' then v.source else 'All sources' end as grp
      from public.v_meetings_unified v
     where (case when _basis='booked' then coalesce(v.booked_at, v.start_time) else v.start_time end) >= _from
       and (case when _basis='booked' then coalesce(v.booked_at, v.start_time) else v.start_time end) <  _to
       and (_stream = 'all' or v.stream = _stream)
  ),
  agg as (
    select f.channel, f.grp,
      count(*) meetings_booked,
      count(*) filter (where f.resolved_outcome='showed') showed,
      count(*) filter (where f.resolved_outcome='noshow') noshow,
      count(*) filter (where f.resolved_outcome='cancelled') cancelled,
      count(*) filter (where f.resolved_outcome='rescheduled') rescheduled,
      -- Times meetings were MOVED, which is not the same as how many currently
      -- sit in a 'rescheduled' state: one meeting moved three times and then
      -- showed contributes 3 here and 0 to `rescheduled`.
      coalesce(sum(f.reschedule_count), 0) reschedules,
      count(*) filter (where f.resolved_outcome='pending') pending,
      count(*) filter (where f.resolved_outcome='upcoming') upcoming,
      count(distinct f.contact_id) contacts_booked,
      count(distinct f.contact_id) filter (where f.resolved_outcome='showed') contacts_showed,
      count(distinct f.contact_id) filter (where f.led_to_deal) contacts_won,
      count(*) filter (where f.reschedule_count > 0) moved_at_least_once
    from filtered f group by f.channel, f.grp
  ),
  rev as (
    select w.channel, w.grp, sum(w.total_amount) total_amount, sum(w.mrr) mrr
      from (select distinct f.channel, f.grp, f.contact_id, f.total_amount, f.mrr
              from filtered f where f.led_to_deal) w
     group by w.channel, w.grp
  )
  select a.channel, a.grp, a.meetings_booked, a.showed, a.noshow, a.cancelled,
         a.rescheduled, a.reschedules, a.pending, a.upcoming,
         a.contacts_booked, a.contacts_showed, a.contacts_won,
         coalesce(r.total_amount,0), coalesce(r.mrr,0),
         -- Only showed vs noshow. A rescheduled or cancelled meeting is not a
         -- no-show, and an undispositioned one is unknown, not absent.
         round(100.0*a.showed/nullif(a.showed+a.noshow,0),1),
         round(100.0*a.moved_at_least_once/nullif(a.meetings_booked,0),1),
         round(100.0*a.contacts_won/nullif(a.contacts_showed,0),1),
         round(100.0*a.contacts_won/nullif(a.contacts_booked,0),1)
    from agg a left join rev r on r.channel=a.channel and r.grp=a.grp
   order by a.meetings_booked desc;
$fn$;

create or replace function public.get_rep_meeting_stats(_from timestamptz, _to timestamptz)
returns table (
  ghl_user_id text, rep_name text, rep_user_id uuid, has_dialer_account boolean,
  meetings_booked bigint, showed bigint, noshow bigint, cancelled bigint,
  rescheduled bigint, reschedules bigint, pending bigint, upcoming bigint,
  contacts_won bigint, show_rate_pct numeric, reschedule_rate_pct numeric
) language sql stable security invoker set search_path to 'public' as $fn$
  select
    v.ghl_user_id, v.rep_name, v.rep_user_id, (v.rep_user_id is not null),
    count(*),
    count(*) filter (where v.resolved_outcome='showed'),
    count(*) filter (where v.resolved_outcome='noshow'),
    count(*) filter (where v.resolved_outcome='cancelled'),
    count(*) filter (where v.resolved_outcome='rescheduled'),
    coalesce(sum(v.reschedule_count), 0),
    count(*) filter (where v.resolved_outcome='pending'),
    count(*) filter (where v.resolved_outcome='upcoming'),
    count(distinct v.contact_id) filter (where v.led_to_deal),
    round(100.0 * count(*) filter (where v.resolved_outcome='showed')
          / nullif(count(*) filter (where v.resolved_outcome in ('showed','noshow')), 0), 1),
    round(100.0 * count(*) filter (where v.reschedule_count > 0) / nullif(count(*), 0), 1)
  from public.v_meetings_unified v
  where v.start_time >= _from and v.start_time < _to
  group by v.ghl_user_id, v.rep_name, v.rep_user_id
  order by count(*) desc;
$fn$;

grant execute on function public.set_appointment_outcome(uuid, text, text, text) to authenticated;
grant execute on function public.get_source_funnel(timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.get_rep_meeting_stats(timestamptz, timestamptz) to authenticated;
