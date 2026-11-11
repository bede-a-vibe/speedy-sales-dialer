-- GHL and dialer field alignment, 11 Nov 2026. These GHL changes were made
-- through the GHL API, not here:
--   * 24 contact fields created so every field the dialer captures exists in GHL.
--   * Decision Maker Name, Phone, Email and Best Route moved to 02 Decision Maker;
--     Buying Signal Strength moved to 04 Qualification.
-- The dialer's Contact Intelligence panel (src/lib/ghlFieldFolders.ts) now uses
-- the same folders, names and keys. This brings ghl_field_map in line.
update ghl_field_map m set status = 'mapped', ghl_folder = v.folder, ghl_label = v.label, ghl_data_type = v.dtype, notes = null
from (values
  ('contact.gatekeeper_role','02 Decision Maker','Gatekeeper Role','TEXT'),
  ('contact.decision_maker_phone_type','02 Decision Maker','Decision Maker Phone Type','TEXT'),
  ('contact.preferred_contact_method','02 Decision Maker','Preferred Contact Method','SINGLE_OPTIONS'),
  ('contact.ai_call_summary','03 Dialer Activity','AI Call Summary','LARGE_TEXT'),
  ('contact.rep_coaching_notes','03 Dialer Activity','Rep Coaching Notes','LARGE_TEXT'),
  ('contact.need_identified','04 Qualification','Need Identified','SINGLE_OPTIONS'),
  ('contact.current_solution_satisfaction','04 Qualification','Current Solution Satisfaction','SINGLE_OPTIONS'),
  ('contact.key_objection','04 Qualification','Key Objection','SINGLE_OPTIONS'),
  ('contact.objection_notes','04 Qualification','Objection Notes','LARGE_TEXT'),
  ('contact.problem_resonance','04 Qualification','Problem Resonance','SINGLE_OPTIONS'),
  ('contact.competitive_intel','04 Qualification','Competitive Intel','LARGE_TEXT'),
  ('contact.team_size','General Info','Team Size','NUMERICAL'),
  ('contact.team_size_evidence','General Info','Team Size Evidence','TEXT'),
  ('contact.service_area','General Info','Service Area','TEXT'),
  ('contact.number_of_trucksvans','General Info','Number of Trucks/Vans','NUMERICAL'),
  ('contact.estimated_annual_revenue','General Info','Estimated Annual Revenue','SINGLE_OPTIONS'),
  ('contact.website_quality','General Info','Website Quality','TEXT'),
  ('contact.has_existing_agency','Additional Info','Has Existing Agency','SINGLE_OPTIONS'),
  ('contact.current_marketing_channels','Additional Info','Current Marketing Channels','TEXT'),
  ('contact.social_media_presence','Additional Info','Social Media Presence','TEXT'),
  ('contact.agency_satisfaction','Additional Info','Agency Satisfaction','SINGLE_OPTIONS'),
  ('contact.lead_source_dependency','Additional Info','Lead Source Dependency','SINGLE_OPTIONS'),
  ('contact.marketing_pain_points','Additional Info','Marketing Pain Points','LARGE_TEXT')
) v(key, folder, label, dtype) where m.ghl_field_key = v.key;
update ghl_field_map set notes = 'Dialer boolean; GHL Yes/No.' where ghl_field_key = 'contact.has_existing_agency';
delete from ghl_field_map where ghl_field_key = 'contact.contractlockin_status';
insert into ghl_field_map (ghl_field_key, ghl_folder, ghl_label, ghl_data_type, dialer_table, dialer_column, status)
values ('contact.contract__lockin_status','04 Qualification','Contract / Lock-in Status','SINGLE_OPTIONS','contacts','contract_lockin_status','mapped')
on conflict (ghl_field_key) do nothing;
update ghl_field_map set ghl_folder = '02 Decision Maker' where ghl_field_key in ('contact.decision_maker_name','contact.decision_maker_phone','contact.decision_maker_email','contact.best_route_to_decision_maker');
update ghl_field_map set ghl_folder = '04 Qualification' where ghl_field_key = 'contact.buying_signal_strength';
delete from ghl_field_map where ghl_field_key in ('contact.website_url','contact.last_contacted_date','contact.existing_agency_name','contact.current_monthly_ad_spend');
update ghl_field_map set ghl_folder = 'Dialer only (derived)' where ghl_folder = 'Not in GHL yet';
