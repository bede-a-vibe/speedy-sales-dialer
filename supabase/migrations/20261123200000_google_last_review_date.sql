-- Last Google review date on a lead (Bede, 23 Nov 2026), filled from Matteo's
-- Google profile check. Dialer only: no GHL field. Filterable in the dialer.
alter table public.contacts add column if not exists google_last_review_date date;

create or replace function public.dialer_detail_fields()
returns table(field text, kind text)
language sql
immutable
set search_path = public
as $$
  values
    -- 01 Lead Routing
    ('lead_status', 'text'),
    ('lifecycle_stage', 'text'),
    ('lifecycle_reason', 'text'),
    ('lead_type', 'text'),
    ('brand', 'text'),
    ('segment', 'text'),
    ('segment_changed_at', 'date'),
    ('booking_tier', 'text'),
    ('import_batch', 'text'),
    ('disqualified_reason', 'text'),
    ('dnc_reason', 'text'),
    -- 02 Decision Maker
    ('dm_name', 'text'),
    ('dm_role', 'text'),
    ('dm_phone', 'text'),
    ('dm_phone_type', 'text'),
    ('dm_email', 'text'),
    ('dm_linkedin', 'text'),
    ('authority_level', 'text'),
    ('job_role', 'text'),
    ('best_route_to_decision_maker', 'text'),
    ('preferred_contact_method', 'text'),
    ('gatekeeper_name', 'text'),
    ('gatekeeper_role', 'text'),
    ('mobile_reaches_gatekeeper', 'bool'),
    ('gatekeeper_notes', 'text'),
    ('stakeholders', 'text'),
    -- 03 Dialer Activity
    ('last_outcome', 'text'),
    ('call_attempt_count', 'int'),
    ('last_called_at', 'date'),
    ('next_followup_date', 'date'),
    ('callback_date', 'date'),
    ('revival_date', 'date'),
    ('best_time_to_call', 'text'),
    ('last_call_sentiment', 'text'),
    ('voicemail_count', 'int'),
    ('phone_type', 'text'),
    ('phone_number_quality', 'text'),
    ('follow_up_note', 'text'),
    ('call_intel_summary', 'text'),
    ('rep_coaching_notes', 'text'),
    -- 04 Qualification
    ('buying_signal_strength', 'text'),
    ('need_identified', 'text'),
    ('problem_resonance', 'text'),
    ('key_objection', 'text'),
    ('current_solution_satisfaction', 'text'),
    ('contract_lockin_status', 'text'),
    ('budget_indication', 'text'),
    ('buying_timeline', 'text'),
    ('proposal_format', 'text'),
    ('monthly_retainer_value', 'num'),
    ('objection_notes', 'text'),
    ('key_quote', 'text'),
    ('agreed_next_steps', 'text'),
    ('competitive_intel', 'text'),
    ('existing_agency_notes', 'text'),
    -- 05 Appointments
    ('appointment_status', 'text'),
    ('latest_appointment_scheduled_for', 'date'),
    ('last_appointment_calendar', 'text'),
    ('noshow_count', 'int'),
    ('meeting_booked_date', 'date'),
    ('setter_name', 'text'),
    ('assigned_closer', 'text'),
    ('meeting_source', 'text'),
    ('meeting_set_by_role', 'text'),
    -- 06 Attribution
    ('utm_source', 'text'),
    ('utm_medium', 'text'),
    ('utm_campaign', 'text'),
    ('utm_ad_set', 'text'),
    ('utm_ad_name', 'text'),
    -- General Info
    ('industry', 'text'),
    ('trade_type', 'text'),
    ('vertical', 'text'),
    ('work_type', 'text'),
    ('business_size', 'text'),
    ('team_size', 'int'),
    ('team_size_evidence', 'text'),
    ('years_in_business', 'int'),
    ('annual_revenue', 'text'),
    ('estimated_annual_revenue', 'text'),
    ('service_area', 'text'),
    ('number_of_trucks_vans', 'int'),
    ('abn', 'text'),
    ('website', 'text'),
    ('website_quality', 'text'),
    ('lead_channel', 'text'),
    ('prospect_tier', 'text'),
    -- Marketing
    ('has_google_ads', 'tri'),
    ('has_facebook_ads', 'tri'),
    ('has_seo', 'tri'),
    -- Additional Info
    ('seo_visibility', 'text'),
    -- Marketing
    ('existing_agency_name', 'text'),
    -- Additional Info
    ('agency_satisfaction', 'text'),
    ('current_monthly_ad_spend', 'text'),
    ('current_marketing_channels', 'csv'),
    ('lead_source_dependency', 'text'),
    ('social_media_presence', 'text'),
    ('gmb_link', 'text'),
    ('google_rating', 'num'),
    ('google_review_count', 'int'),
    ('google_last_review_date', 'date'),
    ('facebook_ads_manager_id', 'text'),
    ('nurture_last_email', 'int'),
    ('marketing_pain_points', 'text'),
    -- Marketing
    ('has_existing_agency', 'bool'),
    ('existing_agency_services', 'tags'),
    -- 03 Dialer Activity
    ('call_intel_source', 'text'),
    ('team_size_source', 'text')
$$;
