-- The contact's own name is the decision maker (11 Nov 2026).
--
-- GHL contacts created by the dialer were named after the business ("On" /
-- "The Way Electrical and Plumbing"), and the person sat only in the custom
-- field Decision Maker Name. From here on, when the dialer knows the decision
-- maker and has no real contact person (blank, or just the business name),
-- contact_person becomes the decision maker. A queue then gives the GHL
-- contact that First/Last name. The queue is drained by the ghl edge function,
-- action drain_ghl_name_push.
--
-- A contact person who is someone else (e.g. an office manager who filled in a
-- form) is never replaced, in the dialer or in GHL.

-- A decision-maker name fit to be a contact's name, or null for junk.
create or replace function public.clean_person_name(raw text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when v = '' then null
    when v ~ '[0-9@]' then null
    when length(v) < 2 then null
    when lower(v) in ('ma', 'us', 'unknown', 'n/a', 'na', 'none', 'owner', 'the owner', 'manager', 'tbc', 'tba') then null
    else v
  end
  from (
    select regexp_replace(regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g'), '\s+(and|&)$', '', 'i') as v
  ) s
$$;

create table if not exists public.ghl_name_push_queue (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  enqueued_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'done', 'done_already', 'skipped_other_person', 'skipped_no_target', 'failed')),
  attempts int not null default 0,
  last_error text,
  done_at timestamptz
);
create index if not exists ghl_name_push_queue_pending_idx
  on public.ghl_name_push_queue (enqueued_at) where status = 'pending';
-- Service role only (the edge function); no client policies.
alter table public.ghl_name_push_queue enable row level security;

-- Before write: fill contact_person from dm_name when there is no real contact person.
create or replace function public.trg_contact_person_from_dm()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  dm text := public.clean_person_name(new.dm_name);
begin
  if dm is not null and (
    nullif(btrim(coalesce(new.contact_person, '')), '') is null
    or lower(btrim(new.contact_person)) = lower(btrim(coalesce(new.business_name, '')))
  ) then
    new.contact_person := dm;
  end if;
  return new;
end
$$;

drop trigger if exists trg_contact_person_from_dm on public.contacts;
create trigger trg_contact_person_from_dm
  before insert or update of dm_name, contact_person, business_name on public.contacts
  for each row execute function public.trg_contact_person_from_dm();

-- After write: queue the GHL name update when contact_person is the decision maker.
create or replace function public.trg_enqueue_ghl_name_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(new.ghl_contact_id, '') is not null
    and new.contact_person is not null
    and new.contact_person = public.clean_person_name(new.dm_name)
    and (
      tg_op = 'INSERT'
      or new.contact_person is distinct from old.contact_person
      or new.ghl_contact_id is distinct from old.ghl_contact_id
    )
  then
    insert into public.ghl_name_push_queue (contact_id) values (new.id)
    on conflict (contact_id) do update
      set status = 'pending', enqueued_at = now(), attempts = 0, last_error = null, done_at = null;
  end if;
  return null;
end
$$;

drop trigger if exists trg_enqueue_ghl_name_push on public.contacts;
create trigger trg_enqueue_ghl_name_push
  after insert or update of contact_person, ghl_contact_id, dm_name on public.contacts
  for each row execute function public.trg_enqueue_ghl_name_push();

-- Backfill (run 11 Nov 2026, after the edge function was deployed):
--   update public.contacts
--     set contact_person = public.clean_person_name(dm_name)
--   where public.clean_person_name(dm_name) is not null
--     and (nullif(btrim(coalesce(contact_person, '')), '') is null
--          or lower(btrim(contact_person)) = lower(btrim(coalesce(business_name, ''))));
--   insert into public.ghl_name_push_queue (contact_id)
--   select id from public.contacts
--   where nullif(ghl_contact_id, '') is not null
--     and contact_person = public.clean_person_name(dm_name)
--   on conflict (contact_id) do nothing;
--
-- Drain: cron job ghl-name-push-drain (every 2 minutes, 40 per run).
