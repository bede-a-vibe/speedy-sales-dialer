-- Earnings planner on each setter's Dashboard (Bede, 23 Nov 2026).
-- 1) A rep's own monthly take-home target. Reps read and write only their own;
--    admins and coaches read all.
create table if not exists public.rep_earning_targets (
  user_id uuid primary key default auth.uid(),
  monthly_target numeric not null check (monthly_target > 0 and monthly_target <= 100000),
  updated_at timestamptz not null default now()
);
alter table public.rep_earning_targets enable row level security;

drop policy if exists rep_earning_targets_read on public.rep_earning_targets;
create policy rep_earning_targets_read on public.rep_earning_targets for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_or_coach((select auth.uid())));
drop policy if exists rep_earning_targets_insert_own on public.rep_earning_targets;
create policy rep_earning_targets_insert_own on public.rep_earning_targets for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists rep_earning_targets_update_own on public.rep_earning_targets;
create policy rep_earning_targets_update_own on public.rep_earning_targets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists rep_earning_targets_delete_own on public.rep_earning_targets;
create policy rep_earning_targets_delete_own on public.rep_earning_targets for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.rep_earning_targets from anon;
grant select, insert, update, delete on public.rep_earning_targets to authenticated;

-- 2) One setter's funnel counts for the window, counted on the server so the
--    Dashboard does not page every call log. First meetings only: a booking for
--    a lead who already sat is a follow-up. Security invoker: RLS applies.
create or replace function public.get_rep_funnel_counts(_user uuid, _days integer default 60)
returns table (dials bigint, active_days bigint, pickups bigint, first_bookings bigint, resolved bigint, sat bigint)
language sql stable security invoker set search_path to 'public'
as $function$
  with w as (select now() - make_interval(days => least(greatest(coalesce(_days, 60), 7), 180)) as since),
  c as (
    select count(*) as dials,
           count(distinct (cl.created_at at time zone 'Australia/Melbourne')::date) as active_days,
           count(*) filter (where cl.outcome::text in ('not_interested', 'dnc', 'follow_up', 'booked', 'disqualified', 'gatekeeper')) as pickups
      from public.call_logs cl, w
     where cl.user_id = _user and cl.created_at >= w.since
  ),
  b as (
    select p.id, p.resolved_bucket as rb
      from public.pipeline_items p, w
     where p.pipeline_type = 'booked' and p.created_by = _user and p.created_at >= w.since
       and not exists (
         select 1 from public.pipeline_items q
          where q.contact_id = p.contact_id and q.pipeline_type = 'booked'
            and q.scheduled_for < p.scheduled_for and q.resolved_bucket = 'showed')
  )
  select c.dials, c.active_days, c.pickups, count(b.id),
         count(*) filter (where b.rb in ('showed', 'noshow', 'cancelled')),
         count(*) filter (where b.rb = 'showed')
    from c left join b on true
   group by c.dials, c.active_days, c.pickups
$function$;
revoke all on function public.get_rep_funnel_counts(uuid, integer) from public, anon;
grant execute on function public.get_rep_funnel_counts(uuid, integer) to authenticated;
