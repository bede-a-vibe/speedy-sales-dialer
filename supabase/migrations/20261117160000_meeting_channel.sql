-- 17 Nov 2026: lead source channel per booking, same rule as v_meetings_unified
-- (contact_channel(lead_channel, lead_type)), so the Insights source picker can
-- filter the call funnel and agree with get_source_funnel. Checked: 0 of 341
-- dialer bookings differ from the view.
create or replace function public.meeting_channel(p public.pipeline_items) returns text
language sql stable set search_path = public as $$
  select contact_channel(c.lead_channel, c.lead_type) from public.contacts c where c.id = p.contact_id
$$;
grant execute on function public.meeting_channel(public.pipeline_items) to authenticated;
