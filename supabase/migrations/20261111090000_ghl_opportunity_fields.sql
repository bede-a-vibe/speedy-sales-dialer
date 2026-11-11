-- GHL "Opportunity Details" folder: the opportunity custom fields get a home on
-- the dialer's meeting/deal row (pipeline_items, linked to GHL through
-- meeting_ghl_opportunity_id), and rows in ghl_field_map. Applied 11 Nov 2026.
alter table public.pipeline_items
  add column if not exists deal_type text,
  add column if not exists service_stream text,
  add column if not exists setup_fee numeric,
  add column if not exists proposed_mrr numeric,
  add column if not exists commitment_type text,
  add column if not exists minimum_term_months integer,
  add column if not exists billing_start_date date,
  add column if not exists churn_date date,
  add column if not exists churn_reason text,
  add column if not exists proposal_sent_date date,
  add column if not exists client_deal_id text,
  add column if not exists decision_makers_involved integer,
  add column if not exists competing_agency text;

insert into public.ghl_field_map (ghl_field_key, ghl_folder, ghl_label, ghl_data_type, dialer_table, dialer_column, status, notes) values
('opportunity.deal_type','Opportunity Details','Deal Type','SINGLE_OPTIONS','pipeline_items','deal_type','mapped','Options: Retainer, One-off Project, Retainer + Setup, Performance.'),
('opportunity.service_stream','Opportunity Details','Service Stream','SINGLE_OPTIONS','pipeline_items','service_stream','mapped','Options: SEO, Google Ads, Meta Ads, Website, GMB, Multi-service, Other.'),
('opportunity.setup_fee','Opportunity Details','Setup Fee','MONETORY','pipeline_items','setup_fee','mapped','Quoted setup fee. deal_value holds the setup actually won on close.'),
('opportunity.proposed_mrr','Opportunity Details','Proposed MRR','MONETORY','pipeline_items','proposed_mrr','mapped','Quoted MRR. monthly_recurring_value holds the MRR actually won on close.'),
('opportunity.commitment_type','Opportunity Details','Commitment Type','SINGLE_OPTIONS','pipeline_items','commitment_type','mapped','Options: Month-to-Month, Minimum Term then Month-to-Month, Fixed Term.'),
('opportunity.minimum_term_months','Opportunity Details','Minimum Term Months','NUMERICAL','pipeline_items','minimum_term_months','mapped',null),
('opportunity.billing_start_date','Opportunity Details','Billing Start Date','DATE','pipeline_items','billing_start_date','mapped','client_deals.start_date is the revenue record''s copy.'),
('opportunity.churn_date','Opportunity Details','Churn Date','DATE','pipeline_items','churn_date','mapped','client_deals.end_date is the revenue record''s copy.'),
('opportunity.churn_reason','Opportunity Details','Churn Reason','SINGLE_OPTIONS','pipeline_items','churn_reason','mapped',null),
('opportunity.proposal_sent_date','Opportunity Details','Proposal Sent Date','DATE','pipeline_items','proposal_sent_date','mapped',null),
('opportunity.client_deal_id','Opportunity Details','Client Deal ID','TEXT','pipeline_items','client_deal_id','mapped','Links the opportunity to client_deals.id.'),
('opportunity.decision_makers_involved','Opportunity Details','Decision Makers Involved','NUMERICAL','pipeline_items','decision_makers_involved','mapped',null),
('opportunity.competing_agency','Opportunity Details','Competing Agency','TEXT','pipeline_items','competing_agency','mapped',null),
('opportunity.industry','Opportunity Details','Industry','TEXT','contacts','industry','mapped','Same as the contact''s industry.'),
('opportunity.to_guarantee_10_minimum_clients_there_will_be_a_needed_investment_of_2k','Opportunity Details','To Guarantee 10 Minimum Clients there will be a needed investment of 2k','RADIO',null,null,'skip_legacy','Old funnel question, created Feb 2026.')
on conflict (ghl_field_key) do update set ghl_folder = excluded.ghl_folder, ghl_label = excluded.ghl_label, ghl_data_type = excluded.ghl_data_type,
  dialer_table = excluded.dialer_table, dialer_column = excluded.dialer_column, status = excluded.status, notes = excluded.notes;

-- GHL built-in (standard) contact fields, in GHL's "Contact", "Company Info" and
-- "General Info" folders. They are top-level contact attributes in GHL's API,
-- not custom fields, so they are keyed by attribute name with status 'standard'.
alter table public.contacts
  add column if not exists date_of_birth date,
  add column if not exists contact_type text,
  add column if not exists address1 text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists timezone text;

alter table public.ghl_field_map drop constraint if exists ghl_field_map_status_check;
alter table public.ghl_field_map add constraint ghl_field_map_status_check check (status in ('mapped', 'derived', 'skip_legacy', 'dialer_only', 'standard'));

insert into public.ghl_field_map (ghl_field_key, ghl_folder, ghl_label, ghl_data_type, dialer_table, dialer_column, status, notes) values
('contact.firstName','Contact','First Name','STANDARD','contacts','contact_person','standard','GHL built-in. Dialer keeps the full name in contact_person; split on sync.'),
('contact.lastName','Contact','Last Name','STANDARD','contacts','contact_person','standard','GHL built-in. Dialer keeps the full name in contact_person; split on sync.'),
('contact.email','Contact','Email','STANDARD','contacts','email','standard','GHL built-in.'),
('contact.phone','Contact','Phone','STANDARD','contacts','phone','standard','GHL built-in.'),
('contact.dateOfBirth','Contact','Date of Birth','STANDARD','contacts','date_of_birth','standard','GHL built-in.'),
('contact.source','Contact','Contact Source','STANDARD','contacts','lead_source','standard','GHL built-in.'),
('contact.type','Contact','Contact Type','STANDARD','contacts','contact_type','standard','GHL built-in: lead or customer.'),
('contact.companyName','Company Info','Business Name','STANDARD','contacts','business_name','standard','GHL built-in.'),
('contact.address1','Company Info','Street Address','STANDARD','contacts','address1','standard','GHL built-in.'),
('contact.city','Company Info','City','STANDARD','contacts','city','standard','GHL built-in.'),
('contact.state','Company Info','State','STANDARD','contacts','state','standard','GHL built-in.'),
('contact.postalCode','Company Info','Postal Code','STANDARD','contacts','postal_code','standard','GHL built-in.'),
('contact.country','Company Info','Country','STANDARD','contacts','country','standard','GHL built-in.'),
('contact.website','Company Info','Website','STANDARD','contacts','website','standard','GHL built-in.'),
('contact.timezone','Company Info','Time Zone','STANDARD','contacts','timezone','standard','GHL built-in.'),
('contact.assignedTo','General Info','Assigned User','STANDARD','contacts','owner_id','standard','GHL user id; map through ghl_users.provisioned_user_id.'),
('contact.tags','General Info','Tags','STANDARD','contacts','tags','standard','GHL built-in.'),
('contact.dnd','General Info','DND','STANDARD','contacts','is_dnc','standard','GHL built-in.')
on conflict (ghl_field_key) do update set ghl_folder = excluded.ghl_folder, ghl_label = excluded.ghl_label, ghl_data_type = excluded.ghl_data_type,
  dialer_table = excluded.dialer_table, dialer_column = excluded.dialer_column, status = excluded.status, notes = excluded.notes;
