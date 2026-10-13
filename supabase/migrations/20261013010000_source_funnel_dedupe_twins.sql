-- Insights > Sources was double counting setter bookings: each lives in both streams
-- (dialer pipeline row + GHL calendar event). Keep the dialer row and drop its GHL twin
-- (same contact, same Melbourne day), leave out onboarding and invalid rows, use Bede's
-- show-up definition (showed over every resolved slot) and split one-off from MRR.
CREATE OR REPLACE FUNCTION public.get_source_funnel(_from timestamp with time zone, _to timestamp with time zone, _basis text DEFAULT 'scheduled'::text, _group text DEFAULT 'channel'::text, _stream text DEFAULT 'all'::text)
 RETURNS TABLE(channel text, source text, meetings_booked bigint, showed bigint, noshow bigint, cancelled bigint, rescheduled bigint, reschedules bigint, pending bigint, upcoming bigint, contacts_booked bigint, contacts_showed bigint, contacts_won bigint, total_amount numeric, mrr numeric, show_rate_pct numeric, reschedule_rate_pct numeric, close_from_show_pct numeric, close_from_booked_pct numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  with base as (
    select v.*, (v.start_time at time zone 'Australia/Melbourne')::date as local_day
      from public.v_meetings_unified v
     where coalesce(v.resolved_outcome,'') <> 'invalid'
       and coalesce(v.meeting_type,'') !~* 'onboard'
       and coalesce(v.title,'') !~* 'onboard'
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
  ),
  agg as (
    select f.channel, f.grp,
      count(*) meetings_booked,
      count(*) filter (where f.resolved_outcome='showed') showed,
      count(*) filter (where f.resolved_outcome='noshow') noshow,
      count(*) filter (where f.resolved_outcome='cancelled') cancelled,
      count(*) filter (where f.resolved_outcome='rescheduled') rescheduled,
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
