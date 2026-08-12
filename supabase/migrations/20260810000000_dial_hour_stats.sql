-- Dial clock: dial volume against contact rate, hour by hour.
--
-- Already applied to prod (xhcvwhcpaeetmmzkuwyw) via query_database; this file is
-- the version-controlled record.
--
-- The question this answers: are the dials going into the hours that actually
-- connect? On 120 days of data the answer was no — the two heaviest hours (12pm
-- at 226 dials, 3pm at 225) are the two worst-connecting (27.4%, 26.2%), while
-- 4pm connects at 39.4% on only 137 dials and nothing is dialled after 5pm.

create or replace function public.get_dial_hour_stats(
  _from timestamptz, _to timestamptz, _user_id uuid default null
) returns table (
  hour_of_day int, dials bigint, leads_dialed bigint, redials bigint,
  connects bigint, conv_2min bigint, bookings bigint, new_leads bigint,
  contact_rate_pct numeric, conv_rate_pct numeric, book_rate_pct numeric
) language sql stable security invoker set search_path to 'public' as $fn$
  with calls as (
    select cl.*,
           extract(hour from cl.created_at at time zone 'Australia/Melbourne')::int as hr
      from call_logs cl
     where cl.created_at >= _from and cl.created_at < _to
       and (_user_id is null or cl.user_id = _user_id)
  ),
  leads as (
    select extract(hour from c.created_at at time zone 'Australia/Melbourne')::int as hr,
           count(*) as new_leads
      from contacts c
     where c.created_at >= _from and c.created_at < _to
     group by 1
  ),
  hours as (select generate_series(0, 23) as hr),
  agg as (
    select c.hr,
      count(*) dials,
      count(distinct c.contact_id) leads_dialed,
      -- A dial to someone already called in this window.
      count(*) - count(distinct c.contact_id) redials,
      -- "Connect" = a human picked up. The outcome enum has no explicit
      -- 'answered', so it is defined as anything that is NOT a failed attempt.
      count(*) filter (where c.outcome::text not in
        ('no_answer','voicemail','busy','wrong_number','disconnected')) connects,
      count(*) filter (where c.dialpad_talk_time_seconds >= 120) conv_2min,
      count(*) filter (where c.outcome::text = 'booked') bookings
    from calls c group by c.hr
  )
  select h.hr,
    coalesce(a.dials,0), coalesce(a.leads_dialed,0), coalesce(a.redials,0),
    coalesce(a.connects,0), coalesce(a.conv_2min,0), coalesce(a.bookings,0),
    coalesce(l.new_leads,0),
    round(100.0*a.connects/nullif(a.dials,0),1),
    round(100.0*a.conv_2min/nullif(a.connects,0),1),
    round(100.0*a.bookings/nullif(a.connects,0),1)
  from hours h
  left join agg a on a.hr = h.hr
  left join leads l on l.hr = h.hr
  order by h.hr;
$fn$;

grant execute on function public.get_dial_hour_stats(timestamptz, timestamptz, uuid) to authenticated;
