-- Add new filterable columns to the contacts table for dialer filtering
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS trade_type TEXT,
  ADD COLUMN IF NOT EXISTS work_type TEXT,
  ADD COLUMN IF NOT EXISTS business_size TEXT,
  ADD COLUMN IF NOT EXISTS prospect_tier TEXT,
  ADD COLUMN IF NOT EXISTS gbp_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_google_ads TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS has_facebook_ads TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS buying_signal_strength TEXT,
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;

-- Create indexes for the most commonly filtered columns
CREATE INDEX IF NOT EXISTS idx_contacts_trade_type ON public.contacts(trade_type);
CREATE INDEX IF NOT EXISTS idx_contacts_work_type ON public.contacts(work_type);
CREATE INDEX IF NOT EXISTS idx_contacts_business_size ON public.contacts(business_size);
CREATE INDEX IF NOT EXISTS idx_contacts_prospect_tier ON public.contacts(prospect_tier);
CREATE INDEX IF NOT EXISTS idx_contacts_gbp_rating ON public.contacts(gbp_rating);
CREATE INDEX IF NOT EXISTS idx_contacts_has_google_ads ON public.contacts(has_google_ads);
CREATE INDEX IF NOT EXISTS idx_contacts_has_facebook_ads ON public.contacts(has_facebook_ads);
CREATE INDEX IF NOT EXISTS idx_contacts_buying_signal_strength ON public.contacts(buying_signal_strength);
CREATE INDEX IF NOT EXISTS idx_contacts_ghl_contact_id ON public.contacts(ghl_contact_id);

