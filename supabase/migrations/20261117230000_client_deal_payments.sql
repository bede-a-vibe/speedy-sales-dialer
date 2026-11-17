-- Paid marker for setter commission (17 Nov 2026).
-- Setter commission is paid on first-month cash COLLECTED, in the calendar
-- month it lands (Ben's October was paid on $39k collected, not the $45k of
-- deals started). One row per payment, so an instalment deal (JR Dixon, half
-- paid in October) carries each payment in its own month.

create table if not exists public.client_deal_payments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.client_deals(id) on delete cascade,
  paid_on date not null,
  amount numeric not null check (amount > 0),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists client_deal_payments_deal_id_idx on public.client_deal_payments (deal_id);
create index if not exists client_deal_payments_paid_on_idx on public.client_deal_payments (paid_on);

alter table public.client_deal_payments enable row level security;

drop policy if exists client_deal_payments_manager_all on public.client_deal_payments;
create policy client_deal_payments_manager_all on public.client_deal_payments
  for all to authenticated
  using (public.is_admin_or_coach((select auth.uid())))
  with check (public.is_admin_or_coach((select auth.uid())));

-- Every FIRST deal (start_date = the contact's earliest start, the same rule
-- as get_new_clients) of a lead whose first booking was made by a rep on a
-- comp plan, with its payments. Runs as the caller: rep_comp_plans and
-- client_deal_payments are admin / coach only, so reps get nothing.
create or replace function public.get_setter_first_deals()
returns table (
  deal_id uuid, contact_id uuid, business_name text, setter_id uuid,
  billing_period text, amount numeric, start_date date, status text, payments jsonb
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
  select cd.id, cd.contact_id, c.business_name, fb.created_by, cd.billing_period, cd.amount, cd.start_date, cd.status,
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
