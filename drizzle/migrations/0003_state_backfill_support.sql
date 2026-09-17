alter table public.contacts
  add column if not exists state_backfill_attempted boolean not null default false,
  add column if not exists state_backfill_result text,
  add column if not exists state_backfill_at timestamptz;

comment on column public.contacts.state_backfill_attempted is 'Website-based state backfill has been attempted for this contact.';
comment on column public.contacts.state_backfill_result is 'resolved:<source> | ambiguous | unreachable | no_evidence | error';

create index if not exists idx_contacts_state_backfill_pending
  on public.contacts (created_at)
  where state_backfill_attempted = false
    and coalesce(is_archived, false) = false
    and (state is null or state = '')
    and website is not null and website <> '';

create or replace function public.pick_state_backfill_contacts(_limit int)
returns table (id uuid, website text, state text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.website, c.state
  from public.contacts c
  where c.state_backfill_attempted = false
    and coalesce(c.is_archived, false) = false
    and (c.state is null or c.state = '')
    and c.website is not null and c.website <> ''
    and c.website !~* '(infobel|localsearch|local\.com|misterwhat|chamberofcommerce|birdeye|serviceleague|top10place|yellowpages|truelocal|hotfrog|facebook|instagram|linkedin|startlocal|aussieweb|cylex)'
  order by c.created_at asc
  limit greatest(least(coalesce(_limit, 25), 100), 1)
$$;

create or replace function public.count_state_backfill_pending()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.contacts c
  where c.state_backfill_attempted = false
    and coalesce(c.is_archived, false) = false
    and (c.state is null or c.state = '')
    and c.website is not null and c.website <> ''
    and c.website !~* '(infobel|localsearch|local\.com|misterwhat|chamberofcommerce|birdeye|serviceleague|top10place|yellowpages|truelocal|hotfrog|facebook|instagram|linkedin|startlocal|aussieweb|cylex)'
$$;

revoke all on function public.pick_state_backfill_contacts(int) from public, anon, authenticated;
revoke all on function public.count_state_backfill_pending() from public, anon, authenticated;
grant execute on function public.pick_state_backfill_contacts(int) to service_role;
grant execute on function public.count_state_backfill_pending() to service_role;