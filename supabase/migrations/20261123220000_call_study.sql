-- Calls to study (Bede, 23 Nov 2026): a rep is given another person's calls to
-- listen to and review, starting with Bede's for Ben and Lachlan. A source is
-- live: every call that person makes joins the list. The rep's write-up is one
-- row per call per rep, separate from call_reviews (the caller's own review).
create table if not exists public.call_study_sources (
  source_user_id uuid not null,
  rep_user_id uuid not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (rep_user_id, source_user_id),
  check (source_user_id <> rep_user_id)
);
create table if not exists public.call_study_notes (
  call_log_id uuid not null references public.call_logs(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  worked text check (length(worked) <= 4000),
  use_next text check (length(use_next) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (call_log_id, user_id)
);
create index if not exists call_study_notes_user_idx on public.call_study_notes (user_id, updated_at desc);

alter table public.call_study_sources enable row level security;
alter table public.call_study_notes enable row level security;
revoke all on public.call_study_sources, public.call_study_notes from anon, authenticated;
grant select, insert, delete on public.call_study_sources to authenticated;
grant select, insert, update, delete on public.call_study_notes to authenticated;
grant all on public.call_study_sources, public.call_study_notes to service_role;

create policy "read own study sources" on public.call_study_sources for select to authenticated
  using (rep_user_id = auth.uid() or public.is_admin_or_coach(auth.uid()));
create policy "managers add study sources" on public.call_study_sources for insert to authenticated
  with check (public.is_admin_or_coach(auth.uid()));
create policy "managers remove study sources" on public.call_study_sources for delete to authenticated
  using (public.is_admin_or_coach(auth.uid()));
create policy "read own study notes" on public.call_study_notes for select to authenticated
  using (user_id = auth.uid() or public.is_admin_or_coach(auth.uid()));
create policy "add own study notes" on public.call_study_notes for insert to authenticated
  with check (user_id = auth.uid() and public.is_team_member(auth.uid()));
create policy "change own study notes" on public.call_study_notes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "remove own study notes" on public.call_study_notes for delete to authenticated
  using (user_id = auth.uid());

-- Bede's calls, for Ben and Lachlan.
insert into public.call_study_sources (source_user_id, rep_user_id, created_by) values
  ('35a0fecd-d996-414e-9402-ec3d1e08bfd9', '7f855655-583c-4f70-afca-fafb327ef5db', '35a0fecd-d996-414e-9402-ec3d1e08bfd9'),
  ('35a0fecd-d996-414e-9402-ec3d1e08bfd9', '79a0a291-c732-4a3f-91ff-000330d810d4', '35a0fecd-d996-414e-9402-ec3d1e08bfd9')
on conflict do nothing;
