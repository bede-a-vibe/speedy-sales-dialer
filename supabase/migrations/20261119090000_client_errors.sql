-- Crash and error capture from reps' browsers (19 Nov 2026). Ben reported the
-- dialer "crashing" when listening to calls and nothing on screen was ever
-- recorded. Each signed-in browser writes its own errors here; only admins and
-- coaches read them.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  kind text not null,
  message text,
  path text,
  detail jsonb,
  user_agent text
);
create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
drop policy if exists client_errors_insert_own on public.client_errors;
create policy client_errors_insert_own on public.client_errors
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists client_errors_admin_read on public.client_errors;
create policy client_errors_admin_read on public.client_errors
  for select to authenticated using (public.is_admin_or_coach((select auth.uid())));
