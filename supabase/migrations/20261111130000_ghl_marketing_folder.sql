-- GHL contact custom fields now have a "Marketing" folder (id c5YaV0wvOgukqWdiuyB4,
-- placed after Additional Info). The fields below were moved into it on 11 Nov 2026:
-- 14 from Additional Info and Existing Agency Notes from 04 Qualification. The
-- move kept every field's id, key and values. GMB Link, Google Rating, Google
-- Review Count and Nurture Last Email stay in Additional Info.
update public.ghl_field_map
set ghl_folder = 'Marketing'
where ghl_field_key in (
  'contact.runs_google_ads',
  'contact.runs_facebook_ads',
  'contact.has_seo',
  'contact.seo_visibility',
  'contact.has_existing_agency',
  'contact.existing_agency',
  'contact.existing_agency_services',
  'contact.agency_satisfaction',
  'contact.existing_agency_notes',
  'contact.monthly_media_spend',
  'contact.current_marketing_channels',
  'contact.lead_source_dependency',
  'contact.social_media_presence',
  'contact.facebook_ads_manager_id',
  'contact.marketing_pain_points'
);
