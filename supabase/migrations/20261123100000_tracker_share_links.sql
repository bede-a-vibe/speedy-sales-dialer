-- View-only links to Insights > Tracker (23 Nov 2026).
--
-- Bede wanted a link like a view-only Google Sheet: anyone holding it sees the
-- funnel tracker, nobody can change anything. One live link at a time; making a
-- new one revokes the old. The page /view/tracker/<token> reads through the
-- tracker-share edge function, which checks the token, allows only the tables,
-- columns and RPCs the tracker reads, blocks setter pay, and never writes.
create table if not exists public.tracker_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count int not null default 0
);
create index if not exists tracker_share_links_live_idx on public.tracker_share_links (created_at desc) where revoked_at is null;

alter table public.tracker_share_links enable row level security;
drop policy if exists tracker_share_links_admin_all on public.tracker_share_links;
create policy tracker_share_links_admin_all on public.tracker_share_links
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- get_new_clients limits rows to admins/coaches or the rep's own leads. The
-- share proxy calls it with the service role (no auth.uid()), so it needs the
-- whole list. The service role already bypasses RLS everywhere.
create or replace function public.get_new_clients(_from timestamp with time zone, _to timestamp with time zone)
 returns table(contact_id uuid, business_name text, channel text, source text, first_start date, mrr numeric, one_off numeric, dialled boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
       (select auth.role()) = 'service_role'
       or public.is_admin_or_coach((select auth.uid()))
       or exists (select 1 from public.pipeline_items p
                   where p.contact_id = f.contact_id and p.pipeline_type = 'booked'
                     and (p.assigned_user_id = (select auth.uid()))
                 )
       or (select p.created_by from public.pipeline_items p
            where p.contact_id = f.contact_id and p.pipeline_type = 'booked'
            order by p.created_at, p.id limit 1) = (select auth.uid())
     )
$function$;
