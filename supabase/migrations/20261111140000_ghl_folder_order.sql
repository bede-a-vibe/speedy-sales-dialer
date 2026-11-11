-- GHL contact folders were reordered and renamed on 11 Nov 2026 so GHL and the
-- dialer's Intelligence tab read in one order, most important first:
-- Decision Maker, General Info, Marketing, Additional Info, Qualification,
-- Appointments, Dialer Activity, Attribution, Lead Routing. The numbered
-- prefixes were dropped. Folder and field ids and keys are unchanged.
update public.ghl_field_map set ghl_folder = case ghl_folder
  when '01 Lead Routing' then 'Lead Routing'
  when '02 Decision Maker' then 'Decision Maker'
  when '03 Dialer Activity' then 'Dialer Activity'
  when '04 Qualification' then 'Qualification'
  when '05 Appointments' then 'Appointments'
  when '06 Attribution' then 'Attribution'
end
where ghl_folder in ('01 Lead Routing', '02 Decision Maker', '03 Dialer Activity', '04 Qualification', '05 Appointments', '06 Attribution');
