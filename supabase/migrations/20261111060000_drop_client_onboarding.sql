-- Bede, 11 Nov 2026: the "07 Client Onboarding" GHL fields are not needed in the
-- dialer. Drops the contact_onboarding table added in 20261111050000 (it was
-- empty and unused) and its 27 rows in ghl_field_map.
drop table if exists public.contact_onboarding;
delete from public.ghl_field_map where ghl_folder = '07 Client Onboarding';
