-- Bede's show-up definition (12 Oct 2026): showed over every resolved slot
-- (showed + no-show + cancelled + rescheduled). Pending and upcoming slots
-- stay out of the denominator. Applied to prod via query_database on 12 Oct 2026.
CREATE OR REPLACE FUNCTION public.get_rep_meeting_stats(_from timestamp with time zone, _to timestamp with time zone, _include_former boolean DEFAULT false)
 RETURNS TABLE(ghl_user_id text, rep_name text, rep_user_id uuid, has_dialer_account boolean, is_active boolean, meetings_booked bigint, showed bigint, noshow bigint, cancelled bigint, rescheduled bigint, reschedules bigint, pending bigint, upcoming bigint, contacts_won bigint, show_rate_pct numeric, reschedule_rate_pct numeric)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  with scoped as (
    select v.*,
           coalesce(
             (select t.is_active from v_team_members t
               where (t.dialer_user_id is not null and t.dialer_user_id = v.rep_user_id)
                  or (t.ghl_user_id is not null and t.ghl_user_id = v.ghl_user_id)
               limit 1),
             true
           ) as rep_active
      from public.v_meetings_unified v
     where v.start_time >= _from and v.start_time < _to
  )
  select
    s.ghl_user_id, s.rep_name, s.rep_user_id, (s.rep_user_id is not null), bool_and(s.rep_active),
    count(*),
    count(*) filter (where s.resolved_outcome='showed'),
    count(*) filter (where s.resolved_outcome='noshow'),
    count(*) filter (where s.resolved_outcome='cancelled'),
    count(*) filter (where s.resolved_outcome='rescheduled'),
    coalesce(sum(s.reschedule_count), 0),
    count(*) filter (where s.resolved_outcome='pending'),
    count(*) filter (where s.resolved_outcome='upcoming'),
    count(distinct s.contact_id) filter (where s.led_to_deal),
    round(100.0 * count(*) filter (where s.resolved_outcome='showed')
          / nullif(count(*) filter (where s.resolved_outcome in ('showed','noshow','cancelled','rescheduled')), 0), 1),
    round(100.0 * count(*) filter (where s.reschedule_count > 0) / nullif(count(*), 0), 1)
  from scoped s
  where _include_former or s.rep_active
  group by s.ghl_user_id, s.rep_name, s.rep_user_id
  order by count(*) desc;
$function$;
