-- Team size: one-man bands (1 or 2 on the tools) get a different offer to teams of 3+.
-- contacts.business_size holds the band, using the values in src/data/constants.ts
-- (TEAM_SIZE_BANDS), so the dialer's existing Business Size filter selects on it.
-- team_size holds the exact headcount when the prospect said one.
alter table public.contacts
  add column if not exists team_size integer,
  add column if not exists team_size_evidence text,
  add column if not exists team_size_source text,
  add column if not exists team_size_set_at timestamptz;
comment on column public.contacts.team_size is 'People working in the business including the owner, as the prospect said it. business_size holds the band.';
comment on column public.contacts.team_size_source is 'call_transcript (backfilled from Dialpad transcripts) or rep (tagged live in the dialer).';

-- One-off backfill, 11 Nov 2026: transcript lines from Ben's and Lachlan's calls
-- were read into team_size_snippets_20261111, classified into
-- team_size_staging_20261111, and merged into contacts where confident.
