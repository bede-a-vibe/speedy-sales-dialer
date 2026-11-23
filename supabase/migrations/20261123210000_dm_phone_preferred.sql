-- A decision-maker mobile to ring first on a lead (Bede, 23 Nov 2026: Matteo's
-- owner mobiles win unless someone changed the mobile by hand). Only applies
-- while it equals dm_phone, see src/lib/dialTarget.ts. No GHL field.
alter table public.contacts add column if not exists dm_phone_preferred text;
