-- GHL field parity: every GHL contact custom field now has a home in the dialer,
-- so the two can be synced both ways later without schema work. The registry
-- table ghl_field_map records, per GHL field, its folder, type and the dialer
-- table.column it maps to. A sync reads that table; fieldKey is stable in GHL
-- (it is frozen at creation), so resolve ids from the key at sync time.
-- supabase/functions/ghl GHL_FIELD_KEY_TO_ID uses 12 older alias keys (e.g.
-- contact.google_business_profile = contact.gmb_link, contact.seo_visibility =
-- contact.has_seo) that point at the same field ids as the keys below.
-- Folder "99 Legacy - Pending Removal" is listed in the map as skip_legacy and
-- given no columns.

-- Lead fields that had no dialer column (GHL folder in brackets).
alter table public.contacts
  add column if not exists lead_status text,                 -- [01 Lead Routing] Lead Status
  add column if not exists brand text,                       -- [01 Lead Routing] Brand
  add column if not exists segment text,                     -- [01 Lead Routing] Segment
  add column if not exists segment_changed_at timestamptz,   -- [01 Lead Routing] Segment Changed At
  add column if not exists import_batch text,                -- [01 Lead Routing] Import Batch
  add column if not exists booking_tier text,                -- [01 Lead Routing] Booking Tier (Ads Only)
  add column if not exists stakeholders text,                -- [02 Decision Maker] Stakeholders (Enterprise)
  add column if not exists job_role text,                    -- [02 Decision Maker] Job Role
  add column if not exists callback_date timestamptz,        -- [03 Dialer Activity] Callback Date
  add column if not exists revival_date timestamptz,         -- [03 Dialer Activity] Revival Date
  add column if not exists proposal_format text,             -- [04 Qualification] Proposal Format
  add column if not exists service_type text[],              -- [04 Qualification] Service Type
  add column if not exists monthly_retainer_value numeric,   -- [04 Qualification] Monthly Retainer Value
  add column if not exists appointment_status text,          -- [05 Appointments] Appointment Status
  add column if not exists last_appointment_calendar text,   -- [05 Appointments] Last Appointment Calendar
  add column if not exists noshow_count integer,             -- [05 Appointments] No-Show Count
  add column if not exists utm_ad_set text,                  -- [06 Attribution] UTM Ad Set / Ad Group
  add column if not exists utm_ad_name text,                 -- [06 Attribution] Ad Name / Keyword
  add column if not exists vertical text,                    -- [General Info] Vertical
  add column if not exists facebook_ads_manager_id text,     -- [Additional Info] Facebook Ads Manager Id
  add column if not exists nurture_last_email integer,       -- [Additional Info] Nurture Last Email
  add column if not exists student_first_name text,          -- [Student Fields]
  add column if not exists student_last_name text,
  add column if not exists student_email text,
  add column if not exists student_outreach_email text,
  add column if not exists student_purchased_from_list text,
  -- Shown in the Intelligence tab but in neither GHL nor the dialer until now.
  add column if not exists website_quality text,
  add column if not exists social_media_presence text,
  add column if not exists rep_coaching_notes text;

