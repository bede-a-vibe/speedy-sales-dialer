-- Meeting recordings for call study (Bede, 23 Nov 2026): a rep given someone's
-- calls can open that person's recorded sales meetings too. fathom_meetings stays
-- own-or-manager: this returns the link only (no summary, no attendees), only for
-- meetings tied to a booked slot. Left out: onboarding calls, meetings matched on
-- time alone that aren't a growth session (three were tied to the wrong lead), and
-- /calls/ links, which need a Fathom login.
create or replace function public.get_study_meeting_links()
returns table (pipeline_item_id uuid, share_url text)
language sql stable security definer set search_path to 'public'
as $function$
  select f.pipeline_item_id, f.share_url
    from public.fathom_meetings f
    join public.call_study_sources s on s.source_user_id = f.user_id and s.rep_user_id = auth.uid()
    join public.pipeline_items p on p.id = f.pipeline_item_id and p.pipeline_type = 'booked'
   where f.share_url like 'https://fathom.video/share/%'
     and (f.match_confidence is distinct from 'time' or f.title ~* 'growth session')
     and f.title !~* 'onboarding'
$function$;
revoke all on function public.get_study_meeting_links() from public, anon;
grant execute on function public.get_study_meeting_links() to authenticated;
