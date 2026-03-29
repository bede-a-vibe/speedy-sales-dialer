-- Migration: Contact owner filter, call attempt limit, voicemail tracking, phone number quality
-- Aligned with Fanatical Prospecting + Cold Calling Sucks frameworks

-- 1. Add voicemail_count and phone_number_quality columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'phone_number_quality') THEN
    CREATE TYPE public.phone_number_quality AS ENUM ('unconfirmed', 'confirmed', 'suspect', 'dead');
  END IF;
END $$;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS voicemail_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone_number_quality public.phone_number_quality NOT NULL DEFAULT 'unconfirmed';

-- 2. Add _contact_owner and _max_attempts filters to claim_dialer_leads and get_dialer_queue_count

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
  _max_attempts  INT      DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _now         TIMESTAMPTZ := now();
  _lock_until  TIMESTAMPTZ := _now + (_lock_minutes || ' minutes')::INTERVAL;
  _cooldown_ts TIMESTAMPTZ := _now - (_cooldown_minutes || ' minutes')::INTERVAL;
  _claimed_ids UUID[];
  _total       BIGINT;
BEGIN
  -- Claim eligible contacts
  WITH eligible AS (
    SELECT c.id
    FROM   public.contacts c
    WHERE  c.status IN ('new','attempted')
      AND  c.is_dnc = FALSE
      AND  c.phone_number_quality <> 'dead'
      AND  (_max_attempts IS NULL OR c.call_attempt_count < _max_attempts)
      AND  (_industry IS NULL OR c.industry = _industry)
      AND  (_state    IS NULL OR c.state    ILIKE _state)
      AND  (_trade_type IS NULL OR c.trade_type = _trade_type)
      AND  (_work_type IS NULL OR c.work_type = _work_type)
      AND  (_business_size IS NULL OR c.business_size = _business_size)
      AND  (_prospect_tier IS NULL OR c.prospect_tier = _prospect_tier)
      AND  (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
      AND  (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
      AND  (_has_google_ads IS NULL OR c.has_google_ads = _has_google_ads)
      AND  (_has_facebook_ads IS NULL OR c.has_facebook_ads = _has_facebook_ads)
      AND  (_buying_signal_strength IS NULL OR c.buying_signal_strength = _buying_signal_strength)
      AND  (_phone_type IS NULL OR c.phone_type = _phone_type)
      AND  (_has_dm_phone IS NULL OR
            CASE WHEN _has_dm_phone THEN c.dm_phone IS NOT NULL AND c.dm_phone <> ''
                 ELSE c.dm_phone IS NULL OR c.dm_phone = ''
            END)
      AND  (_contact_owner IS NULL OR
            CASE WHEN _contact_owner = 'unassigned' THEN c.uploaded_by IS NULL
                 ELSE c.uploaded_by = _contact_owner::UUID
            END)
      AND  NOT EXISTS (
             SELECT 1 FROM public.dialer_lead_locks dll
             WHERE dll.contact_id = c.id AND dll.locked_until > _now
           )
      AND  (c.last_called_at IS NULL OR c.last_called_at < _cooldown_ts)
    ORDER BY c.call_attempt_count ASC, c.created_at ASC
    LIMIT _claim_size
  ),
  locked AS (
    INSERT INTO public.dialer_lead_locks (contact_id, session_id, user_id, locked_until)
    SELECT e.id, _session_id, auth.uid(), _lock_until
    FROM   eligible e
    ON CONFLICT (contact_id) DO UPDATE
      SET session_id = EXCLUDED.session_id,
          user_id    = EXCLUDED.user_id,
          locked_until = EXCLUDED.locked_until
    RETURNING contact_id
  )
  SELECT ARRAY_AGG(contact_id) INTO _claimed_ids FROM locked;

  -- Count total available (excluding just-claimed)
  SELECT COUNT(*) INTO _total
  FROM   public.contacts c
  WHERE  c.status IN ('new','attempted')
    AND  c.is_dnc = FALSE
    AND  c.phone_number_quality <> 'dead'
    AND  (_max_attempts IS NULL OR c.call_attempt_count < _max_attempts)
    AND  (_industry IS NULL OR c.industry = _industry)
    AND  (_state    IS NULL OR c.state    ILIKE _state)
    AND  (_trade_type IS NULL OR c.trade_type = _trade_type)
    AND  (_work_type IS NULL OR c.work_type = _work_type)
    AND  (_business_size IS NULL OR c.business_size = _business_size)
    AND  (_prospect_tier IS NULL OR c.prospect_tier = _prospect_tier)
    AND  (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
    AND  (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
    AND  (_has_google_ads IS NULL OR c.has_google_ads = _has_google_ads)
    AND  (_has_facebook_ads IS NULL OR c.has_facebook_ads = _has_facebook_ads)
    AND  (_buying_signal_strength IS NULL OR c.buying_signal_strength = _buying_signal_strength)
    AND  (_phone_type IS NULL OR c.phone_type = _phone_type)
    AND  (_has_dm_phone IS NULL OR
          CASE WHEN _has_dm_phone THEN c.dm_phone IS NOT NULL AND c.dm_phone <> ''
               ELSE c.dm_phone IS NULL OR c.dm_phone = ''
          END)
    AND  (_contact_owner IS NULL OR
          CASE WHEN _contact_owner = 'unassigned' THEN c.uploaded_by IS NULL
               ELSE c.uploaded_by = _contact_owner::UUID
          END)
    AND  NOT EXISTS (
           SELECT 1 FROM public.dialer_lead_locks dll
           WHERE dll.contact_id = c.id AND dll.locked_until > _now
         )
    AND  (c.last_called_at IS NULL OR c.last_called_at < _cooldown_ts);

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
  _max_attempts  INT      DEFAULT 5
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _now         TIMESTAMPTZ := now();
  _cooldown_ts TIMESTAMPTZ := _now - (_cooldown_minutes || ' minutes')::INTERVAL;
  _total       BIGINT;
BEGIN
  SELECT COUNT(*) INTO _total
  FROM   public.contacts c
  WHERE  c.status IN ('new','attempted')
    AND  c.is_dnc = FALSE
    AND  c.phone_number_quality <> 'dead'
    AND  (_max_attempts IS NULL OR c.call_attempt_count < _max_attempts)
    AND  (_industry IS NULL OR c.industry = _industry)
    AND  (_state    IS NULL OR c.state    ILIKE _state)
    AND  (_trade_type IS NULL OR c.trade_type = _trade_type)
    AND  (_work_type IS NULL OR c.work_type = _work_type)
    AND  (_business_size IS NULL OR c.business_size = _business_size)
    AND  (_prospect_tier IS NULL OR c.prospect_tier = _prospect_tier)
    AND  (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
    AND  (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
    AND  (_has_google_ads IS NULL OR c.has_google_ads = _has_google_ads)
    AND  (_has_facebook_ads IS NULL OR c.has_facebook_ads = _has_facebook_ads)
    AND  (_buying_signal_strength IS NULL OR c.buying_signal_strength = _buying_signal_strength)
    AND  (_phone_type IS NULL OR c.phone_type = _phone_type)
    AND  (_has_dm_phone IS NULL OR
          CASE WHEN _has_dm_phone THEN c.dm_phone IS NOT NULL AND c.dm_phone <> ''
               ELSE c.dm_phone IS NULL OR c.dm_phone = ''
          END)
    AND  (_contact_owner IS NULL OR
          CASE WHEN _contact_owner = 'unassigned' THEN c.uploaded_by IS NULL
               ELSE c.uploaded_by = _contact_owner::UUID
          END)
    AND  NOT EXISTS (
           SELECT 1 FROM public.dialer_lead_locks dll
           WHERE dll.contact_id = c.id AND dll.locked_until > _now
         )
    AND  (c.last_called_at IS NULL OR c.last_called_at < _cooldown_ts);

  RETURN _total;
END;
$$;
