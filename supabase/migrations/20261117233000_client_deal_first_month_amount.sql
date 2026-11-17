-- First month fee when it differs from the ongoing amount (17 Nov 2026).
-- Bright Future: $4,000 first month, then $2,000/mo. Setter commission caps
-- first-month cash at this, else the monthly amount.
alter table public.client_deals
  add column if not exists first_month_amount numeric
  check (first_month_amount is null or first_month_amount >= 0);

drop function if exists public.get_setter_first_deals();
create function public.get_setter_first_deals()
returns table (
  deal_id uuid, contact_id uuid, business_name text, setter_id uuid,
  billing_period text, amount numeric, first_month_amount numeric, start_date date, status text, payments jsonb
)
language sql stable set search_path to 'public'
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
$function$;

grant execute on function public.get_setter_first_deals() to authenticated;
