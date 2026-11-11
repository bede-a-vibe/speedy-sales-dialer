-- The 15 decision-maker fields moved from GHL's "Decision Maker" folder into the
-- built-in Contact folder (VC2HuWOusiTjsQMerOjX) on 11 Nov 2026. Ids, keys and
-- values are unchanged. The empty Decision Maker folder was deleted.
update public.ghl_field_map set ghl_folder = 'Contact' where ghl_folder = 'Decision Maker';
