-- 17 Nov 2026: one "won" rule for Insights. A client whose FIRST deal in the
-- revenue records starts in the range (Melbourne dates, _to exclusive), credited
-- to the contact's lead source. Security invoker (client_deals RLS applies).
create or replace function public.get_new_clients(_from timestamptz, _to timestamptz)
returns table(contact_id uuid, business_name text, channel text, source text, first_start date, mrr numeric, one_off numeric, dialled boolean)
language sql stable security invoker set search_path = public as $$
  with firsts as (
    select d.contact_id, min(d.start_date) first_start from public.client_deals d group by d.contact_id
  )
  select f.contact_id, c.business_name,
         contact_channel(c.lead_channel, c.lead_type) channel,
         coalesce(nullif(btrim(c.lead_source), ''), 'Unknown') source,
         f.first_start,
         coalesce((select sum(case d.billing_period when 'monthly' then d.amount when 'weekly' then round(d.amount * 52 / 12, 2) else 0 end)
                     from public.client_deals d where d.contact_id = f.contact_id and d.start_date = f.first_start), 0) mrr,
         coalesce((select sum(d.amount) from public.client_deals d
                     where d.contact_id = f.contact_id and d.start_date = f.first_start and d.billing_period = 'one_off'), 0) one_off,
         exists (select 1 from public.call_logs l where l.contact_id = f.contact_id) dialled
    from firsts f join public.contacts c on c.id = f.contact_id
   where f.first_start >= (_from at time zone 'Australia/Melbourne')::date
     and f.first_start <  (_to at time zone 'Australia/Melbourne')::date
$$;
grant execute on function public.get_new_clients(timestamptz, timestamptz) to authenticated;
