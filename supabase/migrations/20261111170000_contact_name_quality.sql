-- Follow-up to 20261111160000_contact_name_from_dm.sql (11 Nov 2026), applied
-- live via query_database. Scraped decision-maker names were noisier than the
-- first rules caught ("Podcast Michael Reiken", "Paul Managing", "Relationship
-- Focused"), so:
--   1. clean_person_name(raw, business) strips stray leading/trailing title
--      and website words, allows at most 2 words (3 with a particle like
--      "De"), needs capitalised letters-only words, and rejects a stoplist.
--   2. Website-scraped names (dm_enrich_source other than ai-classify or null)
--      also need a first name seen at least 3 times across all decision-maker
--      names (public.person_first_names, refreshed daily at 03:40 UTC).
--      Names from calls (ai-classify) and rep-typed names pass straight through.
--   3. Both triggers use dm_name_for_contact(dm_name, business_name, dm_enrich_source).

drop function if exists public.clean_person_name(text);

create or replace function public.clean_person_name(raw text, business text default null)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := regexp_replace(btrim(coalesce(raw, '')), '\s+', ' ', 'g');
  words text[];
  w text;
  n int;
  lead_strip text[] := array['leadership','license','licence','licensed','by','contact','partner','podcast','submit','close','view','meet',
    'call','about','director','owner','founder','manager','managing','and','with','from','for','the','mr','mrs','ms','miss','dr','sir'];
  tail_strip text[] := array['managing','director','directors','owner','founder','ceo','md','gm','partner','manager','and','with','from',
    'electrician','plumber','builder','licensed','license','licence'];
  stop text[] := array['managing','director','directors','owner','owners','partner','partners','contact','submit','close','podcast',
    'inverters','inverter','us','our','team','the','about','home','services','service','electrical','electrics','electric','plumbing',
    'solar','supply','chain','manager','founder','ceo','md','gm','admin','office','sales','info','support','call','email','phone','mobile',
    'your','my','hello','hi','dear','unknown','none','na','tbc','tba','ma','boss','general','operations','company','group','pty','ltd',
    'australia','sydney','melbourne','brisbane','perth','adelaide','hobart','darwin','canberra','new','quote','free','get','now','today',
    'read','more','view','learn','click','here','menu','meet','reception','receptionist','apprentice','staff','directly','with','juris',
    'doctor','leadership','license','licence','gallery','by','from','for','and','electrician','plumber','builder','projects','project',
    'construction','maintenance','energy','power','air','gas','water','roofing','commercial','residential','industrial','quality','best'];
  particles text[] := array['de','van','von','di','da','la','le','del','der','st','du','dos','das','al','bin'];
begin
  if v = '' or v ~ '[0-9@/()&,.]' then return null; end if;
  words := regexp_split_to_array(v, ' ');
  while array_length(words, 1) > 1 and lower(words[1]) = any(lead_strip) loop words := words[2:]; end loop;
  while array_length(words, 1) > 1 and lower(words[array_length(words, 1)]) = any(tail_strip) loop
    words := words[1:array_length(words, 1) - 1];
  end loop;
  n := array_length(words, 1);
  if n is null or n > 3 then return null; end if;
  if n = 3 and not (lower(words[2]) = any(particles)) then return null; end if;
  foreach w in array words loop
    if lower(w) = any(particles) and n = 3 then continue; end if;
    if length(w) < 2 then return null; end if;
    if w !~ '^[A-Z][A-Za-z''-]+$' then return null; end if;
    if lower(w) = any(stop) then return null; end if;
  end loop;
  if n >= 2 and lower(words[1]) = lower(words[n]) then return null; end if;
  return array_to_string(words, ' ');
end
$$;

create table if not exists public.person_first_names (
  name text primary key,
  seen int not null,
  refreshed_at timestamptz not null default now()
);
alter table public.person_first_names enable row level security;

create or replace function public.refresh_person_first_names()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.person_first_names;
  insert into public.person_first_names (name, seen)
  select lower(split_part(c, ' ', 1)), count(*)
  from (select public.clean_person_name(dm_name, business_name) c from public.contacts where nullif(btrim(dm_name), '') is not null) s
  where c is not null
  group by 1;
  get diagnostics n = row_count;
  return n;
end
$$;

create or replace function public.dm_name_for_contact(dm text, business text, source text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare c text := public.clean_person_name(dm, business);
begin
  if c is null then return null; end if;
  if source is null or source = 'ai-classify' then return c; end if;
  if exists (select 1 from public.person_first_names where name = lower(split_part(c, ' ', 1)) and seen >= 3) then return c; end if;
  return null;
end
$$;

create or replace function public.trg_contact_person_from_dm()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  dm text := public.dm_name_for_contact(new.dm_name, new.business_name, new.dm_enrich_source);
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
  before insert or update of dm_name, contact_person, business_name, dm_enrich_source on public.contacts
  for each row execute function public.trg_contact_person_from_dm();

create or replace function public.trg_enqueue_ghl_name_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(new.ghl_contact_id, '') is not null
    and new.contact_person is not null
    and new.contact_person = public.dm_name_for_contact(new.dm_name, new.business_name, new.dm_enrich_source)
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

-- Backfill as run on 11 Nov 2026 (3,584 contacts; old values kept in
-- public.contact_person_backfill_20261111, RLS on):
--   create table public.contact_person_backfill_20261111 as
--     select id, contact_person as old_contact_person from public.contacts
--     where public.dm_name_for_contact(dm_name, business_name, dm_enrich_source) is not null
--       and (nullif(btrim(coalesce(contact_person, '')), '') is null
--            or lower(btrim(contact_person)) = lower(btrim(coalesce(business_name, ''))));
--   update public.contacts c set dm_name = c.dm_name
--     from public.contact_person_backfill_20261111 b where b.id = c.id;   -- triggers do the rest
--   insert into public.ghl_name_push_queue (contact_id)
--     select id from public.contacts
--     where nullif(ghl_contact_id, '') is not null
--       and contact_person = public.dm_name_for_contact(dm_name, business_name, dm_enrich_source)
--     on conflict (contact_id) do nothing;                                 -- 4,234 queued
--
-- Cron (pg_cron):
--   ghl-name-push-drain         * * * * *   POST ghl {action: drain_ghl_name_push, batchSize: 40},
--                                           only while a pending row exists (x-cron-secret header)
--   refresh-person-first-names  40 3 * * *  select public.refresh_person_first_names();
