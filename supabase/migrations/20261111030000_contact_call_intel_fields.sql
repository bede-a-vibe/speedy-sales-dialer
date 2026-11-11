-- Call intel fields: everything the Contact Intelligence panel shows that used
-- to live only in GHL now has a column on contacts, mirrored through
-- supabaseColumn in src/lib/ghlFieldFolders.ts, so the dialer shows it without
-- a GHL round trip. Filled on 11 Nov 2026 from the Dialpad call transcripts.
alter table public.contacts
  add column if not exists service_area text,
  add column if not exists number_of_trucks_vans integer,
  add column if not exists estimated_annual_revenue text,
  add column if not exists need_identified text,
  add column if not exists current_solution_satisfaction text,
  add column if not exists contract_lockin_status text,
  add column if not exists key_objection text,
  add column if not exists objection_notes text,
  add column if not exists current_monthly_ad_spend text,
  add column if not exists current_marketing_channels text,
  add column if not exists agency_satisfaction text,
  add column if not exists lead_source_dependency text,
  add column if not exists marketing_pain_points text,
  add column if not exists problem_resonance text,
  add column if not exists competitive_intel text,
  add column if not exists gatekeeper_role text,
  add column if not exists preferred_contact_method text,
  add column if not exists call_intel_summary text,
  add column if not exists call_intel_source text,
  add column if not exists call_intel_at timestamptz;
comment on column public.contacts.call_intel_summary is 'Short lead brief written from the call transcripts. Shown as AI Call Summary in Contact Intelligence.';
comment on column public.contacts.call_intel_source is 'call_transcript when the call-intel fields were backfilled from Dialpad transcripts.';

-- One-off backfill (applied by hand, kept here for the record). Transcripts were
-- read into lead_intel_source_20261111, extracted into lead_intel_staging_20261111,
-- then merged below. It only fills empty fields, and only with values from each
-- field's allowed list. The prior values of every touched column are in
-- contacts_backup_20261111_intel.
--
-- create table public.contacts_backup_20261111_intel as
--   select c.* from contacts c join lead_intel_staging_20261111 s on s.contact_id = c.id where s.data <> '{}'::jsonb;
--
-- update contacts c set ... from (select contact_id, data d, brief from lead_intel_staging_20261111) s
--   where s.contact_id = c.id;   (see the merge statement in the PR description)
