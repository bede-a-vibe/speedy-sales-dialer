-- GHL contact.annual_revenue moved from "07 Client Onboarding" to "General Info"
-- on 11 Nov 2026, and the onboarding folder was deleted. It is written by a GHL
-- lead form (values like under-500k, 500k-1m), so it gets its own dialer column,
-- separate from estimated_annual_revenue, which comes from call transcripts.
alter table public.contacts add column if not exists annual_revenue text;
comment on column public.contacts.annual_revenue is 'GHL contact.annual_revenue (General Info): revenue band written by a GHL lead form, e.g. under-500k, 500k-1m. Separate from estimated_annual_revenue, which comes from calls.';
insert into public.ghl_field_map (ghl_field_key, ghl_folder, ghl_label, ghl_data_type, dialer_table, dialer_column, status, notes)
values ('contact.annual_revenue','General Info','Annual revenue','TEXT','contacts','annual_revenue','mapped','Moved from 07 Client Onboarding on 11 Nov 2026. Written by a GHL lead form; values like under-500k.')
on conflict (ghl_field_key) do update set ghl_folder = excluded.ghl_folder, dialer_table = excluded.dialer_table, dialer_column = excluded.dialer_column, status = excluded.status, notes = excluded.notes;
