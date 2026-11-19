-- A setter's own 1 to 5 rating of each booking they make (19 Nov 2026), from
-- Ben's booking tracker sheet. Kept off pipeline_items so saving a rating never
-- fires the booking triggers (GHL sync, mirrors). A setter rates and reads only
-- their own bookings; admins and coaches read all.
create table if not exists public.booking_ratings (
  pipeline_item_id uuid primary key references public.pipeline_items(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  rating smallint not null check (rating between 1 and 5),
  updated_at timestamptz not null default now()
);
alter table public.booking_ratings enable row level security;

drop policy if exists booking_ratings_read on public.booking_ratings;
create policy booking_ratings_read on public.booking_ratings for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_or_coach((select auth.uid())));

drop policy if exists booking_ratings_write_own on public.booking_ratings;
create policy booking_ratings_write_own on public.booking_ratings for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.pipeline_items p where p.id = pipeline_item_id and p.created_by = (select auth.uid()))
  );

drop policy if exists booking_ratings_update_own on public.booking_ratings;
create policy booking_ratings_update_own on public.booking_ratings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists booking_ratings_delete_own on public.booking_ratings;
create policy booking_ratings_delete_own on public.booking_ratings for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.booking_ratings to authenticated;
