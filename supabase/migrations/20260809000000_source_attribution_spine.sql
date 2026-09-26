-- Source attribution spine: show rate + close rate by lead source, across BOTH
-- meeting streams (GHL calendar bookings and dialer-native pipeline bookings).
--
-- Additive only. No existing column, RPC or dialer-queue behaviour is changed.
-- Already applied to prod (xhcvwhcpaeetmmzkuwyw) via query_database; this file is
-- the version-controlled record of that change.
--
-- Two design decisions worth keeping in mind:
--
-- 1. `outcome` is a DIALER-OWNED column, separate from `appointment_status`.
--    sync_ghl_appointments upserts every 15 minutes and overwrites
--    appointment_status from GHL, so a rep's disposition written there would be
--    clobbered on the next run. `resolved_outcome` prefers ours, falls back to GHL.
--
-- 2. Attribution is SNAPSHOTTED onto the appointment at first link, so later edits
--    to a contact's lead_channel do not silently rewrite historical reporting.

-- ── 1. Columns ────────────────────────────────────────────────────────────────

alter table public.ghl_appointments
  add column if not exists outcome              text,
  add column if not exists outcome_notes        text,
  add column if not exists outcome_recorded_at  timestamptz,
  add column if not exists outcome_recorded_by  uuid,
  add column if not exists attributed_channel   text,
  add column if not exists attributed_source    text,
  add column if not exists attributed_at        timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ghl_appointments_outcome_chk') then
    alter table public.ghl_appointments
      add constraint ghl_appointments_outcome_chk
      check (outcome is null or outcome in ('showed','noshow','cancelled','rescheduled','invalid'));
  end if;
end $$;

create index if not exists idx_ghl_appointments_start_time on public.ghl_appointments (start_time);
create index if not exists idx_ghl_appointments_contact    on public.ghl_appointments (contact_id);
create index if not exists idx_ghl_appointments_attr       on public.ghl_appointments (attributed_channel, attributed_source);

-- ── 2. Channel normalisation ──────────────────────────────────────────────────
-- The data carries both 'ads' (webhook inserts) and 'Ads' (imports); without this
-- every chart splits one channel into two rows.

create or replace function public.normalise_lead_channel(_v text)
returns text language sql immutable set search_path to 'public' as $fn$
  select case lower(btrim(coalesce(_v, '')))
    when ''               then null
    when 'ads'            then 'Ads'
    when 'linkedin'       then 'LinkedIn'
    when 'cold email'     then 'Cold Email'
    when 'cold call'      then 'Cold Call'
    when 'website'        then 'Website'
    when 'referral'       then 'Referral'
    when 'partnership'    then 'Partnership'
    when 'student'        then 'Student'
    when 'legacy/import'  then 'Legacy/Import'
    when 'booked session' then 'Booked Session'
    when 'other'          then 'Other'
    else initcap(btrim(_v))
  end;
$fn$;

-- lead_type='cold' maps exactly onto the 31,018 contacts with a null lead_channel:
-- the cold outbound list is not unattributable, it is simply unlabelled.
create or replace function public.contact_channel(_lead_channel text, _lead_type text)
returns text language sql immutable set search_path to 'public' as $fn$
  select coalesce(
    public.normalise_lead_channel(_lead_channel),
    case when lower(coalesce(_lead_type,'')) in ('cold','outbound') then 'Cold Call' end,
    'Unattributed'
  );
$fn$;

-- ── 3. Link + attribution-snapshot trigger ────────────────────────────────────

create or replace function public.link_ghl_appointment_contact()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.contact_id is null and new.ghl_contact_id is not null then
    select c.id into new.contact_id from contacts c
     where c.ghl_contact_id = new.ghl_contact_id
        or c.ghl_contact_id_legacy = new.ghl_contact_id
     limit 1;
  end if;

  if new.contact_id is not null and new.attributed_at is null then
    select public.normalise_lead_channel(c.lead_channel),
           nullif(btrim(c.lead_source), ''),
           now()
      into new.attributed_channel, new.attributed_source, new.attributed_at
      from contacts c where c.id = new.contact_id;
  end if;

  return new;
end;
$fn$;

