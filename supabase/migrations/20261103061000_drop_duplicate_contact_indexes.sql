-- Four indexes on contacts exactly duplicated another index (same column or
-- expression); every contacts write maintained both. The busier twin of each
-- pair is kept. Applied to production 2026-11-03 via query_database.
drop index if exists public.contacts_lifecycle_stage_idx;   -- twin: idx_contacts_lifecycle_stage
drop index if exists public.idx_contacts_owner_id;          -- twin: contacts_owner_id_idx
drop index if exists public.idx_contacts_phone_digits9;     -- twin: idx_contacts_phone_suffix9 (full, covers the partial)
drop index if exists public.idx_contacts_dm_phone_digits9;  -- twin: idx_contacts_dm_phone_suffix9
