-- FIX: get_dialer_queue_count RPC
-- Same fixes: uncalled status, expires_at, trade_type fallback to industry

CREATE OR REPLACE FUNCTION public.get_dialer_queue_count(
  _session_id    UUID,
  _industry      TEXT     DEFAULT NULL,
  _state         TEXT     DEFAULT NULL,
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
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _now         TIMESTAMPTZ := now();
  _total       BIGINT;
BEGIN
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
  RETURN _total;
END;
$$;
