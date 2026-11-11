-- Every reschedule is its own slot, 11 Nov 2026.
--
-- Bede's show-up rule (12 Oct 2026): showed / (showed + no-show + cancelled +
-- rescheduled). Until now a move overwrote the booking: the row's date jumped
-- to the new time and the missed slot vanished from its own week. The row then
-- read "rescheduled" only until the new meeting got an outcome, so a reschedule
-- never stayed in the show rate.
--
-- Now:
--   1. public.meeting_reschedules logs every move: the slot that was missed
--      (from_scheduled_for), the new time, and the reason (rs_*). A trigger on
--      pipeline_items writes it whenever reschedule_count goes up, which covers
--      both writers (the app's Reschedule action and the GHL mirror trigger).
--   2. resolve_meeting_bucket no longer calls the moved booking itself
--      "rescheduled". It is upcoming until its new time, then needs an outcome.
--      The "rescheduled" bucket now comes from the logged slots, on the day the
--      slot was missed.
--   3. v_reschedule_slots exposes the slots in v_meetings_unified's shape;
--      get_source_funnel and get_rep_meeting_stats count them in the show-up
--      buckets but never as a meeting booked.
-- The app reads the same table (useRescheduleSlots) for the Custom Monitor,
-- Funnel, Closing tracker and dashboards.

-- 1. The log --------------------------------------------------------------
create table if not exists public.meeting_reschedules (
  id uuid primary key default gen_random_uuid(),
  pipeline_item_id uuid not null references public.pipeline_items(id) on delete cascade,
  contact_id uuid,
  from_scheduled_for timestamptz not null,
  to_scheduled_for timestamptz,
  reason text,
  notes text,
  moved_at timestamptz not null default now(),
  moved_by uuid,
  source text not null default 'trigger',
  -- 'entry_error': the dialer date was typed differently from the GHL booking
  -- made on the same call and was corrected to match it. Logged as a reschedule
  -- (Bede, 11 Nov 2026) but not counted as a missed slot in show-up rates.
  kind text not null default 'move' check (kind in ('move','entry_error')),
  created_at timestamptz not null default now(),
  unique (pipeline_item_id, from_scheduled_for)
);
alter table public.meeting_reschedules add column if not exists kind text not null default 'move' check (kind in ('move','entry_error'));

-- Entry error signals: the GHL event at the new time was created within 3h of
-- the dialer booking, and either it is being inserted right now (the mirror
-- trigger is aligning the dialer row to it) or it has never itself moved.
create or replace function public.reschedule_kind(_pipeline_item_id uuid, _to timestamptz)
returns text language sql stable security definer set search_path to 'public' as $$
  select case when exists (
    select 1 from pipeline_items p
      join ghl_appointments a on a.contact_id = p.contact_id
     where p.id = _pipeline_item_id
       and a.start_time = _to
       and a.booked_at is not null
       and abs(extract(epoch from (a.booked_at - p.created_at))) <= 3 * 3600
       and (a.created_at = now() or a.raw->>'rescheduledAt' is null)
  ) then 'entry_error' else 'move' end;
$$;
create index if not exists meeting_reschedules_from_idx on public.meeting_reschedules (from_scheduled_for);
create index if not exists meeting_reschedules_item_idx on public.meeting_reschedules (pipeline_item_id);

alter table public.meeting_reschedules enable row level security;
drop policy if exists "Team members can view meeting reschedules" on public.meeting_reschedules;
create policy "Team members can view meeting reschedules" on public.meeting_reschedules
  for select to authenticated using (is_team_member(auth.uid()));
drop policy if exists "Admins can manage meeting reschedules" on public.meeting_reschedules;
create policy "Admins can manage meeting reschedules" on public.meeting_reschedules
  for all to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));

