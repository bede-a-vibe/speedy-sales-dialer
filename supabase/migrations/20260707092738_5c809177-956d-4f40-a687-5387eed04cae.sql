
-- 1. Drop unused older overloads (keep the newest one with _lead_type/_lead_channel/_lead_source/_call_recency)
DROP FUNCTION IF EXISTS public.claim_dialer_leads(
  _session_id uuid, _claim_size integer, _lock_minutes integer,
  _industries text[], _states text[], _trade_types text[],
  _work_type text, _business_size text, _prospect_tier text,
  _min_gbp_rating numeric, _min_review_count integer,
  _has_google_ads text, _has_facebook_ads text, _buying_signal_strength text,
  _phone_type text, _has_dm_phone boolean, _contact_owner text
);

DROP FUNCTION IF EXISTS public.claim_dialer_leads(
  _session_id uuid, _claim_size integer, _lock_minutes integer,
  _industries text[], _states text[], _trade_types text[],
  _work_type text, _business_size text, _prospect_tier text,
  _min_gbp_rating numeric, _min_review_count integer,
  _has_google_ads text, _has_facebook_ads text, _buying_signal_strength text,
  _phone_type text, _has_dm_phone boolean, _contact_owner text,
  _include_dnc boolean, _include_disqualified boolean,
  _dnc_reasons text[], _dq_reasons text[],
  _has_existing_agency text, _existing_agency_services text[]
);

DROP FUNCTION IF EXISTS public.get_dialer_queue_count(
  _session_id uuid, _industries text[], _states text[], _trade_types text[],
  _work_type text, _business_size text, _prospect_tier text,
  _min_gbp_rating numeric, _min_review_count integer,
  _has_google_ads text, _has_facebook_ads text, _buying_signal_strength text,
  _phone_type text, _has_dm_phone boolean, _contact_owner text
);

DROP FUNCTION IF EXISTS public.get_dialer_queue_count(
  _session_id uuid, _industries text[], _states text[], _trade_types text[],
  _work_type text, _business_size text, _prospect_tier text,
  _min_gbp_rating numeric, _min_review_count integer,
  _has_google_ads text, _has_facebook_ads text, _buying_signal_strength text,
  _phone_type text, _has_dm_phone boolean, _contact_owner text,
  _include_dnc boolean, _include_disqualified boolean,
  _dnc_reasons text[], _dq_reasons text[],
  _has_existing_agency text, _existing_agency_services text[]
);

-- 2. Performance indexes (additive)
CREATE INDEX IF NOT EXISTS idx_contacts_is_archived ON public.contacts (is_archived) WHERE is_archived IS NOT TRUE;
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle_stage ON public.contacts (lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_type ON public.contacts (lead_type);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_channel ON public.contacts (lead_channel);
CREATE INDEX IF NOT EXISTS idx_contacts_lead_source ON public.contacts (lead_source);
CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON public.contacts (owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_prospect_tier ON public.contacts (prospect_tier);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_type ON public.contacts (phone_type);
CREATE INDEX IF NOT EXISTS idx_contacts_call_attempt_count ON public.contacts (call_attempt_count);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number_quality ON public.contacts (phone_number_quality);
CREATE INDEX IF NOT EXISTS idx_contacts_last_called_at ON public.contacts (last_called_at);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON public.contacts (status);
-- Composite hot path for dialer queue eligibility scan
CREATE INDEX IF NOT EXISTS idx_contacts_queue_hot ON public.contacts (status, is_archived, phone_number_quality, call_attempt_count) WHERE status = 'uncalled' AND is_archived IS NOT TRUE;
-- Pending GHL pushes health
CREATE INDEX IF NOT EXISTS idx_pending_ghl_pushes_status ON public.pending_ghl_pushes (status, updated_at DESC);
