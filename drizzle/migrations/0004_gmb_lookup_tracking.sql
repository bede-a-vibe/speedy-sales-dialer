alter table public.contacts
  add column if not exists gmb_lookup_attempted boolean not null default false,
  add column if not exists gmb_lookup_at timestamptz;

comment on column public.contacts.gmb_lookup_attempted is 'Google Places lookup for state/city/gmb_link has been attempted for this contact.';

create index if not exists idx_contacts_gmb_lookup_pending
  on public.contacts (created_at)
  where gmb_lookup_attempted = false
    and coalesce(is_archived, false) = false
    and (state is null or state = '');