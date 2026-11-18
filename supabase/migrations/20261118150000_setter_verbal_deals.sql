-- Verbal yeses waiting to be signed and paid, for the "loaded" part of the
-- Dashboard level-up bar (18 Nov 2026). A contact counts while its latest
-- booked meeting is a verbal commitment from the last 30 days and it has no
-- revenue record yet. Credited to the setter of the lead's first booking, same
-- as commission. Admins and coaches see all; a rep sees their own.
create or replace function public.get_setter_verbal_deals()
returns table (contact_id uuid, business_name text, setter_id uuid, verbal_on date, retainer numeric, upfront numeric)
language sql stable security definer set search_path to 'public'
as $function$
  with first_booking as (
    select distinct on (p.contact_id) p.contact_id, p.created_by
      from public.pipeline_items p
     where p.pipeline_type = 'booked'
     order by p.contact_id, p.created_at, p.id
  ),
  latest as (
    select distinct on (p.contact_id) p.contact_id, p.scheduled_for, p.appointment_outcome, p.deal_value, p.monthly_recurring_value
      from public.pipeline_items p
     where p.pipeline_type = 'booked' and p.scheduled_for is not null
     order by p.contact_id, p.scheduled_for desc, p.id
  )
  select l.contact_id, c.business_name, fb.created_by,
         (l.scheduled_for at time zone 'Australia/Melbourne')::date,
         l.monthly_recurring_value, l.deal_value
    from latest l
    join first_booking fb on fb.contact_id = l.contact_id
    join public.contacts c on c.id = l.contact_id
   where l.appointment_outcome = 'showed_verbal_commitment'
     and l.scheduled_for >= now() - interval '30 days'
     and not exists (select 1 from public.client_deals d where d.contact_id = l.contact_id)
     and fb.created_by in (select r.user_id from public.rep_comp_plans r)
     and (public.is_admin_or_coach((select auth.uid())) or fb.created_by = (select auth.uid()))
$function$;
revoke all on function public.get_setter_verbal_deals() from public, anon;
grant execute on function public.get_setter_verbal_deals() to authenticated;
