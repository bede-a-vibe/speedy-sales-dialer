-- Productive-hours inputs per user per Melbourne day, added up in the database
-- (19 Nov 2026). The Tracker and Setters tabs paged every Dialpad and GHL call
-- in the range to the browser 1,000 rows a request, one after another (26
-- requests for the year so far, on a sort that could tie between pages).
-- Same definition as fetchProductiveHoursByDay: dials and talk time from
-- Dialpad + GHL (GHL mapped through profiles.ghl_user_id), bookings from
-- call_logs. SECURITY INVOKER, so each viewer sees exactly the rows their
-- table policies already allow.
create or replace function public.get_productive_activity_by_day(_from_day date, _to_day date)
returns table (user_id uuid, day date, dials integer, talk_seconds bigint, bookings integer)
language sql stable security invoker set search_path to 'public'
as $function$
  with bounds as (
    select (_from_day::timestamp at time zone 'Australia/Melbourne') lo,
           ((_to_day + 1)::timestamp at time zone 'Australia/Melbourne') hi
  ),
  calls as (
    select d.user_id, (d.started_at at time zone 'Australia/Melbourne')::date as day,
           count(*)::int dials, coalesce(sum(d.talk_time_seconds), 0)::bigint talk
      from public.dialpad_calls d, bounds b
     where d.started_at >= b.lo and d.started_at < b.hi and d.user_id is not null
     group by 1, 2
    union all
    select p.user_id, (g.occurred_at at time zone 'Australia/Melbourne')::date,
           count(*)::int, coalesce(sum(g.duration_seconds), 0)::bigint
      from public.ghl_calls g
      join public.profiles p on p.ghl_user_id = g.ghl_user_id
      cross join bounds b
     where g.occurred_at >= b.lo and g.occurred_at < b.hi and g.ghl_user_id is not null
     group by 1, 2
  ),
  agg as (
    select c.user_id, c.day, sum(c.dials)::int dials, sum(c.talk)::bigint talk from calls c group by 1, 2
  ),
  bk as (
    select l.user_id, (l.created_at at time zone 'Australia/Melbourne')::date as day, count(*)::int n
      from public.call_logs l, bounds b
     where l.outcome = 'booked' and l.created_at >= b.lo and l.created_at < b.hi and l.user_id is not null
     group by 1, 2
  )
  -- Booking minutes only for users who placed calls in the range, as before.
  select coalesce(a.user_id, k.user_id), coalesce(a.day, k.day), coalesce(a.dials, 0), coalesce(a.talk, 0), coalesce(k.n, 0)
    from agg a
    full join bk k on k.user_id = a.user_id and k.day = a.day
   where coalesce(a.user_id, k.user_id) in (select distinct x.user_id from agg x)
$function$;
revoke all on function public.get_productive_activity_by_day(date, date) from public, anon;
grant execute on function public.get_productive_activity_by_day(date, date) to authenticated;