create or replace function public.log_meeting_reschedule()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.pipeline_type <> 'booked' then return new; end if;

  if coalesce(new.reschedule_count, 0) > coalesce(old.reschedule_count, 0) then
    if old.scheduled_for is not null then
      insert into meeting_reschedules (pipeline_item_id, contact_id, from_scheduled_for, to_scheduled_for, reason, moved_by, kind)
      values (new.id, new.contact_id, old.scheduled_for, new.scheduled_for,
              case when new.outcome_reason ~ '^rs_' then new.outcome_reason end, auth.uid(),
              reschedule_kind(new.id, new.scheduled_for))
      on conflict (pipeline_item_id, from_scheduled_for) do update
        set to_scheduled_for = excluded.to_scheduled_for,
            reason = coalesce(excluded.reason, meeting_reschedules.reason),
            kind = excluded.kind;
    end if;
  elsif coalesce(new.reschedule_count, 0) < coalesce(old.reschedule_count, 0) then
    -- A reschedule undone: drop the newest logged slot.
    delete from meeting_reschedules
     where id = (select id from meeting_reschedules where pipeline_item_id = new.id order by moved_at desc limit 1);
  elsif new.outcome_reason ~ '^rs_' and new.outcome_reason is distinct from old.outcome_reason then
    -- Reason recorded after the move: it belongs to the latest slot without one.
    update meeting_reschedules set reason = new.outcome_reason
     where id = (select id from meeting_reschedules where pipeline_item_id = new.id and reason is null
                  order by moved_at desc limit 1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_meeting_reschedule on public.pipeline_items;
create trigger trg_log_meeting_reschedule
  after update of reschedule_count, outcome_reason on public.pipeline_items
  for each row execute function public.log_meeting_reschedule();

-- Backfill from pipeline_audit (complete since 23 Sep 2026). A count bump
-- without a date change in the same audit row was a date fixed first and
-- logged as a reschedule afterwards (11 Nov: Neil, Integral, Cube, On The
-- Line), so the missed slot is the "from" of the latest date change that had
-- no count bump of its own.
insert into public.meeting_reschedules (pipeline_item_id, contact_id, from_scheduled_for, to_scheduled_for, moved_at, source)
select ev.pipeline_item_id, p.contact_id,
       coalesce(ev.sf_from,
                (select (a2.changes->'scheduled_for'->>'from')::timestamptz from pipeline_audit a2
                  where a2.pipeline_item_id = ev.pipeline_item_id and a2.changes ? 'scheduled_for'
                    and not (a2.changes ? 'reschedule_count') and a2.changed_at < ev.changed_at
                  order by a2.changed_at desc limit 1),
                p.scheduled_for),
       coalesce(ev.sf_to, p.scheduled_for), ev.changed_at, 'backfill'
  from (
    select a.pipeline_item_id, a.changed_at,
           (a.changes->'reschedule_count'->>'from')::int f, (a.changes->'reschedule_count'->>'to')::int t,
           (a.changes->'scheduled_for'->>'from')::timestamptz sf_from, (a.changes->'scheduled_for'->>'to')::timestamptz sf_to
      from pipeline_audit a where a.changes ? 'reschedule_count'
  ) ev
  join public.pipeline_items p on p.id = ev.pipeline_item_id and p.pipeline_type = 'booked'
 where ev.t > coalesce(ev.f, 0)
on conflict (pipeline_item_id, from_scheduled_for) do nothing;

update public.meeting_reschedules r set kind = reschedule_kind(r.pipeline_item_id, r.to_scheduled_for) where r.source = 'backfill';

-- Applied by hand on 11 Nov 2026 after checking each slot (not re-run here):
--   * kind corrected where the GHL copy was stale or not yet synced: Versatile
--     11 Nov 17:00 = move; Pidge, ACDC, Industry Energy, Urban Energy, and the
--     first time-shifts on Auscool (11 Nov 13:00) and Palm Coast (11 Nov 17:00)
--     = entry_error.
--   * Bright Future 16 Oct removed (its reschedule was undone, count reset to 0).
--   * Reasons from the GHL call and SMS transcripts written onto 16 slots;
--     entry errors given rs_us.
--   * Creek to Coast: the moved row 7fcffdf8 merged into its 10 Nov sitting
--     c9a69ddd (both slots moved across, row backed up then deleted).

-- The row's own reschedule reason (rs_*) belongs to its latest slot.
update public.meeting_reschedules r set reason = p.outcome_reason
  from public.pipeline_items p
 where p.id = r.pipeline_item_id and p.outcome_reason ~ '^rs_' and r.reason is null
   and r.moved_at = (select max(r2.moved_at) from public.meeting_reschedules r2 where r2.pipeline_item_id = r.pipeline_item_id);

-- 2. The bucket rule ---------------------------------------------------------
create or replace function public.resolve_meeting_bucket(_outcome appointment_outcome, _status pipeline_status, _scheduled_for timestamp with time zone)
returns text
language sql
stable
set search_path to 'public'
as $function$
  SELECT CASE
    -- A disqualification is a sitting with a verdict: they turned up and were
    -- judged not qualified. Checked FIRST because a DQ'd row can also carry
    -- status = 'canceled', and the outcome is the truth about attendance.
    WHEN _outcome = 'disqualified'       THEN 'showed'
    WHEN _status  = 'canceled'           THEN 'cancelled'
    WHEN _outcome = 'no_show'            THEN 'noshow'
    -- A moved booking is waiting on its NEW time. The slot it missed is a row
    -- in meeting_reschedules and is counted as "rescheduled" on its own day.
    WHEN _outcome = 'rescheduled'        THEN CASE WHEN _scheduled_for >= now() THEN 'upcoming' ELSE 'pending' END
    WHEN _outcome = 'cancelled'          THEN 'cancelled'
    WHEN _outcome IS NOT NULL            THEN 'showed'
    WHEN _scheduled_for >= now()         THEN 'upcoming'
    ELSE 'pending'
  END;
$function$;

do $$
declare
  past timestamptz := now() - interval '1 day';
  fut  timestamptz := now() + interval '1 day';
  bad text;
begin
  select string_agg(format('%s/%s/%s => %s, want %s', o, s, w, got, want), '; ') into bad from (
    select o, s, w, resolve_meeting_bucket(o::appointment_outcome, s::pipeline_status, case w when 'past' then past else fut end) got, want
      from (values
        ('rescheduled','open','future','upcoming'),
        ('rescheduled','open','past','pending'),
        ('rescheduled','canceled','past','cancelled'),
        ('no_show','completed','past','noshow'),
        ('disqualified','canceled','past','showed'),
        ('showed_closed','completed','past','showed'),
        ('cancelled','completed','past','cancelled'),
        (null,'open','future','upcoming'),
        (null,'open','past','pending')
      ) t(o, s, w, want)
  ) x where got is distinct from want;
  if bad is not null then raise exception 'resolve_meeting_bucket truth table failed: %', bad; end if;
end $$;

-- 3. Slots in the unified meeting shape -----------------------------------
create or replace view public.v_reschedule_slots with (security_invoker = true) as
select 'dialer'::text as stream,
       r.id,
       pi.contact_id,
       'Rescheduled slot'::text as meeting_type,
       NULLIF(btrim(coalesce(r.notes, '')), '') as title,
       r.from_scheduled_for as start_time,
       pi.created_at as booked_at,
       NULL::timestamptz as original_start_time,
       0 as reschedule_count,
       pi.assigned_user_id,
       pr.ghl_user_id,
       COALESCE(pr.display_name, pr.email, 'Unassigned'::text) as rep_name,
       pi.assigned_user_id as rep_user_id,
       NULL::text as meeting_link,
       'rescheduled'::text as resolved_outcome,
       r.reason as outcome_reason,
       NULL::text as outcome_notes,
       true as dialer_dispositioned,
       contact_channel(c.lead_channel, c.lead_type) as channel,
       COALESCE(NULLIF(btrim(c.lead_source), ''::text), 'Unknown'::text) as source,
       true as is_linked,
       c.business_name,
       c.contact_person,
       c.phone,
       c.lifecycle_stage,
       c.owner_id,
       NULL::date as first_deal_at,
       NULL::numeric as total_amount,
       NULL::numeric as mrr,
       false as led_to_deal
  from public.meeting_reschedules r
  join public.pipeline_items pi on pi.id = r.pipeline_item_id and pi.pipeline_type = 'booked'
  join public.contacts c on c.id = pi.contact_id
  left join public.profiles pr on pr.user_id = pi.assigned_user_id
 where r.kind = 'move';

grant select on public.v_reschedule_slots to authenticated;

create or replace function public.get_source_funnel(_from timestamp with time zone, _to timestamp with time zone, _basis text DEFAULT 'scheduled'::text, _group text DEFAULT 'channel'::text, _stream text DEFAULT 'all'::text)
 returns table(channel text, source text, meetings_booked bigint, showed bigint, noshow bigint, cancelled bigint, rescheduled bigint, reschedules bigint, pending bigint, upcoming bigint, contacts_booked bigint, contacts_showed bigint, contacts_won bigint, total_amount numeric, mrr numeric, show_rate_pct numeric, reschedule_rate_pct numeric, close_from_show_pct numeric, close_from_booked_pct numeric)
 language sql
 stable
 set search_path to 'public'
as $function$
  with base as (
    select u.*, (u.start_time at time zone 'Australia/Melbourne')::date as local_day
      from (select v.*, false as is_slot from public.v_meetings_unified v
            union all
            select s.*, true as is_slot from public.v_reschedule_slots s) u
     where coalesce(u.resolved_outcome,'') <> 'invalid'
       and coalesce(u.meeting_type,'') !~* 'onboard'
       and coalesce(u.title,'') !~* 'onboard'
  ),
  -- A setter booking lives in BOTH streams (dialer row + GHL calendar event).
  -- Keep the dialer row and drop its GHL twin: same contact, same local day.
  deduped as (
    select b.* from base b
     where b.stream = 'dialer'
        or b.contact_id is null
        or not exists (select 1 from base d where d.stream = 'dialer' and d.contact_id = b.contact_id and d.local_day = b.local_day)
  ),
  filtered as (
    select v.*, case when _group = 'source' then v.source else 'All sources' end as grp
      from deduped v
     where (case when _basis='booked' then coalesce(v.booked_at, v.start_time) else v.start_time end) >= _from
       and (case when _basis='booked' then coalesce(v.booked_at, v.start_time) else v.start_time end) <  _to
       and (_stream = 'all' or v.stream = _stream)
       -- On the booked basis a missed slot is not a booking.
       and not (_basis = 'booked' and v.is_slot)
  ),
  agg as (
    select f.channel, f.grp,
      count(*) filter (where not f.is_slot) meetings_booked,
      count(*) filter (where f.resolved_outcome='showed') showed,
      count(*) filter (where f.resolved_outcome='noshow') noshow,
      count(*) filter (where f.resolved_outcome='cancelled') cancelled,
      count(*) filter (where f.resolved_outcome='rescheduled') rescheduled,
      coalesce(sum(f.reschedule_count) filter (where not f.is_slot), 0) reschedules,
      count(*) filter (where f.resolved_outcome='pending') pending,
      count(*) filter (where f.resolved_outcome='upcoming') upcoming,
      count(distinct f.contact_id) filter (where not f.is_slot) contacts_booked,
      count(distinct f.contact_id) filter (where f.resolved_outcome='showed') contacts_showed,
      count(distinct f.contact_id) filter (where f.led_to_deal) contacts_won,
      count(*) filter (where f.reschedule_count > 0 and not f.is_slot) moved_at_least_once
    from filtered f group by f.channel, f.grp
  ),
  rev as (
    -- One-off = setup / one-off deals only; MRR = monthly retainers. Never the same number.
    select w.channel, w.grp, sum(w.one_off) total_amount, sum(w.mrr) mrr
      from (select distinct f.channel, f.grp, f.contact_id, f.mrr,
                   (select coalesce(sum(cd.amount), 0) from client_deals cd
                     where cd.contact_id = f.contact_id and cd.status <> 'churned' and cd.billing_period = 'one_off') as one_off
              from filtered f where f.led_to_deal) w
     group by w.channel, w.grp
  )
  select a.channel, a.grp, a.meetings_booked, a.showed, a.noshow, a.cancelled,
         a.rescheduled, a.reschedules, a.pending, a.upcoming,
         a.contacts_booked, a.contacts_showed, a.contacts_won,
         coalesce(r.total_amount,0), coalesce(r.mrr,0),
         -- Bede's definition: showed over every resolved slot (showed + no-show + cancelled + rescheduled).
         round(100.0*a.showed/nullif(a.showed+a.noshow+a.cancelled+a.rescheduled,0),1),
         round(100.0*a.moved_at_least_once/nullif(a.meetings_booked,0),1),
         round(100.0*a.contacts_won/nullif(a.contacts_showed,0),1),
         round(100.0*a.contacts_won/nullif(a.contacts_booked,0),1)
    from agg a left join rev r on r.channel=a.channel and r.grp=a.grp
   order by a.meetings_booked desc;
$function$;

create or replace function public.get_rep_meeting_stats(_from timestamp with time zone, _to timestamp with time zone, _include_former boolean DEFAULT false)
 returns table(ghl_user_id text, rep_name text, rep_user_id uuid, has_dialer_account boolean, is_active boolean, meetings_booked bigint, showed bigint, noshow bigint, cancelled bigint, rescheduled bigint, reschedules bigint, pending bigint, upcoming bigint, contacts_won bigint, show_rate_pct numeric, reschedule_rate_pct numeric)
 language sql
 stable
 set search_path to 'public'
as $function$
  with scoped as (
    select v.*,
           coalesce(
             (select t.is_active from v_team_members t
               where (t.dialer_user_id is not null and t.dialer_user_id = v.rep_user_id)
                  or (t.ghl_user_id is not null and t.ghl_user_id = v.ghl_user_id)
               limit 1),
             true
           ) as rep_active
      from (select m.*, false as is_slot from public.v_meetings_unified m
            union all
            select s.*, true as is_slot from public.v_reschedule_slots s) v
     where v.start_time >= _from and v.start_time < _to
  )
  select
    s.ghl_user_id, s.rep_name, s.rep_user_id, (s.rep_user_id is not null), bool_and(s.rep_active),
    count(*) filter (where not s.is_slot),
    count(*) filter (where s.resolved_outcome='showed'),
    count(*) filter (where s.resolved_outcome='noshow'),
    count(*) filter (where s.resolved_outcome='cancelled'),
    count(*) filter (where s.resolved_outcome='rescheduled'),
    coalesce(sum(s.reschedule_count) filter (where not s.is_slot), 0),
    count(*) filter (where s.resolved_outcome='pending'),
    count(*) filter (where s.resolved_outcome='upcoming'),
    count(distinct s.contact_id) filter (where s.led_to_deal),
    -- Bede's definition (12 Oct 2026): showed over every resolved slot
    -- (showed + no-show + cancelled + rescheduled); pending/upcoming stay out.
    -- Every missed slot of a moved meeting counts as rescheduled on its own day.
    round(100.0 * count(*) filter (where s.resolved_outcome='showed')
          / nullif(count(*) filter (where s.resolved_outcome in ('showed','noshow','cancelled','rescheduled')), 0), 1),
    round(100.0 * count(*) filter (where s.reschedule_count > 0 and not s.is_slot) / nullif(count(*) filter (where not s.is_slot), 0), 1)
  from scoped s
  where _include_former or s.rep_active
  group by s.ghl_user_id, s.rep_name, s.rep_user_id
  order by count(*) filter (where not s.is_slot) desc;
$function$;