-- Previously BEFORE INSERT OR UPDATE OF ghl_contact_id, which meant an appointment
-- that arrived before its contact existed could never link once that contact was
-- later imported. Fire on every update so late-arriving contacts retro-link.
drop trigger if exists trg_ghl_appointments_link on public.ghl_appointments;
create trigger trg_ghl_appointments_link
  before insert or update on public.ghl_appointments
  for each row execute function public.link_ghl_appointment_contact();

-- Relink pass for rows already sitting unlinked; safe to call from the sync cron.
create or replace function public.relink_ghl_appointments()
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_linked int; v_snapshotted int;
begin
  update ghl_appointments a set contact_id = c.id
    from contacts c
   where a.contact_id is null and a.ghl_contact_id is not null
     and (c.ghl_contact_id = a.ghl_contact_id or c.ghl_contact_id_legacy = a.ghl_contact_id);
  get diagnostics v_linked = row_count;

  update ghl_appointments a
     set attributed_channel = public.normalise_lead_channel(c.lead_channel),
         attributed_source  = nullif(btrim(c.lead_source), ''),
         attributed_at      = now()
    from contacts c
   where a.contact_id = c.id and a.attributed_at is null;
  get diagnostics v_snapshotted = row_count;

  return jsonb_build_object('linked', v_linked, 'snapshotted', v_snapshotted);
end;
$fn$;

-- ── 4. Unified meetings view ──────────────────────────────────────────────────
-- Two booking streams exist and both must be counted:
--   'ghl'    — GHL calendar bookings (ads/inbound). Well synced, badly dispositioned.
--   'dialer' — pipeline_items of type 'booked' (cold outbound). Well dispositioned.
-- All 13 client_deals trace to the dialer stream, so a GHL-only report shows zero
-- closes and reads as though nothing works.

create or replace view public.v_meetings_unified as
select
  'ghl'::text                              as stream,
  a.id                                     as id,
  a.contact_id,
  coalesce(a.calendar_name,'GHL calendar') as meeting_type,
  a.title,
  a.start_time,
  a.booked_at,
  null::uuid                               as assigned_user_id,
  a.ghl_assigned_user_id                   as ghl_user_id,
  a.meeting_link,
  coalesce(
    a.outcome,
    case a.appointment_status
      when 'showed' then 'showed' when 'noshow' then 'noshow'
      when 'cancelled' then 'cancelled' when 'invalid' then 'invalid' else null end,
    case when a.start_time >= now() then 'upcoming' else 'pending' end
  )                                        as resolved_outcome,
  (a.outcome is not null)                  as dialer_dispositioned,
  coalesce(a.attributed_channel, public.contact_channel(c.lead_channel, c.lead_type)) as channel,
  coalesce(a.attributed_source, nullif(btrim(c.lead_source),''), 'Unknown')           as source,
  (a.contact_id is not null)               as is_linked,
  c.business_name, c.contact_person, c.phone, c.lifecycle_stage, c.owner_id,
  d.first_deal_at, d.total_amount, d.mrr,
  (d.first_deal_at is not null and d.first_deal_at >= coalesce(a.booked_at, a.start_time)::date) as led_to_deal
from public.ghl_appointments a
left join public.contacts c on c.id = a.contact_id
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
  pi.assigned_user_id,
  null::text,
  null::text,
  case
    when pi.status = 'canceled'                 then 'cancelled'
    when pi.appointment_outcome = 'no_show'     then 'noshow'
    when pi.appointment_outcome = 'rescheduled' then 'rescheduled'
    when pi.appointment_outcome is not null     then 'showed'
    when pi.scheduled_for >= now()              then 'upcoming'
    else 'pending'
  end,
  (pi.appointment_outcome is not null),
  public.contact_channel(c.lead_channel, c.lead_type),
  coalesce(nullif(btrim(c.lead_source),''), 'Unknown'),
  true,
  c.business_name, c.contact_person, c.phone, c.lifecycle_stage, c.owner_id,
  d.first_deal_at, d.total_amount, d.mrr,
  (d.first_deal_at is not null and d.first_deal_at >= coalesce(pi.created_at, pi.scheduled_for)::date)
from public.pipeline_items pi
join public.contacts c on c.id = pi.contact_id
left join lateral (
  select min(cd.start_date) first_deal_at, sum(cd.amount) total_amount,
         sum(case cd.billing_period when 'monthly' then cd.amount
                                    when 'weekly' then cd.amount*52.0/12.0 else 0 end) mrr
  from public.client_deals cd where cd.contact_id = pi.contact_id and cd.status <> 'churned'
) d on true
where pi.pipeline_type = 'booked';