-- Update the claim_dialer_leads function to support new filter parameters
CREATE OR REPLACE FUNCTION public.claim_dialer_leads(
  _session_id uuid,
  _industry text DEFAULT NULL::text,
  _state text DEFAULT NULL::text,
  _claim_size integer DEFAULT 25,
  _lock_minutes integer DEFAULT 15,
  _trade_type text DEFAULT NULL::text,
  _work_type text DEFAULT NULL::text,
  _business_size text DEFAULT NULL::text,
  _prospect_tier text DEFAULT NULL::text,
  _min_gbp_rating numeric DEFAULT NULL::numeric,
  _min_review_count integer DEFAULT NULL::integer,
  _has_google_ads text DEFAULT NULL::text,
  _has_facebook_ads text DEFAULT NULL::text,
  _buying_signal_strength text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id UUID := auth.uid();
  _normalized_claim_size INTEGER := LEAST(GREATEST(COALESCE(_claim_size, 25), 0), 100);
  _normalized_lock_minutes INTEGER := LEAST(GREATEST(COALESCE(_lock_minutes, 15), 1), 60);
  _result JSONB;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Clean up expired locks
  DELETE FROM public.dialer_lead_locks
  WHERE expires_at <= now();

  WITH visible_contacts AS (
    SELECT
      c.id,
      c.call_attempt_count,
      c.created_at,
      l.session_id AS lock_session_id
    FROM public.contacts c
    LEFT JOIN public.dialer_lead_locks l
      ON l.contact_id = c.id
     AND l.expires_at > now()
    WHERE c.status = 'uncalled'
      AND c.is_dnc = false
      AND (_industry IS NULL OR _industry = 'all' OR c.industry = _industry)
      AND (_state IS NULL OR _state = 'all' OR c.state = _state)
      AND (_trade_type IS NULL OR _trade_type = 'all' OR c.trade_type = _trade_type)
      AND (_work_type IS NULL OR _work_type = 'all' OR c.work_type = _work_type)
      AND (_business_size IS NULL OR _business_size = 'all' OR c.business_size = _business_size)
      AND (_prospect_tier IS NULL OR _prospect_tier = 'all' OR c.prospect_tier = _prospect_tier)
      AND (_min_gbp_rating IS NULL OR c.gbp_rating >= _min_gbp_rating)
      AND (_min_review_count IS NULL OR c.review_count >= _min_review_count)
      AND (_has_google_ads IS NULL OR _has_google_ads = 'all' OR c.has_google_ads = _has_google_ads)
      AND (_has_facebook_ads IS NULL OR _has_facebook_ads = 'all' OR c.has_facebook_ads = _has_facebook_ads)
      AND (_buying_signal_strength IS NULL OR _buying_signal_strength = 'all' OR c.buying_signal_strength = _buying_signal_strength)
      AND (l.contact_id IS NULL OR l.session_id = _session_id)
  ),
  total_available AS (
    SELECT COUNT(*)::INT AS total_count
    FROM visible_contacts
  ),
  claimable_contacts AS (
    SELECT vc.id
    FROM visible_contacts vc
    WHERE vc.lock_session_id IS NULL
    ORDER BY vc.call_attempt_count ASC, random()
    LIMIT _normalized_claim_size
  ),
  inserted_locks AS (
    INSERT INTO public.dialer_lead_locks (
      contact_id,
      user_id,
      session_id,
      industry,
      state,
      expires_at
    )
    SELECT
      cc.id,
      _user_id,
      _session_id,
      _industry,
      _state,
      now() + make_interval(mins => _normalized_lock_minutes)
    FROM claimable_contacts cc
    WHERE _normalized_claim_size > 0
    ON CONFLICT (contact_id) DO NOTHING
    RETURNING contact_id
  ),
  claimed_contacts AS (
    SELECT
      c.id,
      c.business_name,
      c.call_attempt_count,
      c.city,
      c.contact_person,
      c.created_at,
      c.email,
      c.gmb_link,
      c.industry,
      c.is_dnc,
      c.last_outcome,
      c.latest_appointment_outcome,
      c.latest_appointment_recorded_at,
      c.latest_appointment_scheduled_for,
      c.phone,
      c.state,
      c.status,
      c.updated_at,
      c.uploaded_by,
      c.website,
      c.trade_type,
      c.work_type,
      c.business_size,
      c.prospect_tier,
      c.gbp_rating,
      c.review_count,
      c.has_google_ads,
      c.has_facebook_ads,
      c.buying_signal_strength,
      c.ghl_contact_id
    FROM inserted_locks il
    JOIN public.contacts c ON c.id = il.contact_id
    ORDER BY c.call_attempt_count ASC, random()
  )
  SELECT jsonb_build_object(
    'total_available_count', COALESCE((SELECT total_count FROM total_available), 0),
    'claimed_contacts', COALESCE((SELECT jsonb_agg(to_jsonb(claimed_contacts)) FROM claimed_contacts), '[]'::jsonb)
  )
  INTO _result;

  RETURN COALESCE(_result, jsonb_build_object('total_available_count', 0, 'claimed_contacts', '[]'::jsonb));
END;
$function$;

-- Update get_dialer_queue_count to support new filters too
CREATE OR REPLACE FUNCTION public.get_dialer_queue_count(
  _session_id uuid,
  _industry text DEFAULT NULL::text,
  _state text DEFAULT NULL::text,
  _trade_type text DEFAULT NULL::text,
  _work_type text DEFAULT NULL::text,
  _business_size text DEFAULT NULL::text,
  _prospect_tier text DEFAULT NULL::text,
  _min_gbp_rating numeric DEFAULT NULL::numeric,
  _min_review_count integer DEFAULT NULL::integer,
  _has_google_ads text DEFAULT NULL::text,
  _has_facebook_ads text DEFAULT NULL::text,
  _buying_signal_strength text DEFAULT NULL::text
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _count INTEGER;
BEGIN
  SELECT COUNT(*)::INT INTO _count
  FROM public.contacts c
  LEFT JOIN public.dialer_lead_locks l
    ON l.contact_id = c.id
   AND l.expires_at > now()
  WHERE c.status = 'uncalled'
    AND c.is_dnc = false
    AND (_industry IS NULL OR _industry = 'all' OR c.industry = _industry)
    AND (_state IS NULL OR _state = 'all' OR c.state = _state)
    AND (_trade_type IS NULL OR _trade_type = 'all' OR c.trade_type = _trade_type)
    AND (_work_type IS NULL OR _work_type = 'all' OR c.work_type = _work_type)
    AND (_business_size IS NULL OR _business_size = 'all' OR c.business_size = _business_size)
    AND (_prospect_tier IS NULL OR _prospect_tier = 'all' OR c.prospect_tier = _prospect_tier)
    AND (_min_gbp_rating IS NULL OR c.gbp_rating >= _min_gbp_rating)
    AND (_min_review_count IS NULL OR c.review_count >= _min_review_count)
    AND (_has_google_ads IS NULL OR _has_google_ads = 'all' OR c.has_google_ads = _has_google_ads)
    AND (_has_facebook_ads IS NULL OR _has_facebook_ads = 'all' OR c.has_facebook_ads = _has_facebook_ads)
    AND (_buying_signal_strength IS NULL OR _buying_signal_strength = 'all' OR c.buying_signal_strength = _buying_signal_strength)
    AND (l.contact_id IS NULL OR l.session_id = _session_id);

  RETURN _count;
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.claim_dialer_leads(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dialer_queue_count(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
