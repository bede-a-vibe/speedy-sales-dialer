-- FIX: claim_dialer_leads RPC
-- Issues fixed:
-- 1. Use c.status = 'uncalled' (not 'new'/'attempted' which don't exist)
-- 2. Use expires_at (not locked_until which doesn't exist on the table)
-- 3. Trade type filter falls back to industry column when trade_type is NULL

CREATE OR REPLACE FUNCTION public.claim_dialer_leads(
  _session_id    UUID,
  _industry      TEXT     DEFAULT NULL,
  _state         TEXT     DEFAULT NULL,
  _claim_size    INT      DEFAULT 25,
  _lock_minutes  INT      DEFAULT 15,
  _cooldown_minutes INT   DEFAULT 120,
  _trade_type    TEXT     DEFAULT NULL,
  _work_type     TEXT     DEFAULT NULL,
  _business_size TEXT     DEFAULT NULL,
  _prospect_tier TEXT     DEFAULT NULL,
  _min_gbp_rating NUMERIC DEFAULT NULL,
  _min_review_count INT   DEFAULT NULL,
  _has_google_ads TEXT    DEFAULT NULL,
  _has_facebook_ads TEXT  DEFAULT NULL,
  _buying_signal_strength TEXT DEFAULT NULL,
  _phone_type    TEXT     DEFAULT NULL,
  _has_dm_phone  BOOLEAN  DEFAULT NULL,
  _contact_owner TEXT     DEFAULT NULL,
  _max_attempts  INT      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _now         TIMESTAMPTZ := now();
  _lock_until  TIMESTAMPTZ := _now + (_lock_minutes || ' minutes')::INTERVAL;
  _normalized_claim_size INTEGER := LEAST(GREATEST(COALESCE(_claim_size, 25), 0), 100);
  _claimed_ids UUID[];
  _total       BIGINT;
  _result      JSONB;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Clean up expired locks
  DELETE FROM public.dialer_lead_locks
  WHERE expires_at <= _now;

  -- Claim eligible contacts
  WITH eligible AS (
    SELECT c.id
    FROM   public.contacts c
    WHERE  c.status = 'uncalled'
      AND  c.is_dnc = FALSE
      AND  (_max_attempts IS NULL OR c.call_attempt_count < _max_attempts)
      AND  (_industry IS NULL OR _industry = 'all' OR c.industry = _industry)
      AND  (_state IS NULL OR _state = 'all' OR c.state ILIKE _state)
      -- Trade type: check trade_type column first, fall back to industry
      AND  (_trade_type IS NULL OR _trade_type = 'all'
            OR c.trade_type = _trade_type
            OR (c.trade_type IS NULL AND c.industry = _trade_type))
      AND  (_work_type IS NULL OR _work_type = 'all' OR c.work_type = _work_type)
      AND  (_business_size IS NULL OR _business_size = 'all' OR c.business_size = _business_size)
      AND  (_prospect_tier IS NULL OR _prospect_tier = 'all' OR c.prospect_tier = _prospect_tier)
      AND  (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
      AND  (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
      AND  (_has_google_ads IS NULL OR _has_google_ads = 'all' OR c.has_google_ads = _has_google_ads)
      AND  (_has_facebook_ads IS NULL OR _has_facebook_ads = 'all' OR c.has_facebook_ads = _has_facebook_ads)
      AND  (_buying_signal_strength IS NULL OR _buying_signal_strength = 'all' OR c.buying_signal_strength = _buying_signal_strength)
      AND  (_phone_type IS NULL OR _phone_type = 'all' OR c.phone_type = _phone_type)
      AND  (_has_dm_phone IS NULL OR
            CASE WHEN _has_dm_phone THEN c.dm_phone IS NOT NULL AND c.dm_phone <> ''
                 ELSE c.dm_phone IS NULL OR c.dm_phone = ''
            END)
      AND  (_contact_owner IS NULL OR _contact_owner = 'all' OR
            CASE WHEN _contact_owner = 'unassigned' THEN c.uploaded_by IS NULL
                 ELSE c.uploaded_by = _contact_owner::UUID
            END)
      AND  NOT EXISTS (
             SELECT 1 FROM public.dialer_lead_locks dll
             WHERE dll.contact_id = c.id AND dll.expires_at > _now
           )
    ORDER BY c.call_attempt_count ASC, random()
    LIMIT _normalized_claim_size
  ),
  locked AS (
    INSERT INTO public.dialer_lead_locks (contact_id, session_id, user_id, industry, state, expires_at)
    SELECT e.id, _session_id, _user_id, _industry, _state, _lock_until
    FROM   eligible e
    ON CONFLICT (contact_id) DO UPDATE
      SET session_id = EXCLUDED.session_id,
          user_id    = EXCLUDED.user_id,
          expires_at = EXCLUDED.expires_at
    RETURNING contact_id
  )
  SELECT ARRAY_AGG(contact_id) INTO _claimed_ids FROM locked;

  -- Count total available
  SELECT COUNT(*) INTO _total
  FROM   public.contacts c
  WHERE  c.status = 'uncalled'
    AND  c.is_dnc = FALSE
    AND  (_max_attempts IS NULL OR c.call_attempt_count < _max_attempts)
    AND  (_industry IS NULL OR _industry = 'all' OR c.industry = _industry)
    AND  (_state IS NULL OR _state = 'all' OR c.state ILIKE _state)
    AND  (_trade_type IS NULL OR _trade_type = 'all'
          OR c.trade_type = _trade_type
          OR (c.trade_type IS NULL AND c.industry = _trade_type))
    AND  (_work_type IS NULL OR _work_type = 'all' OR c.work_type = _work_type)
    AND  (_business_size IS NULL OR _business_size = 'all' OR c.business_size = _business_size)
    AND  (_prospect_tier IS NULL OR _prospect_tier = 'all' OR c.prospect_tier = _prospect_tier)
    AND  (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
    AND  (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
    AND  (_has_google_ads IS NULL OR _has_google_ads = 'all' OR c.has_google_ads = _has_google_ads)
    AND  (_has_facebook_ads IS NULL OR _has_facebook_ads = 'all' OR c.has_facebook_ads = _has_facebook_ads)
    AND  (_buying_signal_strength IS NULL OR _buying_signal_strength = 'all' OR c.buying_signal_strength = _buying_signal_strength)
    AND  (_phone_type IS NULL OR _phone_type = 'all' OR c.phone_type = _phone_type)
    AND  (_has_dm_phone IS NULL OR
          CASE WHEN _has_dm_phone THEN c.dm_phone IS NOT NULL AND c.dm_phone <> ''
               ELSE c.dm_phone IS NULL OR c.dm_phone = ''
          END)
    AND  (_contact_owner IS NULL OR _contact_owner = 'all' OR
          CASE WHEN _contact_owner = 'unassigned' THEN c.uploaded_by IS NULL
               ELSE c.uploaded_by = _contact_owner::UUID
          END)
    AND  NOT EXISTS (
           SELECT 1 FROM public.dialer_lead_locks dll
           WHERE dll.contact_id = c.id AND dll.expires_at > _now
         );

  RETURN jsonb_build_object(
    'claimed_contacts',
    COALESCE(
      (SELECT jsonb_agg(row_to_json(c.*))
       FROM   public.contacts c
       WHERE  c.id = ANY(_claimed_ids)),
      '[]'::JSONB
    ),
    'total_available_count', _total
  );
END;
$$;
