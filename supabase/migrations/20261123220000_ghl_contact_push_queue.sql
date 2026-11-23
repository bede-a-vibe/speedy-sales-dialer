-- One-off pushes of dialer leads to GHL (Bede, 23 Nov 2026: Matteo's list).
-- Drained by the ghl edge function action drain_ghl_contact_push.
create table if not exists public.ghl_contact_push_queue (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  kind text not null check (kind in ('create', 'phone')),
  old_numbers text[] not null default '{}',
  new_number text,
  status text not null default 'pending',
  ghl_contact_id text,
  detail text,
  attempts int not null default 0,
  enqueued_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.ghl_contact_push_queue enable row level security;
revoke all on public.ghl_contact_push_queue from anon, authenticated;
grant all on public.ghl_contact_push_queue to service_role;
