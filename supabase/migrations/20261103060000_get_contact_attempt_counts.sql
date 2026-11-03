-- Lead-age penetration input for Insights, aggregated server-side.
-- Applied to production 2026-11-03 via query_database.
create or replace function public.get_contact_attempt_counts()
returns table(call_attempt_count integer, contacts bigint)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select c.call_attempt_count, count(*)::bigint
    from public.contacts c
   where c.call_attempt_count > 0
   group by c.call_attempt_count
   order by c.call_attempt_count;
$$;
revoke all on function public.get_contact_attempt_counts() from public, anon;
grant execute on function public.get_contact_attempt_counts() to authenticated;
