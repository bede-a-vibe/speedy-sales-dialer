CREATE OR REPLACE FUNCTION public.get_rep_eod_metrics(_user_id uuid, _date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
  dials int; connects int; convos2 int; talk_total int; bookings int;
  longest_unbooked int; pickup numeric; conv2pct numeric;
  flagged jsonb := null;
begin
  if auth.uid() is distinct from _user_id and not public.is_admin_or_coach(auth.uid()) then
    raise exception 'not authorised';
  end if;

  -- Match Insights: every logged outcome is a dial; only answered outcomes are pick-ups.
  select count(*),
         count(*) filter (where outcome in ('not_interested', 'dnc', 'follow_up', 'booked', 'gatekeeper'))
    into dials, connects
    from public.call_logs
   where user_id = _user_id
     and (created_at at time zone 'Australia/Melbourne')::date = _date;

  select count(*) filter (where talk_time_seconds >= 120),
         coalesce(sum(talk_time_seconds),0)
    into convos2, talk_total
    from public.dialpad_calls
   where user_id = _user_id
     and coalesce(direction, 'outbound') = 'outbound'
     and (started_at at time zone 'Australia/Melbourne')::date = _date;

  select count(*) into bookings from public.call_logs
   where user_id = _user_id and outcome = 'booked'
     and (created_at at time zone 'Australia/Melbourne')::date = _date;

  select coalesce(max(dc.talk_time_seconds),0) into longest_unbooked
    from public.dialpad_calls dc
    left join public.call_logs cl on cl.id = dc.call_log_id
   where dc.user_id = _user_id
     and (dc.started_at at time zone 'Australia/Melbourne')::date = _date
     and (cl.outcome is null or cl.outcome <> 'booked');

  pickup := case when dials > 0 then round(100.0*connects/dials,1) else null end;
  conv2pct := case when connects > 0 then round(100.0*convos2/connects,1) else null end;

  if conv2pct is not null and conv2pct < 70 then
    flagged := jsonb_build_object(
      'key','conv_over_2min_pct','label','Conversations over 2 minutes','value',conv2pct,'threshold',70,
      'prompt', format('Your connects-to-conversation-over-2-minutes was %s%% today. %s of %s connects went past 2 minutes. Listen back to your three shortest connects from today. What specifically happened in the first 30 seconds that made them want off the phone? Was it your tone, your opening line, or did you go too heavy too early? Name the one thing you will change in your opener tomorrow.', conv2pct, convos2, connects));
  elsif pickup is not null and pickup < 10 then
    flagged := jsonb_build_object(
      'key','pickup_pct','label','Pickup rate','value',pickup,'threshold',10,
      'prompt', format('Pickup rate was %s%% today. That is a mechanics signal, not a skill one — what list, time blocks and caller IDs were you dialling on?', pickup));
  elsif longest_unbooked >= 1800 then
    flagged := jsonb_build_object(
      'key','longest_unbooked_call','label','Longest call without a booking','value',longest_unbooked,'threshold',1800,
      'prompt', format('You had a %s-minute call that did not end in a booking. Walk through it: why did it run that long, and at what point should you have either closed for the booking or ended the call?', (longest_unbooked/60)::int));
  end if;

  v := jsonb_build_object(
    'date', _date, 'dials', dials, 'connects', connects, 'pickup_pct', pickup,
    'convos_over_2min', convos2, 'conv_over_2min_pct', conv2pct,
    'talk_time_seconds', talk_total, 'bookings', bookings,
    'longest_unbooked_call_seconds', longest_unbooked, 'flagged_metric', flagged);
  return v;
end;
$function$;