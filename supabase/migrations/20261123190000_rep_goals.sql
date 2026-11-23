-- Goals page (Bede, 23 Nov 2026): reps set their own KPI targets next to their
-- take-home target, and see their funnel day by day against them.
-- Additive: RLS on rep_earning_targets is unchanged (own row only; admins and
-- coaches read). kpis holds any of dialsPerDay, pickupRate, bookingRate,
-- sitRate, closeRate (rates as fractions) and avgRetainer.
alter table public.rep_earning_targets alter column monthly_target drop not null;
alter table public.rep_earning_targets add column if not exists kpis jsonb not null default '{}'::jsonb;
alter table public.rep_earning_targets drop constraint if exists rep_earning_targets_kpis_object;
alter table public.rep_earning_targets add constraint rep_earning_targets_kpis_object
  check (jsonb_typeof(kpis) = 'object' and length(kpis::text) <= 1000);

-- One setter's funnel per Melbourne day. Same definitions as
-- get_rep_funnel_counts; bookings sit on the day they were made. Security
-- invoker: RLS applies.
create or replace function public.get_rep_funnel_by_day(_user uuid, _from date)
returns table (day date, dials bigint, pickups bigint, first_bookings bigint, resolved bigint, sat bigint)
language sql stable security invoker set search_path to 'public'
as $function$
  with w as (
    select (greatest(_from, (now() at time zone 'Australia/Melbourne')::date - 200))::timestamp at time zone 'Australia/Melbourne' as since
  ),
  c as (
    select (cl.created_at at time zone 'Australia/Melbourne')::date as day,
           count(*) as dials,
           count(*) filter (where cl.outcome::text in ('not_interested', 'dnc', 'follow_up', 'booked', 'disqualified', 'gatekeeper')) as pickups
      from public.call_logs cl, w
     where cl.user_id = _user and cl.created_at >= w.since
     group by 1
  ),
  b as (
    select (p.created_at at time zone 'Australia/Melbourne')::date as day,
           count(*) as first_bookings,
           count(*) filter (where p.resolved_bucket in ('showed', 'noshow', 'cancelled')) as resolved,
           count(*) filter (where p.resolved_bucket = 'showed') as sat
      from public.pipeline_items p, w
     where p.pipeline_type = 'booked' and p.created_by = _user and p.created_at >= w.since
       and not exists (
         select 1 from public.pipeline_items q
          where q.contact_id = p.contact_id and q.pipeline_type = 'booked'
            and q.scheduled_for < p.scheduled_for and q.resolved_bucket = 'showed')
     group by 1
  )
  select day, coalesce(c.dials, 0), coalesce(c.pickups, 0), coalesce(b.first_bookings, 0), coalesce(b.resolved, 0), coalesce(b.sat, 0)
    from c full join b using (day)
   order by day
$function$;
revoke all on function public.get_rep_funnel_by_day(uuid, date) from public, anon;
grant execute on function public.get_rep_funnel_by_day(uuid, date) to authenticated;