-- security_invoker is REQUIRED here, not cosmetic. client_deals restricts SELECT to
-- admin/coach, and this view joins it for revenue and led_to_deal. Without
-- security_invoker the view would run as its owner and expose every client's deal
-- value to any authenticated rep who opened the Meetings page. With it, a rep sees
-- the meeting but the client_deals lateral returns nothing for them.
alter view public.v_meetings_unified set (security_invoker = true);

-- ── 5. Source funnel RPC ──────────────────────────────────────────────────────
-- Distinct-contact metrics (close rate) cannot be summed across pre-aggregated
-- buckets, so this aggregates the whole window in one pass.
--   _basis 'scheduled' = bucket by meeting date  (correct for show rate)
--   _basis 'booked'    = bucket by booking date  (correct for lead-gen volume)

drop function if exists public.get_source_funnel(timestamptz, timestamptz, text, text);

create or replace function public.get_source_funnel(
  _from timestamptz, _to timestamptz, _basis text default 'scheduled',
  _group text default 'channel', _stream text default 'all'
) returns table (
  channel text, source text, meetings_booked bigint, showed bigint, noshow bigint,
  cancelled bigint, pending bigint, upcoming bigint, contacts_booked bigint,
  contacts_showed bigint, contacts_won bigint, total_amount numeric, mrr numeric,
  show_rate_pct numeric, close_from_show_pct numeric, close_from_booked_pct numeric
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
      count(*) filter (where f.resolved_outcome='pending') pending,
      count(*) filter (where f.resolved_outcome='upcoming') upcoming,
      count(distinct f.contact_id) contacts_booked,
      count(distinct f.contact_id) filter (where f.resolved_outcome='showed') contacts_showed,
      count(distinct f.contact_id) filter (where f.led_to_deal) contacts_won
    from filtered f group by f.channel, f.grp
  ),
  -- Revenue is summed over DISTINCT contacts: a contact with three meetings would
  -- otherwise count three times, and sum(distinct amount) would collapse two
  -- clients who happen to be on the same price.
  rev as (
    select w.channel, w.grp, sum(w.total_amount) total_amount, sum(w.mrr) mrr
      from (select distinct f.channel, f.grp, f.contact_id, f.total_amount, f.mrr
              from filtered f where f.led_to_deal) w
     group by w.channel, w.grp
  )
  select a.channel, a.grp, a.meetings_booked, a.showed, a.noshow, a.cancelled,
         a.pending, a.upcoming, a.contacts_booked, a.contacts_showed, a.contacts_won,
         coalesce(r.total_amount,0), coalesce(r.mrr,0),
         -- Show rate excludes 'pending' and 'cancelled' from the denominator:
         -- an undispositioned meeting is unknown, not a no-show.
         round(100.0*a.showed/nullif(a.showed+a.noshow,0),1),
         round(100.0*a.contacts_won/nullif(a.contacts_showed,0),1),
         round(100.0*a.contacts_won/nullif(a.contacts_booked,0),1)
    from agg a left join rev r on r.channel=a.channel and r.grp=a.grp
   order by a.meetings_booked desc;
$fn$;

-- ── 6. Disposition RPC ────────────────────────────────────────────────────────

create or replace function public.set_appointment_outcome(
  _appointment_id uuid, _outcome text, _notes text default null
) returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if _outcome is not null and _outcome not in ('showed','noshow','cancelled','rescheduled','invalid') then
    raise exception 'Invalid outcome: %', _outcome;
  end if;
  update ghl_appointments
     set outcome = _outcome,
         outcome_notes = _notes,
         outcome_recorded_at = case when _outcome is null then null else now() end,
         outcome_recorded_by = case when _outcome is null then null else auth.uid() end
   where id = _appointment_id;
end;
$fn$;

-- ── 7. Backfill + access ──────────────────────────────────────────────────────

select public.relink_ghl_appointments();

grant select on public.v_meetings_unified to authenticated;
grant execute on function public.get_source_funnel(timestamptz, timestamptz, text, text, text) to authenticated;
grant execute on function public.set_appointment_outcome(uuid, text, text) to authenticated;
grant execute on function public.relink_ghl_appointments() to authenticated;
