-- Reps see their own numbers on the Dashboard (18 Nov 2026).
-- Admins and coaches still see everything. A rep sees only what is theirs:
--   * their own pay plan (base + plan) in rep_comp_plans,
--   * the first deals credited to them (they made the lead's first booking),
--     with payments, for their commission,
--   * new clients credited to them as setter (first booking) or closer
--     (a meeting assigned to them), so units sold and cash are not $0.

drop policy if exists rep_comp_plans_own_read on public.rep_comp_plans;
create policy rep_comp_plans_own_read on public.rep_comp_plans
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_setter_first_deals()
returns table (
  deal_id uuid, contact_id uuid, business_name text, setter_id uuid,
  billing_period text, amount numeric, first_month_amount numeric, start_date date, status text, payments jsonb
)
language sql stable security definer set search_path to 'public'
as $function$
  with firsts as (
    select d.contact_id, min(d.start_date) first_start from public.client_deals d group by d.contact_id
  ),
  first_booking as (
    select distinct on (p.contact_id) p.contact_id, p.created_by
      from public.pipeline_items p
     where p.pipeline_type = 'booked'
     order by p.contact_id, p.created_at, p.id
  )
  select cd.id, cd.contact_id, c.business_name, fb.created_by, cd.billing_period, cd.amount, cd.first_month_amount, cd.start_date, cd.status,
         coalesce((select jsonb_agg(jsonb_build_object('id', pay.id, 'paid_on', pay.paid_on, 'amount', pay.amount, 'note', pay.note)
                                    order by pay.paid_on, pay.id)
                     from public.client_deal_payments pay where pay.deal_id = cd.id), '[]'::jsonb)
    from public.client_deals cd
    join firsts f on f.contact_id = cd.contact_id and f.first_start = cd.start_date
    join first_booking fb on fb.contact_id = cd.contact_id
    join public.contacts c on c.id = cd.contact_id
   where fb.created_by in (select r.user_id from public.rep_comp_plans r)
     and (public.is_admin_or_coach((select auth.uid())) or fb.created_by = (select auth.uid()))
$function$;
revoke all on function public.get_setter_first_deals() from public, anon;
grant execute on function public.get_setter_first_deals() to authenticated;

create or replace function public.get_new_clients(_from timestamp with time zone, _to timestamp with time zone)
returns table(contact_id uuid, business_name text, channel text, source text, first_start date, mrr numeric, one_off numeric, dialled boolean)
language sql stable security definer set search_path to 'public'
as $function$
  -- One rule for "won" on every Insights surface: a client whose FIRST deal in
  -- the revenue records starts in the range (Melbourne dates; _to exclusive),
  -- credited to the contact's lead source. Admins and coaches see every client;
  -- a rep sees the clients credited to them (first booking, or a meeting they ran).
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
     and (
       public.is_admin_or_coach((select auth.uid()))
       or exists (select 1 from public.pipeline_items p
                   where p.contact_id = f.contact_id and p.pipeline_type = 'booked'
                     and (p.assigned_user_id = (select auth.uid()))
                 )
       or (select p.created_by from public.pipeline_items p
            where p.contact_id = f.contact_id and p.pipeline_type = 'booked'
            order by p.created_at, p.id limit 1) = (select auth.uid())
     )
$function$;
revoke all on function public.get_new_clients(timestamp with time zone, timestamp with time zone) from public, anon;
grant execute on function public.get_new_clients(timestamp with time zone, timestamp with time zone) to authenticated;
