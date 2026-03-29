-- ============================================================
-- Migration: Phone Type Classification & Decision Maker Tracking
-- ============================================================

-- 1. Add new columns to contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_type TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS dm_name TEXT,
  ADD COLUMN IF NOT EXISTS dm_role TEXT,
  ADD COLUMN IF NOT EXISTS dm_phone TEXT,
  ADD COLUMN IF NOT EXISTS dm_phone_type TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS dm_email TEXT,
  ADD COLUMN IF NOT EXISTS gatekeeper_name TEXT,
  ADD COLUMN IF NOT EXISTS best_time_to_call TEXT;

-- 2. Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_contacts_phone_type ON public.contacts(phone_type);
CREATE INDEX IF NOT EXISTS idx_contacts_dm_phone ON public.contacts(dm_phone);
CREATE INDEX IF NOT EXISTS idx_contacts_dm_phone_type ON public.contacts(dm_phone_type);

-- 3. Create the phone type classification function
CREATE OR REPLACE FUNCTION public.classify_au_phone_type(phone_number TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  cleaned TEXT;
BEGIN
  IF phone_number IS NULL OR phone_number = '' THEN
    RETURN 'unknown';
  END IF;

  -- Strip all non-digit characters except leading +
  cleaned := regexp_replace(phone_number, '[^0-9+]', '', 'g');

  -- Australian mobile: 04xx or +614xx
  IF cleaned ~ '^04[0-9]' THEN
    RETURN 'mobile';
  END IF;
  IF cleaned ~ '^\+?614[0-9]' THEN
    RETURN 'mobile';
  END IF;

  -- Australian landline: 02, 03, 07, 08 or +612, +613, +617, +618
  IF cleaned ~ '^0[2378][0-9]' THEN
    RETURN 'landline';
  END IF;
  IF cleaned ~ '^\+?61[2378][0-9]' THEN
    RETURN 'landline';
  END IF;

  -- Business/toll-free: 1300, 1800, 13xx
  IF cleaned ~ '^1300' THEN
    RETURN 'business_line';
  END IF;
  IF cleaned ~ '^1800' THEN
    RETURN 'business_line';
  END IF;
  IF cleaned ~ '^13[0-9]{2}$' THEN
    RETURN 'business_line';
  END IF;

  RETURN 'unknown';
END;
$function$;

-- 4. Create trigger function to auto-classify phone types on insert/update
CREATE OR REPLACE FUNCTION public.auto_classify_phone_types()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Classify the main phone number
  IF NEW.phone IS DISTINCT FROM OLD.phone OR TG_OP = 'INSERT' THEN
    NEW.phone_type := public.classify_au_phone_type(NEW.phone);
  END IF;

  -- Classify the DM phone number
  IF NEW.dm_phone IS DISTINCT FROM OLD.dm_phone OR TG_OP = 'INSERT' THEN
    NEW.dm_phone_type := public.classify_au_phone_type(NEW.dm_phone);
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Create the trigger
DROP TRIGGER IF EXISTS trg_auto_classify_phone_types ON public.contacts;
CREATE TRIGGER trg_auto_classify_phone_types
  BEFORE INSERT OR UPDATE OF phone, dm_phone
  ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_classify_phone_types();

-- 6. Backfill phone_type for all existing contacts
UPDATE public.contacts
SET phone_type = public.classify_au_phone_type(phone)
WHERE phone IS NOT NULL AND phone != '';

-- 7. Update the claim_dialer_leads function to support phone_type and has_dm_phone filters
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
  _buying_signal_strength text DEFAULT NULL::text,
  _phone_type text DEFAULT NULL::text,
  _has_dm_phone boolean DEFAULT NULL::boolean
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
      AND (_phone_type IS NULL OR _phone_type = 'all' OR c.phone_type = _phone_type)
      AND (_has_dm_phone IS NULL OR (_has_dm_phone = true AND c.dm_phone IS NOT NULL AND c.dm_phone != '') OR (_has_dm_phone = false AND (c.dm_phone IS NULL OR c.dm_phone = '')))
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
      c.contact_person,
      c.phone,
      c.phone_type,
      c.email,
      c.website,
      c.gmb_link,
      c.industry,
      c.city,
      c.state,
      c.call_attempt_count,
      c.dm_name,
      c.dm_role,
      c.dm_phone,
      c.dm_phone_type,
      c.dm_email,
      c.gatekeeper_name,
      c.best_time_to_call,
      c.ghl_contact_id
    FROM public.contacts c
    INNER JOIN inserted_locks il ON il.contact_id = c.id
  )
  SELECT jsonb_build_object(
    'claimed', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', cc.id,
          'business_name', cc.business_name,
          'contact_person', cc.contact_person,
          'phone', cc.phone,
          'phone_type', cc.phone_type,
          'email', cc.email,
          'website', cc.website,
          'gmb_link', cc.gmb_link,
          'industry', cc.industry,
          'city', cc.city,
          'state', cc.state,
          'call_attempt_count', cc.call_attempt_count,
          'dm_name', cc.dm_name,
          'dm_role', cc.dm_role,
          'dm_phone', cc.dm_phone,
          'dm_phone_type', cc.dm_phone_type,
          'dm_email', cc.dm_email,
          'gatekeeper_name', cc.gatekeeper_name,
          'best_time_to_call', cc.best_time_to_call,
          'ghl_contact_id', cc.ghl_contact_id
        )
      FROM claimed_contacts cc), '[]'::jsonb),
    'total_available', (SELECT total_count FROM total_available)
  ) INTO _result;

  RETURN _result;
END;
$function$;

-- 8. Grant execute permission
GRANT EXECUTE ON FUNCTION public.classify_au_phone_type(TEXT) TO authenticated;

-- 9. Enable RLS policies for the new columns (they inherit existing contacts policies)
-- No additional RLS needed as the contacts table already has policies
