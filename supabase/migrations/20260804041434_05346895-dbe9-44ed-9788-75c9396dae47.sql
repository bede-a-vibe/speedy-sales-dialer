ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS ghl_contact_id_legacy text;

COMMENT ON COLUMN public.contacts.ghl_contact_id_legacy IS 'Preserved GoHighLevel contact IDs from the old "Odin Digital - Tradies" location, captured during the 2026-08-04 cutover to the main "Odin Digital" location. These IDs are NOT valid in the main location; kept for audit/rollback only.';

UPDATE public.contacts
SET ghl_contact_id_legacy = ghl_contact_id
WHERE ghl_contact_id IS NOT NULL AND ghl_contact_id_legacy IS NULL;

UPDATE public.contacts
SET ghl_contact_id = NULL
WHERE ghl_contact_id IS NOT NULL;