-- [07 Client Onboarding] answers describe a client, not a lead, so they get a
-- 1:1 table rather than 27 more columns on contacts.
create table if not exists public.contact_onboarding (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  questionnaire_ready text,
  forward_leads_to_email text,
  forward_lead_calls_to_phone text,
  provided_platform_access text,
  provided_website_access text,
  annual_revenue text,
  services_and_pricing text,
  business_description text,
  number_one_problem text,
  number_one_goal text,
  current_marketing text,
  client_vibe text,
  concerns_and_notes text,
  shortterm_longterm_goals text,
  marketing_objectives text,
  kpis text,
  icp text,
  demographics text,
  interests_pain_points_behaviours text,
  competitors text,
  what_sets_apart text,
  usp text,
  tone_of_voice text,
  compliance_requirements text,
  milestones_deadlines text,
  top_5_words text,
  media_spend_intent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contact_onboarding enable row level security;
drop policy if exists "Authenticated users can view onboarding" on public.contact_onboarding;
create policy "Authenticated users can view onboarding" on public.contact_onboarding
  for select to authenticated using (true);
drop policy if exists "Reps admins and coaches can write onboarding" on public.contact_onboarding;
create policy "Reps admins and coaches can write onboarding" on public.contact_onboarding
  for all to authenticated
  using (is_admin_or_coach(auth.uid()) or has_role(auth.uid(), 'sales_rep'::app_role))
  with check (is_admin_or_coach(auth.uid()) or has_role(auth.uid(), 'sales_rep'::app_role));
drop trigger if exists update_contact_onboarding_updated_at on public.contact_onboarding;
create trigger update_contact_onboarding_updated_at before update on public.contact_onboarding
  for each row execute function public.update_updated_at_column();

-- The registry a future sync reads.
create table if not exists public.ghl_field_map (
  ghl_field_key text primary key,
  ghl_folder text not null,
  ghl_label text not null,
  ghl_data_type text not null,
  dialer_table text,
  dialer_column text,
  status text not null default 'mapped' check (status in ('mapped', 'derived', 'skip_legacy', 'dialer_only')),
  notes text
);
alter table public.ghl_field_map enable row level security;
drop policy if exists "Authenticated users can view ghl field map" on public.ghl_field_map;
create policy "Authenticated users can view ghl field map" on public.ghl_field_map
  for select to authenticated using (true);

insert into public.ghl_field_map (ghl_field_key, ghl_folder, ghl_label, ghl_data_type, dialer_table, dialer_column, status, notes) values
-- 01 Lead Routing
('contact.lead_status','01 Lead Routing','Lead Status','SINGLE_OPTIONS','contacts','lead_status','mapped',null),
('contact.lifecycle_stage','01 Lead Routing','Lifecycle Stage','SINGLE_OPTIONS','contacts','lifecycle_stage','mapped','Dialer lifecycle values may differ from GHL options; map values at sync.'),
('contact.brand','01 Lead Routing','Brand','SINGLE_OPTIONS','contacts','brand','mapped',null),
('contact.segment','01 Lead Routing','Segment','SINGLE_OPTIONS','contacts','segment','mapped',null),
('contact.segment_changed_at','01 Lead Routing','Segment Changed At','DATE','contacts','segment_changed_at','mapped',null),
('contact.import_batch','01 Lead Routing','Import Batch','TEXT','contacts','import_batch','mapped',null),
('contact.booking_tier_ads_only','01 Lead Routing','Booking Tier (Ads Only)','SINGLE_OPTIONS','contacts','booking_tier','mapped',null),
('contact.disqualified_reason','01 Lead Routing','Disqualified Reason','TEXT','contacts','disqualified_reason','mapped',null),
('contact.dnc_reason','01 Lead Routing','DNC Reason','TEXT','contacts','dnc_reason','mapped',null),
-- 02 Decision Maker
('contact.decision_maker_role','02 Decision Maker','Decision Maker Role','TEXT','contacts','dm_role','mapped',null),
('contact.stakeholders_enterprise','02 Decision Maker','Stakeholders (Enterprise)','LARGE_TEXT','contacts','stakeholders','mapped',null),
('contact.job_role','02 Decision Maker','Job Role','TEXT','contacts','job_role','mapped',null),
('contact.decision_maker_linkedin','02 Decision Maker','Decision Maker LinkedIn','TEXT','contacts','dm_linkedin','mapped',null),
('contact.mobile_reaches_gatekeeper','02 Decision Maker','Mobile Reaches Gatekeeper','TEXT','contacts','mobile_reaches_gatekeeper','mapped','Dialer boolean; GHL text.'),
('contact.gatekeeper_notes','02 Decision Maker','Gatekeeper Notes','LARGE_TEXT','contacts','gatekeeper_notes','mapped',null),
('contact.gatekeeper_name','02 Decision Maker','Gatekeeper Name','TEXT','contacts','gatekeeper_name','mapped',null),
('contact.authority_level','02 Decision Maker','Authority Level','TEXT','contacts','authority_level','mapped',null),
-- 03 Dialer Activity
('contact.callback_date','03 Dialer Activity','Callback Date','DATE','contacts','callback_date','mapped',null),
('contact.revival_date','03 Dialer Activity','Revival Date','DATE','contacts','revival_date','mapped',null),
('contact.dialer_contact_id','03 Dialer Activity','Dialer Contact ID','TEXT','contacts','id','derived','The dialer row id itself.'),
('contact.followup_note','03 Dialer Activity','Follow-Up Note','LARGE_TEXT','contacts','follow_up_note','mapped',null),
('contact.phone_number_quality','03 Dialer Activity','Phone Number Quality','TEXT','contacts','phone_number_quality','mapped','Dialer enum; GHL text.'),
('contact.voicemail_count','03 Dialer Activity','Voicemail Count','NUMERICAL','contacts','voicemail_count','mapped',null),
('contact.phone_type','03 Dialer Activity','Phone Type','TEXT','contacts','phone_type','mapped',null),
('contact.next_followup_date','03 Dialer Activity','Next Follow-Up Date','DATE','contacts','next_followup_date','mapped',null),
('contact.last_called_at','03 Dialer Activity','Last Called At','DATE','contacts','last_called_at','mapped',null),
('contact.dial_count','03 Dialer Activity','Dial Count','NUMERICAL','contacts','call_attempt_count','mapped',null),
('contact.best_time_to_call','03 Dialer Activity','Best Time To Call','TEXT','contacts','best_time_to_call','mapped',null),
('contact.last_call_sentiment','03 Dialer Activity','Last Call Sentiment','TEXT','contacts','last_call_sentiment','mapped',null),
-- 04 Qualification
('contact.proposal_format','04 Qualification','Proposal Format','SINGLE_OPTIONS','contacts','proposal_format','mapped',null),
('contact.buying_timeline','04 Qualification','Buying Timeline','TEXT','contacts','buying_timeline','mapped',null),
('contact.existing_agency_notes','04 Qualification','Existing Agency Notes','LARGE_TEXT','contacts','existing_agency_notes','mapped',null),
('contact.agreed_next_steps','04 Qualification','Agreed Next Steps','LARGE_TEXT','contacts','agreed_next_steps','mapped',null),
('contact.key_quote','04 Qualification','Key Quote','LARGE_TEXT','contacts','key_quote','mapped',null),
('contact.service_type','04 Qualification','Service Type','MULTIPLE_OPTIONS','contacts','service_type','mapped',null),
('contact.monthly_retainer_value','04 Qualification','Monthly Retainer Value','NUMERICAL','contacts','monthly_retainer_value','mapped',null),
('contact.budget_indication','04 Qualification','Budget Indication','TEXT','contacts','budget_indication','mapped',null),
-- 05 Appointments
('contact.last_appointment_calendar','05 Appointments','Last Appointment Calendar','TEXT','contacts','last_appointment_calendar','mapped',null),
('contact.appointment_status','05 Appointments','Appointment Status','SINGLE_OPTIONS','contacts','appointment_status','mapped',null),
('contact.last_appointment_date','05 Appointments','Last Appointment Date','DATE','contacts','latest_appointment_scheduled_for','mapped',null),
('contact.noshow_count','05 Appointments','No-Show Count','NUMERICAL','contacts','noshow_count','mapped',null),
-- 06 Attribution
('contact.utm_source','06 Attribution','UTM Source','TEXT','contacts','utm_source','mapped',null),
('contact.utm_placementmedium','06 Attribution','UTM Placement/Medium','TEXT','contacts','utm_medium','mapped',null),
('contact.utm_campaign_name','06 Attribution','UTM Campaign Name','TEXT','contacts','utm_campaign','mapped',null),
('contact.utm_ad_set__ad_group','06 Attribution','UTM Ad Set / Ad Group','TEXT','contacts','utm_ad_set','mapped',null),
('contact.ad_name__keyword','06 Attribution','Ad Name / Keyword','TEXT','contacts','utm_ad_name','mapped',null),
-- 07 Client Onboarding
('contact.this_questionnaire_should_take_approximately_15_minutes_are_you_ready_to_start','07 Client Onboarding','Questionnaire: ready to start?','RADIO','contact_onboarding','questionnaire_ready','mapped',null),
('contact.forward_leads_to_this_email','07 Client Onboarding','Forward Leads to this email','TEXT','contact_onboarding','forward_leads_to_email','mapped',null),
('contact.forward_lead_calls_to_this_phone_number_mobile','07 Client Onboarding','Forward lead calls to this phone number (mobile)','TEXT','contact_onboarding','forward_lead_calls_to_phone','mapped',null),
('contact.have_you_provided_us_with_access_to_your_digital_marketing_platforms_such_as_google_facebook_etc','07 Client Onboarding','Provided platform access?','RADIO','contact_onboarding','provided_platform_access','mapped',null),
('contact.have_you_provided_us_with_website_access','07 Client Onboarding','Provided website access?','RADIO','contact_onboarding','provided_website_access','mapped',null),
('contact.annual_revenue','07 Client Onboarding','Annual revenue','TEXT','contact_onboarding','annual_revenue','mapped',null),
('contact.services_and_pricing','07 Client Onboarding','Services and Pricing','TEXT','contact_onboarding','services_and_pricing','mapped',null),
('contact.business_description','07 Client Onboarding','Business Description','TEXT','contact_onboarding','business_description','mapped',null),
('contact.1_problem','07 Client Onboarding','#1 Problem','TEXT','contact_onboarding','number_one_problem','mapped',null),
('contact.1_goal','07 Client Onboarding','#1 Goal','LARGE_TEXT','contact_onboarding','number_one_goal','mapped',null),
('contact.current_marketing','07 Client Onboarding','Current Marketing','LARGE_TEXT','contact_onboarding','current_marketing','mapped',null),
('contact.client_vibe','07 Client Onboarding','Client Vibe','TEXT','contact_onboarding','client_vibe','mapped',null),
('contact.concerns_and_notes','07 Client Onboarding','Concerns and Notes','TEXT','contact_onboarding','concerns_and_notes','mapped',null),
('contact.shortterm_and_longterm_business_goals','07 Client Onboarding','Short-term and Long-term Business Goals','LARGE_TEXT','contact_onboarding','shortterm_longterm_goals','mapped',null),
('contact.marketing_objectives','07 Client Onboarding','Marketing Objectives','LARGE_TEXT','contact_onboarding','marketing_objectives','mapped',null),
('contact.kpis','07 Client Onboarding','KPIs','LARGE_TEXT','contact_onboarding','kpis','mapped',null),
('contact.icp','07 Client Onboarding','ICP','LARGE_TEXT','contact_onboarding','icp','mapped',null),
('contact.demographics','07 Client Onboarding','Demographics','LARGE_TEXT','contact_onboarding','demographics','mapped',null),
('contact.interests_pain_points_and_behaviours','07 Client Onboarding','Interests, pain points and behaviours','TEXT','contact_onboarding','interests_pain_points_behaviours','mapped',null),
('contact.competitors','07 Client Onboarding','Competitors','LARGE_TEXT','contact_onboarding','competitors','mapped',null),
('contact.what_sets_your_business_apart_from_competitors','07 Client Onboarding','What sets your business apart from competitors?','LARGE_TEXT','contact_onboarding','what_sets_apart','mapped',null),
('contact.what_is_your_brands_unique_selling_proposition_usp','07 Client Onboarding','What is your brand''s USP?','LARGE_TEXT','contact_onboarding','usp','mapped',null),
('contact.what_tone_of_voice_and_messaging_do_you_want_to_convey_through_digital_marketing_efforts','07 Client Onboarding','Tone of voice and messaging','LARGE_TEXT','contact_onboarding','tone_of_voice','mapped',null),
('contact.are_there_any_industryspecific_regulations_or_compliance_requirements_to_consider_such_as_ahpra','07 Client Onboarding','Industry regulations or compliance (e.g. AHPRA)','LARGE_TEXT','contact_onboarding','compliance_requirements','mapped',null),
('contact.are_there_any_specific_milestones_or_deadlines_to_meet','07 Client Onboarding','Milestones or deadlines','LARGE_TEXT','contact_onboarding','milestones_deadlines','mapped',null),
('contact.what_are_the_top_5_words_you_would_use_to_describe_what_you_do','07 Client Onboarding','Top 5 words to describe what you do','LARGE_TEXT','contact_onboarding','top_5_words','mapped',null),
('contact.do_you_have_a_specific_media_spend_that_you_are_thinking_or_are_you_unsure_and_want_our_help_in_determining_this','07 Client Onboarding','Specific media spend in mind?','TEXT','contact_onboarding','media_spend_intent','mapped',null),
-- General Info
('contact.trade_type','General Info','Trade Type','TEXT','contacts','trade_type','mapped',null),
('contact.industry','General Info','Industry','TEXT','contacts','industry','mapped',null),
('contact.decision_maker_phone','General Info','Decision Maker Phone','TEXT','contacts','dm_phone','mapped',null),
('contact.business_size','General Info','Business Size','TEXT','contacts','business_size','mapped','Dialer bands: One-man band (1-2) / Team (3+); headcount in contacts.team_size.'),
('contact.website_not_always_formatted','General Info','Website (Not always formatted)','TEXT','contacts','website','mapped',null),
('contact.years_in_business','General Info','Years In Business','NUMERICAL','contacts','years_in_business','mapped',null),
('contact.work_type','General Info','Work Type','TEXT','contacts','work_type','mapped',null),
('contact.decision_maker_email','General Info','Decision Maker Email','TEXT','contacts','dm_email','mapped',null),
('contact.abn','General Info','ABN','TEXT','contacts','abn','mapped',null),
('contact.vertical','General Info','Vertical','SINGLE_OPTIONS','contacts','vertical','mapped',null),
('contact.lead_source_channel','General Info','Lead Source Channel','SINGLE_OPTIONS','contacts','lead_channel','mapped','Dialer channel names map through mapLeadSourceChannel in supabase/functions/ghl.'),
('contact.prospect_tier','General Info','Prospect Tier','SINGLE_OPTIONS','contacts','prospect_tier','mapped',null),
('contact.decision_maker_name','General Info','Decision Maker Name','TEXT','contacts','dm_name','mapped',null),
('contact.best_route_to_decision_maker','General Info','Best Route To Decision Maker','TEXT','contacts','best_route_to_decision_maker','mapped',null),
-- Additional Info
('contact.runs_facebook_ads','Additional Info','Runs Facebook Ads','TEXT','contacts','has_facebook_ads','mapped',null),
('contact.runs_google_ads','Additional Info','Runs Google Ads','TEXT','contacts','has_google_ads','mapped',null),
('contact.has_seo','Additional Info','Has SEO','TEXT','contacts','has_seo','mapped',null),
('contact.nurture_last_email','Additional Info','Nurture Last Email','NUMERICAL','contacts','nurture_last_email','mapped',null),
('contact.facebook_ads_manager_id','Additional Info','Facebook Ads Manager Id','TEXT','contacts','facebook_ads_manager_id','mapped',null),
('contact.existing_agency_services','Additional Info','Existing Agency Services','TEXT','contacts','existing_agency_services','mapped','Dialer text[]; GHL text.'),
('contact.existing_agency','Additional Info','Existing Agency','TEXT','contacts','existing_agency_name','mapped','has_existing_agency (bool) is the yes/no; this carries the name.'),
('contact.buying_signal_strength','Additional Info','Buying Signal Strength','TEXT','contacts','buying_signal_strength','mapped',null),
('contact.gmb_link','Additional Info','GMB Link','TEXT','contacts','gmb_link','mapped',null),
('contact.google_rating','Additional Info','Google Rating','NUMERICAL','contacts','google_rating','mapped',null),
('contact.google_review_count','Additional Info','Google Review Count','NUMERICAL','contacts','google_review_count','mapped',null),
('contact.monthly_media_spend','Additional Info','Monthly Media Spend','TEXT','contacts','current_monthly_ad_spend','mapped',null),
-- Student Fields
('contact.student_name','Student Fields','Student First Name','TEXT','contacts','student_first_name','mapped',null),
('contact.student_last_name','Student Fields','Student Last Name','TEXT','contacts','student_last_name','mapped',null),
('contact.student_email','Student Fields','Student Email','TEXT','contacts','student_email','mapped',null),
('contact.student_outreach_email','Student Fields','Student Outreach Email','TEXT','contacts','student_outreach_email','mapped',null),
('contact.student_purchased_from_list','Student Fields','Student Purchased From List?','RADIO','contacts','student_purchased_from_list','mapped',null),
-- 99 Legacy - Pending Removal (no dialer columns on purpose)
('contact.re_contract_gst','99 Legacy - Pending Removal','RE Contract GST','NUMERICAL',null,null,'skip_legacy',null),
('contact.upload_your_leads_list','99 Legacy - Pending Removal','Upload Your Leads List','FILE_UPLOAD',null,null,'skip_legacy',null),
('contact.please_enter_the_clients_response_to_your_outreach_email_belowthis_question_is_required','99 Legacy - Pending Removal','Client response to outreach email','LARGE_TEXT',null,null,'skip_legacy',null),
('contact.re_contract_amount_due','99 Legacy - Pending Removal','RE Contract Amount Due','NUMERICAL',null,null,'skip_legacy',null),
('contact.when_did_the_client_reply_to_your_email','99 Legacy - Pending Removal','When did the client reply to your email?','DATE',null,null,'skip_legacy',null),
('contact.re_contract_subtotal','99 Legacy - Pending Removal','RE Contract Subtotal','NUMERICAL',null,null,'skip_legacy',null),
('contact.timeline','99 Legacy - Pending Removal','Timeline','TEXT',null,null,'skip_legacy',null),
('contact.services','99 Legacy - Pending Removal','Services','TEXT',null,null,'skip_legacy',null),
('contact.what_is_your_abn','99 Legacy - Pending Removal','What is your ABN?','TEXT',null,null,'skip_legacy','Superseded by contact.abn.'),
('contact.briefly_describe_your_ideal_customer_profile_this_information_will_help_us_target_our_ads','99 Legacy - Pending Removal','Ideal customer profile','LARGE_TEXT',null,null,'skip_legacy',null),
('contact.write_down_all_the_benefits__unique_selling_points_that_makes_a_customer_choose_you_over_someone_else_for_the_job_any_benefits_we_can_use__mention_in_the_advertisements','99 Legacy - Pending Removal','Benefits / USPs for ads','LARGE_TEXT',null,null,'skip_legacy',null),
('contact.re_contract_lp_quantity','99 Legacy - Pending Removal','RE Contract LP Quantity','NUMERICAL',null,null,'skip_legacy',null),
('contact.what_is_your_monthly_ad_budget_this_money_doesnt_go_to_us_we_dont_recommend_less_than_900','99 Legacy - Pending Removal','Monthly ad budget','TEXT',null,null,'skip_legacy',null),
('contact.re_contract_social_media_quantity','99 Legacy - Pending Removal','RE Contract Social Media Quantity','NUMERICAL',null,null,'skip_legacy',null),
('contact.re_contract_lp_price','99 Legacy - Pending Removal','RE Contract LP Price','NUMERICAL',null,null,'skip_legacy',null),
('contact.what_area_do_you_want_us_to_advertise_in_provide_location__km_radius_or_a_list_of_zippostcodesarea_codes','99 Legacy - Pending Removal','Advertising area','LARGE_TEXT',null,null,'skip_legacy',null),
('contact.other_service','99 Legacy - Pending Removal','Other Service','TEXT',null,null,'skip_legacy',null),
('contact.business_type','99 Legacy - Pending Removal','Business Type','TEXT',null,null,'skip_legacy',null),
('contact.budget','99 Legacy - Pending Removal','Budget','TEXT',null,null,'skip_legacy',null),
('contact.re_contract_payment_day_of_month','99 Legacy - Pending Removal','RE Contract Payment Day Of Month','TEXT',null,null,'skip_legacy',null)
on conflict (ghl_field_key) do update set ghl_folder = excluded.ghl_folder, ghl_label = excluded.ghl_label,
  ghl_data_type = excluded.ghl_data_type, dialer_table = excluded.dialer_table, dialer_column = excluded.dialer_column,
  status = excluded.status, notes = excluded.notes;

-- Fields the dialer's Contact Intelligence tab shows that do not exist in GHL.
-- A two-way sync has to create these in GHL first. Keys are the ones
-- src/lib/ghlFieldFolders.ts already uses.
insert into public.ghl_field_map (ghl_field_key, ghl_folder, ghl_label, ghl_data_type, dialer_table, dialer_column, status, notes) values
('contact.need_identified','Not in GHL yet','Need Identified','TEXT','contacts','need_identified','dialer_only',null),
('contact.current_solution_satisfaction','Not in GHL yet','Current Solution Satisfaction','TEXT','contacts','current_solution_satisfaction','dialer_only',null),
('contact.contractlockin_status','Not in GHL yet','Contract / Lock-in Status','TEXT','contacts','contract_lockin_status','dialer_only',null),
('contact.key_objection','Not in GHL yet','Key Objection','TEXT','contacts','key_objection','dialer_only',null),
('contact.service_area','Not in GHL yet','Service Area','TEXT','contacts','service_area','dialer_only',null),
('contact.number_of_trucksvans','Not in GHL yet','Trucks / Vans','TEXT','contacts','number_of_trucks_vans','dialer_only',null),
('contact.estimated_annual_revenue','Not in GHL yet','Estimated Annual Revenue','TEXT','contacts','estimated_annual_revenue','dialer_only',null),
('contact.website_url','Not in GHL yet','Website URL','TEXT','contacts','website','dialer_only',null),
('contact.website_quality','Not in GHL yet','Website Quality','TEXT','contacts','website_quality','dialer_only',null),
('contact.current_monthly_ad_spend','Not in GHL yet','Monthly Ad Spend','TEXT','contacts','current_monthly_ad_spend','dialer_only',null),
('contact.current_marketing_channels','Not in GHL yet','Marketing Channels','TEXT','contacts','current_marketing_channels','dialer_only',null),
('contact.social_media_presence','Not in GHL yet','Social Media Presence','TEXT','contacts','social_media_presence','dialer_only',null),
('contact.agency_satisfaction','Not in GHL yet','Agency Satisfaction','TEXT','contacts','agency_satisfaction','dialer_only',null),
('contact.lead_source_dependency','Not in GHL yet','Lead Source Dependency','TEXT','contacts','lead_source_dependency','dialer_only',null),
('contact.marketing_pain_points','Not in GHL yet','Marketing Pain Points','TEXT','contacts','marketing_pain_points','dialer_only',null),
('contact.problem_resonance','Not in GHL yet','Problem Resonance','TEXT','contacts','problem_resonance','dialer_only',null),
('contact.competitive_intel','Not in GHL yet','Competitive Intel','TEXT','contacts','competitive_intel','dialer_only',null),
('contact.rep_coaching_notes','Not in GHL yet','Rep Coaching Notes','TEXT','contacts','rep_coaching_notes','dialer_only',null),
('contact.ai_call_summary','Not in GHL yet','AI Call Summary','TEXT','contacts','call_intel_summary','dialer_only',null),
('contact.gatekeeper_role','Not in GHL yet','Gatekeeper Role','TEXT','contacts','gatekeeper_role','dialer_only',null),
('contact.decision_maker_phone_type','Not in GHL yet','DM Phone Type','TEXT','contacts','dm_phone_type','dialer_only',null),
('contact.last_contacted_date','Not in GHL yet','Last Contacted','TEXT','contacts','last_called_at','dialer_only',null),
('contact.preferred_contact_method','Not in GHL yet','Preferred Contact Method','TEXT','contacts','preferred_contact_method','dialer_only',null),
('contact.call_disposition','Not in GHL yet','Call Disposition','TEXT','contacts','last_outcome','derived','Last call outcome.'),
('contact.objection_notes','Not in GHL yet','Objection Notes','TEXT','contacts','objection_notes','dialer_only',null),
('contact.meeting_set_by_role','Not in GHL yet','Meeting Set By (Role)','TEXT','pipeline_items',null,'derived','Role of the latest booking creator.'),
('contact.setter_name','Not in GHL yet','Setter Name','TEXT','pipeline_items',null,'derived','Booking created_by on the latest booked pipeline_item.'),
('contact.assigned_closer','Not in GHL yet','Assigned Closer','TEXT','pipeline_items',null,'derived','Booking assigned_user_id on the latest booked pipeline_item (set from the GHL event owner).'),
('contact.meeting_source','Not in GHL yet','Meeting Source','TEXT','pipeline_items',null,'derived','Channel of the latest booking (dialer or GHL calendar).'),
('contact.has_existing_agency','Not in GHL yet','Existing Agency','TEXT','contacts','has_existing_agency','dialer_only','Dialer boolean.'),
('contact.existing_agency_name','Not in GHL yet','Existing Agency Name','TEXT','contacts','existing_agency_name','dialer_only',null),
('contact.team_size','Not in GHL yet','Team Size (headcount)','TEXT','contacts','team_size','dialer_only',null),
('contact.team_size_evidence','Not in GHL yet','Team Size Evidence','TEXT','contacts','team_size_evidence','dialer_only',null)
on conflict (ghl_field_key) do update set ghl_folder = excluded.ghl_folder, ghl_label = excluded.ghl_label,
  ghl_data_type = excluded.ghl_data_type, dialer_table = excluded.dialer_table, dialer_column = excluded.dialer_column,
  status = excluded.status, notes = excluded.notes;
