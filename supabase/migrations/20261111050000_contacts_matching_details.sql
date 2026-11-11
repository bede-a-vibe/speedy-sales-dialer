-- Contacts page: the same captured-detail filters the dialer queue uses.
--
-- contacts_matching_details(_detail_filters) returns the contacts rows that
-- match every criterion, built from the whitelist in dialer_detail_fields()
-- (migration 20261111040000). The Contacts page calls it through PostgREST and
-- chains its usual filters, sort, paging and exact count on top, so the page's
-- own filters are unchanged.
--
-- SECURITY INVOKER: the caller's RLS on contacts applies. The predicate
-- builders only read the whitelist, so authenticated may run them.

create or replace function public.contacts_matching_details(_detail_filters jsonb)
returns setof public.contacts
language plpgsql
stable
set search_path = public
as $$
declare
  _where text := public.dialer_detail_where(_detail_filters);
begin
  return query execute format('SELECT c.* FROM public.contacts c WHERE %s', coalesce(_where, 'true'));
end;
$$;

revoke all on function public.contacts_matching_details(jsonb) from public, anon;
grant execute on function public.contacts_matching_details(jsonb) to authenticated;
grant execute on function public.dialer_detail_where(jsonb) to authenticated;
grant execute on function public.dialer_detail_predicate(jsonb) to authenticated;
grant execute on function public.dialer_detail_fields() to authenticated;
grant execute on function public.dialer_detail_reject(text, text) to authenticated;

notify pgrst, 'reload schema';
