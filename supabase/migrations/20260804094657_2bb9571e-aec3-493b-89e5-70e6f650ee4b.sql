create table if not exists public.legacy_ghl_pipelines (
  id text primary key, name text, stages jsonb, raw jsonb, fetched_at timestamptz not null default now()
);
create table if not exists public.legacy_ghl_opportunities (
  id text primary key, name text, pipeline_id text, pipeline_stage_id text,
  stage_name text, status text, monetary_value numeric, source text,
  contact_id text, contact_name text, contact_phone text, contact_email text,
  assigned_to text, lost_reason_id text, lost_reason_name text, tags text[],
  created_at_ghl timestamptz, updated_at_ghl timestamptz,
  custom_fields jsonb, raw jsonb, fetched_at timestamptz not null default now()
);
create table if not exists public.legacy_ghl_contacts (
  id text primary key, first_name text, last_name text, company_name text,
  phone text, email text, tags text[], source text, dnd boolean,
  date_added timestamptz, custom_fields jsonb, raw jsonb, fetched_at timestamptz not null default now()
);
create table if not exists public.legacy_ghl_notes (
  id text primary key, contact_id text, body text, created_at_ghl timestamptz,
  created_by text, raw jsonb, fetched_at timestamptz not null default now()
);

create index if not exists idx_legacy_ghl_opps_contact on public.legacy_ghl_opportunities (contact_id);
create index if not exists idx_legacy_ghl_notes_contact on public.legacy_ghl_notes (contact_id);

grant select on public.legacy_ghl_pipelines to authenticated;
grant select on public.legacy_ghl_opportunities to authenticated;
grant select on public.legacy_ghl_contacts to authenticated;
grant select on public.legacy_ghl_notes to authenticated;
grant all on public.legacy_ghl_pipelines to service_role;
grant all on public.legacy_ghl_opportunities to service_role;
grant all on public.legacy_ghl_contacts to service_role;
grant all on public.legacy_ghl_notes to service_role;

alter table public.legacy_ghl_pipelines enable row level security;
alter table public.legacy_ghl_opportunities enable row level security;
alter table public.legacy_ghl_contacts enable row level security;
alter table public.legacy_ghl_notes enable row level security;

create policy "Admins read legacy pipelines" on public.legacy_ghl_pipelines for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins read legacy opportunities" on public.legacy_ghl_opportunities for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins read legacy contacts" on public.legacy_ghl_contacts for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "Admins read legacy notes" on public.legacy_ghl_notes for select to authenticated using (public.has_role(auth.uid(), 'admin'));