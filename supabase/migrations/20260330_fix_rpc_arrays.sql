-- ============================================================
-- claim_dialer_leads — accepts TEXT[] arrays for industries, states, trade_types
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_dialer_leads(
  _session_id   TEXT,
  _claim_size   INT DEFAULT 10,
  _lock_minutes INT DEFAULT 5,
  _industries   TEXT[] DEFAULT NULL,
  _states       TEXT[] DEFAULT NULL,
  _trade_types  TEXT[] DEFAULT NULL,
  _work_type    TEXT DEFAULT NULL,
  _business_size TEXT DEFAULT NULL,
  _prospect_tier TEXT DEFAULT NULL,
  _min_gbp_rating NUMERIC DEFAULT NULL,
  _min_review_count INT DEFAULT NULL,
  _has_google_ads TEXT DEFAULT NULL,
  _has_facebook_ads TEXT DEFAULT NULL,
  _buying_signal_strength TEXT DEFAULT NULL,
  _phone_type   TEXT DEFAULT NULL,
  _has_dm_phone BOOLEAN DEFAULT NULL,
  _contact_owner TEXT DEFAULT NULL,
  _max_attempts  INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _claimed_ids UUID[];
  _result      JSONB;
  _total       INT;
BEGIN
  -- Claim contacts matching filters that are not locked
  WITH available AS (
    SELECT c.id
    FROM contacts c
    WHERE c.status = 'uncalled'
      AND c.is_dnc IS NOT TRUE
      AND NOT EXISTS (
        SELECT 1 FROM dialer_lead_locks dll
        WHERE dll.contact_id = c.id
          AND dll.expires_at > NOW()
      )
      -- Industries array filter (matches industry column)
      AND (_industries IS NULL OR c.industry = ANY(_industries))
      -- States array filter
      AND (_states IS NULL OR UPPER(c.state) = ANY(
        SELECT UPPER(unnest) FROM unnest(_states)
      ))
      -- Trade types array filter (matches trade_type OR falls back to industry)
      AND (_trade_types IS NULL OR c.trade_type = ANY(_trade_types) OR (c.trade_type IS NULL AND c.industry = ANY(_trade_types)))
      -- Single-value filters
      AND (_work_type IS NULL OR c.work_type = _work_type)
      AND (_business_size IS NULL OR c.business_size = _business_size)
      AND (_prospect_tier IS NULL OR c.prospect_tier = _prospect_tier)
      AND (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
      AND (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
      AND (_has_google_ads IS NULL OR c.has_google_ads = _has_google_ads)
      AND (_has_facebook_ads IS NULL OR c.has_facebook_ads = _has_facebook_ads)
      AND (_buying_signal_strength IS NULL OR c.buying_signal_strength = _buying_signal_strength)
      AND (_phone_type IS NULL OR c.phone_type = _phone_type)
      AND (_has_dm_phone IS NULL OR
           (_has_dm_phone = TRUE AND c.dm_phone IS NOT NULL AND c.dm_phone <> '') OR
           (_has_dm_phone = FALSE AND (c.dm_phone IS NULL OR c.dm_phone = ''))
      )
      AND (
        _contact_owner IS NULL
        OR (_contact_owner = 'unassigned' AND c.contact_owner IS NULL)
        OR (_contact_owner <> 'unassigned' AND c.contact_owner = _contact_owner)
      )
      AND (_max_attempts IS NULL OR COALESCE(c.call_attempts, 0) < _max_attempts)
    ORDER BY c.created_at ASC
    LIMIT _claim_size
  )
  SELECT ARRAY_AGG(id) INTO _claimed_ids FROM available;

  -- If nothing found, return empty
  IF _claimed_ids IS NULL THEN
    -- Count total available (without claim size limit)
    SELECT COUNT(*) INTO _total
    FROM contacts c
    WHERE c.status = 'uncalled'
      AND c.is_dnc IS NOT TRUE
      AND NOT EXISTS (
        SELECT 1 FROM dialer_lead_locks dll
        WHERE dll.contact_id = c.id
          AND dll.expires_at > NOW()
      )
      AND (_industries IS NULL OR c.industry = ANY(_industries))
      AND (_states IS NULL OR UPPER(c.state) = ANY(SELECT UPPER(unnest) FROM unnest(_states)))
      AND (_trade_types IS NULL OR c.trade_type = ANY(_trade_types) OR (c.trade_type IS NULL AND c.industry = ANY(_trade_types)))
      AND (_work_type IS NULL OR c.work_type = _work_type)
      AND (_business_size IS NULL OR c.business_size = _business_size)
      AND (_prospect_tier IS NULL OR c.prospect_tier = _prospect_tier)
      AND (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
      AND (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
      AND (_has_google_ads IS NULL OR c.has_google_ads = _has_google_ads)
      AND (_has_facebook_ads IS NULL OR c.has_facebook_ads = _has_facebook_ads)
      AND (_buying_signal_strength IS NULL OR c.buying_signal_strength = _buying_signal_strength)
      AND (_phone_type IS NULL OR c.phone_type = _phone_type)
      AND (_has_dm_phone IS NULL OR
           (_has_dm_phone = TRUE AND c.dm_phone IS NOT NULL AND c.dm_phone <> '') OR
           (_has_dm_phone = FALSE AND (c.dm_phone IS NULL OR c.dm_phone = ''))
      )
      AND (
        _contact_owner IS NULL
        OR (_contact_owner = 'unassigned' AND c.contact_owner IS NULL)
        OR (_contact_owner <> 'unassigned' AND c.contact_owner = _contact_owner)
      )
      AND (_max_attempts IS NULL OR COALESCE(c.call_attempts, 0) < _max_attempts);

    RETURN jsonb_build_object(
      'claimed_contacts', '[]'::jsonb,
      'total_available_count', COALESCE(_total, 0)
    );
  END IF;

  -- Lock the claimed contacts
  INSERT INTO dialer_lead_locks (contact_id, session_id, locked_by, expires_at)
  SELECT unnest(_claimed_ids), _session_id, _session_id, NOW() + (_lock_minutes || ' minutes')::INTERVAL
  ON CONFLICT (contact_id) DO UPDATE
    SET session_id = EXCLUDED.session_id,
        locked_by = EXCLUDED.locked_by,
        expires_at = EXCLUDED.expires_at;

  -- Count total available
  SELECT COUNT(*) INTO _total
  FROM contacts c
  WHERE c.status = 'uncalled'
    AND c.is_dnc IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM dialer_lead_locks dll
      WHERE dll.contact_id = c.id
        AND dll.expires_at > NOW()
        AND dll.session_id <> _session_id
    )
    AND (_industries IS NULL OR c.industry = ANY(_industries))
    AND (_states IS NULL OR UPPER(c.state) = ANY(SELECT UPPER(unnest) FROM unnest(_states)))
    AND (_trade_types IS NULL OR c.trade_type = ANY(_trade_types) OR (c.trade_type IS NULL AND c.industry = ANY(_trade_types)))
    AND (_work_type IS NULL OR c.work_type = _work_type)
    AND (_business_size IS NULL OR c.business_size = _business_size)
    AND (_prospect_tier IS NULL OR c.prospect_tier = _prospect_tier)
    AND (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
    AND (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
    AND (_has_google_ads IS NULL OR c.has_google_ads = _has_google_ads)
    AND (_has_facebook_ads IS NULL OR c.has_facebook_ads = _has_facebook_ads)
    AND (_buying_signal_strength IS NULL OR c.buying_signal_strength = _buying_signal_strength)
    AND (_phone_type IS NULL OR c.phone_type = _phone_type)
    AND (_has_dm_phone IS NULL OR
         (_has_dm_phone = TRUE AND c.dm_phone IS NOT NULL AND c.dm_phone <> '') OR
         (_has_dm_phone = FALSE AND (c.dm_phone IS NULL OR c.dm_phone = ''))
    )
    AND (
      _contact_owner IS NULL
      OR (_contact_owner = 'unassigned' AND c.contact_owner IS NULL)
      OR (_contact_owner <> 'unassigned' AND c.contact_owner = _contact_owner)
    )
    AND (_max_attempts IS NULL OR COALESCE(c.call_attempts, 0) < _max_attempts);

  -- Return claimed contacts as JSONB
  SELECT jsonb_build_object(
    'claimed_contacts', COALESCE(jsonb_agg(to_jsonb(c)), '[]'::jsonb),
    'total_available_count', COALESCE(_total, 0)
  ) INTO _result
  FROM contacts c
  WHERE c.id = ANY(_claimed_ids);

  RETURN _result;
END;
$$;

-- ============================================================
-- get_dialer_queue_count — accepts TEXT[] arrays for industries, states, trade_types
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dialer_queue_count(
  _session_id   TEXT,
  _industries   TEXT[] DEFAULT NULL,
  _states       TEXT[] DEFAULT NULL,
  _trade_types  TEXT[] DEFAULT NULL,
  _work_type    TEXT DEFAULT NULL,
  _business_size TEXT DEFAULT NULL,
  _prospect_tier TEXT DEFAULT NULL,
  _min_gbp_rating NUMERIC DEFAULT NULL,
  _min_review_count INT DEFAULT NULL,
  _has_google_ads TEXT DEFAULT NULL,
  _has_facebook_ads TEXT DEFAULT NULL,
  _buying_signal_strength TEXT DEFAULT NULL,
  _phone_type   TEXT DEFAULT NULL,
  _has_dm_phone BOOLEAN DEFAULT NULL,
  _contact_owner TEXT DEFAULT NULL,
  _max_attempts  INT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _count INT;
BEGIN
  SELECT COUNT(*) INTO _count
  FROM contacts c
  WHERE c.status = 'uncalled'
    AND c.is_dnc IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM dialer_lead_locks dll
      WHERE dll.contact_id = c.id
        AND dll.expires_at > NOW()
        AND dll.session_id <> _session_id
    )
    AND (_industries IS NULL OR c.industry = ANY(_industries))
    AND (_states IS NULL OR UPPER(c.state) = ANY(SELECT UPPER(unnest) FROM unnest(_states)))
    AND (_trade_types IS NULL OR c.trade_type = ANY(_trade_types) OR (c.trade_type IS NULL AND c.industry = ANY(_trade_types)))
    AND (_work_type IS NULL OR c.work_type = _work_type)
    AND (_business_size IS NULL OR c.business_size = _business_size)
    AND (_prospect_tier IS NULL OR c.prospect_tier = _prospect_tier)
    AND (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
    AND (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
    AND (_has_google_ads IS NULL OR c.has_google_ads = _has_google_ads)
    AND (_has_facebook_ads IS NULL OR c.has_facebook_ads = _has_facebook_ads)
    AND (_buying_signal_strength IS NULL OR c.buying_signal_strength = _buying_signal_strength)
    AND (_phone_type IS NULL OR c.phone_type = _phone_type)
    AND (_has_dm_phone IS NULL OR
         (_has_dm_phone = TRUE AND c.dm_phone IS NOT NULL AND c.dm_phone <> '') OR
         (_has_dm_phone = FALSE AND (c.dm_phone IS NULL OR c.dm_phone = ''))
    )
    AND (
      _contact_owner IS NULL
      OR (_contact_owner = 'unassigned' AND c.contact_owner IS NULL)
      OR (_contact_owner <> 'unassigned' AND c.contact_owner = _contact_owner)
    )
    AND (_max_attempts IS NULL OR COALESCE(c.call_attempts, 0) < _max_attempts);

  RETURN _count;
END;
$$;
