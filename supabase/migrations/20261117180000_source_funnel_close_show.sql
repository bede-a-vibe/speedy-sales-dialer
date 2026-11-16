-- 17 Nov 2026: Close / show counts only won contacts that also showed in the range
-- (Ads read 200%: GHL ad meetings with no outcome recorded still count as won).
-- Adds contacts_won_showed so the app's Total row uses the same rule.
DROP FUNCTION IF EXISTS public.get_source_funnel(timestamp with time zone, timestamp with time zone, text, text, text);
CREATE OR REPLACE FUNCTION public.get_source_funnel(_from timestamp with time zone, _to timestamp with time zone, _basis text DEFAULT 'scheduled'::text, _group text DEFAULT 'channel'::text, _stream text DEFAULT 'all'::text)
 RETURNS TABLE(channel text, source text, meetings_booked bigint, showed bigint, noshow bigint, cancelled bigint, rescheduled bigint, reschedules bigint, pending bigint, upcoming bigint, contacts_booked bigint, contacts_showed bigint, contacts_won bigint, total_amount numeric, mrr numeric, show_rate_pct numeric, reschedule_rate_pct numeric, close_from_show_pct numeric, close_from_booked_pct numeric, contacts_won_showed bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  with base as (
    select u.*, (u.start_time at time zone 'Australia/Melbourne')::date as local_day,
           case when u.stream = 'dialer' and not u.is_slot
                then (select count(*) from public.meeting_reschedules r where r.pipeline_item_id = u.id and r.kind = 'move')
                else coalesce(u.reschedule_count, 0) end as moves
      from (select v.*, false as is_slot from public.v_meetings_unified v
            union all
            select s.*, true as is_slot from public.v_reschedule_slots s) u
     where coalesce(u.resolved_outcome,'') <> 'invalid'
       and coalesce(u.meeting_type,'') !~* 'onboard'
       and coalesce(u.title,'') !~* 'onboard'
  ),
  shared_ghl as (
    select c.id from public.contacts c
     where c.ghl_contact_id is not null
       and exists (select 1 from public.contacts c2 where c2.ghl_contact_id = c.ghl_contact_id and c2.id <> c.id)
  ),
  deduped as (
    select b.* from base b
     where b.stream = 'dialer'
        or b.contact_id is null
        or (not exists (select 1 from base d where d.stream = 'dialer' and d.contact_id = b.contact_id and d.local_day = b.local_day)
            and b.contact_id not in (select id from shared_ghl))
  ),
  flagged as (
    select d.*,
      exists (select 1 from deduped e where e.contact_id = d.contact_id and not e.is_slot
                and e.resolved_outcome = 'showed' and e.local_day < d.local_day) as is_follow
      from deduped d
  ),
  filtered as (
    select v.*, case when _group = 'source' then v.source else 'All sources' end as grp
      from flagged v
     where (case when _basis='booked' then coalesce(v.booked_at, v.start_time) else v.start_time end) >= _from
       and (case when _basis='booked' then coalesce(v.booked_at, v.start_time) else v.start_time end) <  _to
       and (_stream = 'all' or v.stream = _stream)
       and not (_basis = 'booked' and v.is_slot)
  ),
  agg as (
    select f.channel, f.grp,
      count(*) filter (where not f.is_slot) meetings_booked,
      count(*) filter (where f.resolved_outcome='showed' and not f.is_follow) showed,
      count(*) filter (where f.resolved_outcome='noshow' and not f.is_follow) noshow,
      count(*) filter (where f.resolved_outcome='cancelled' and not f.is_follow) cancelled,
      count(*) filter (where f.resolved_outcome='rescheduled' and not f.is_follow) rescheduled,
      coalesce(sum(f.moves) filter (where not f.is_slot), 0) reschedules,
      count(*) filter (where f.resolved_outcome='pending') pending,
      count(*) filter (where f.resolved_outcome='upcoming') upcoming,
      count(distinct f.contact_id) filter (where not f.is_slot) contacts_booked,
      count(distinct f.contact_id) filter (where f.resolved_outcome='showed') contacts_showed,
      count(distinct f.contact_id) filter (where f.led_to_deal) contacts_won,
      count(*) filter (where f.moves > 0 and not f.is_slot) moved_at_least_once,
      -- Close / show only counts won contacts that also showed in the range, so it can never pass 100%.
      count(distinct f.contact_id) filter (where f.led_to_deal and f.contact_id in (
        select s.contact_id from filtered s where s.resolved_outcome = 'showed' and s.channel is not distinct from f.channel and s.grp = f.grp)) won_showed
    from filtered f group by f.channel, f.grp
  ),
  rev as (
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
         round(100.0*a.showed/nullif(a.showed+a.noshow+a.cancelled+a.rescheduled,0),1),
         round(100.0*a.moved_at_least_once/nullif(a.meetings_booked,0),1),
         round(100.0*a.won_showed/nullif(a.contacts_showed,0),1),
         round(100.0*a.contacts_won/nullif(a.contacts_booked,0),1),
         a.won_showed
    from agg a left join rev r on r.channel=a.channel and r.grp=a.grp
   order by a.meetings_booked desc;
$function$;

GRANT EXECUTE ON FUNCTION public.get_source_funnel(timestamp with time zone, timestamp with time zone, text, text, text) TO authenticated;
