-- Allow any signed-in user to see WHICH users hold admin/coach roles
-- (ids only, no PII) so the leaderboard can hide management rows from reps.
create or replace function public.list_admin_user_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id
  from public.user_roles
  where role in ('admin', 'coach')
$$;

revoke execute on function public.list_admin_user_ids() from anon, public;
grant execute on function public.list_admin_user_ids() to authenticated;