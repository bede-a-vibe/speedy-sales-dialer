
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS mobile_reaches_gatekeeper boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.claim_dialer_leads(uuid, integer, integer, text[], text[], text[], text, text, text, numeric, integer, text, text, text, text, boolean, text, boolean, boolean, text[], text[], text, text[], text, text, text, text);
DROP FUNCTION IF EXISTS public.get_dialer_queue_count(uuid, text[], text[], text[], text, text, text, numeric, integer, text, text, text, text, boolean, text, boolean, boolean, text[], text[], text, text[], text, text, text, text);

CREATE OR REPLACE FUNCTION public.claim_dialer_leads(
  _session_id uuid,
  _claim_size integer DEFAULT 25,
  _lock_minutes integer DEFAULT 15,
  _industries text[] DEFAULT NULL,
  _states text[] DEFAULT NULL,
  _trade_types text[] DEFAULT NULL,
  _work_type text DEFAULT NULL,
  _business_size text DEFAULT NULL,
  _prospect_tier text DEFAULT NULL,
  _min_gbp_rating numeric DEFAULT NULL,
  _min_review_count integer DEFAULT NULL,
  _has_google_ads text DEFAULT NULL,
  _has_facebook_ads text DEFAULT NULL,
  _buying_signal_strength text DEFAULT NULL,
  _phone_type text DEFAULT NULL,
  _has_dm_phone boolean DEFAULT NULL,
  _contact_owner text DEFAULT NULL,
  _include_dnc boolean DEFAULT false,
  _include_disqualified boolean DEFAULT false,
  _dnc_reasons text[] DEFAULT NULL,
  _dq_reasons text[] DEFAULT NULL,
  _has_existing_agency text DEFAULT NULL,
  _existing_agency_services text[] DEFAULT NULL,
  _lead_type text DEFAULT NULL,
  _lead_channel text DEFAULT NULL,
  _lead_source text DEFAULT NULL,
  _call_recency text DEFAULT NULL,
  _mobile_gatekeeper text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _normalized_claim_size integer := LEAST(GREATEST(COALESCE(_claim_size, 25), 0), 100);
  _normalized_lock_minutes integer := LEAST(GREATEST(COALESCE(_lock_minutes, 15), 1), 60);
  _current_hour integer := EXTRACT(HOUR FROM now() AT TIME ZONE 'Australia/Melbourne')::integer;
  _normalized_trade_types text[] := NULL;
  _result jsonb;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _trade_types IS NOT NULL AND array_length(_trade_types, 1) > 0 THEN
    SELECT ARRAY(
      SELECT DISTINCT v FROM (
        SELECT unnest(_trade_types) AS v
        UNION ALL
        SELECT CASE lower(unnest(_trade_types))
          WHEN 'plumbers'    THEN 'Plumbing'
          WHEN 'plumbing'    THEN 'Plumbers'
          WHEN 'electricians' THEN 'Electrical'
          WHEN 'electrical'   THEN 'Electricians'
          WHEN 'builders'    THEN 'Building & Construction'
          WHEN 'building & construction' THEN 'Builders'
          WHEN 'renovators'  THEN 'Renovations'
          WHEN 'renovations' THEN 'Renovators'
          WHEN 'roofers'     THEN 'Roofing'
          WHEN 'roofing'     THEN 'Roofers'
          ELSE NULL
        END
      ) sub
      WHERE v IS NOT NULL
    ) INTO _normalized_trade_types;
  END IF;

  DELETE FROM public.dialer_lead_locks WHERE expires_at <= now();

  WITH visible_contacts AS (
    SELECT c.id, c.call_attempt_count, c.created_at, l.session_id AS lock_session_id,
      ((c.dm_phone IS NOT NULL AND c.dm_phone <> '') OR c.phone_type = 'mobile') AS is_mobile_reachable,
      (
        CASE WHEN c.dm_phone IS NOT NULL AND c.dm_phone <> '' THEN 150
             WHEN c.phone_type = 'mobile' THEN 100
             ELSE 0 END
        + CASE c.prospect_tier
            WHEN 'Tier 1 - Hot' THEN 80 WHEN 'Tier 2 - Warm' THEN 55
            WHEN 'Tier 3 - Nurture' THEN 30 WHEN 'Tier 5 - New / No Reviews' THEN 25
            WHEN 'Tier 4 - Long Shot' THEN 10 ELSE 20 END
        + CASE
            WHEN c.last_called_at IS NULL THEN 40
            WHEN c.last_called_at < now() - interval '90 days' THEN 35
            WHEN c.last_called_at < now() - interval '60 days' THEN 25
            WHEN c.last_called_at < now() - interval '30 days' THEN 15
            ELSE 5 END
        + CASE c.buying_signal_strength WHEN 'Strong' THEN 30 WHEN 'Moderate' THEN 15 ELSE 0 END
        + CASE c.budget_indication WHEN 'Has Budget' THEN 20 ELSE 0 END
        + CASE c.authority_level WHEN 'Decision Maker' THEN 15 ELSE 0 END
        + CASE c.last_call_sentiment WHEN 'Warm' THEN 10 WHEN 'Engaged' THEN 10 ELSE 0 END
        + CASE WHEN c.has_existing_agency = true THEN 25 ELSE 0 END
        - CASE WHEN c.call_attempt_count > 6 THEN 15 ELSE 0 END
        - CASE c.phone_number_quality WHEN 'suspect' THEN 10 ELSE 0 END
      ) AS priority_score
    FROM public.contacts c
    LEFT JOIN public.dialer_lead_locks l ON l.contact_id = c.id AND l.expires_at > now()
    WHERE c.status = 'uncalled' AND c.is_archived IS NOT TRUE
      AND (_include_dnc OR c.is_dnc IS NOT TRUE)
      AND (_include_disqualified OR c.disqualified IS NOT TRUE)
      AND c.meeting_booked_date IS NULL
      AND (c.next_followup_date IS NULL OR c.next_followup_date <= now())
      AND c.phone_number_quality <> 'dead'
      AND (c.buying_signal_strength IS NULL OR c.buying_signal_strength <> 'None')
      AND (c.last_call_sentiment IS NULL OR c.last_call_sentiment <> 'Hostile')
      AND c.call_attempt_count < 10
      AND (
        c.last_called_at IS NULL
        OR c.last_called_at < now() - (
          CASE
            WHEN c.last_outcome = 'voicemail' THEN interval '48 hours'
            WHEN c.call_attempt_count >= 3 THEN interval '48 hours'
            ELSE interval '24 hours'
          END
        )
      )
      AND (
        c.best_time_to_call IS NULL
        OR c.best_time_to_call = ''
        OR (c.best_time_to_call = 'Morning' AND _current_hour BETWEEN 8 AND 11)
        OR (c.best_time_to_call = 'Afternoon' AND _current_hour BETWEEN 12 AND 15)
        OR (c.best_time_to_call = 'After Hours' AND _current_hour BETWEEN 16 AND 18)
        OR (c.best_time_to_call NOT IN ('Morning', 'Afternoon', 'After Hours'))
      )
      AND (_industries IS NULL OR c.industry = ANY(_industries))
      AND (_states IS NULL OR UPPER(COALESCE(c.state, '')) = ANY(ARRAY(SELECT UPPER(value) FROM unnest(_states) AS value)))
      AND (
        _normalized_trade_types IS NULL
        OR c.trade_type = ANY(_normalized_trade_types)
        OR (c.trade_type IS NULL AND c.industry = ANY(_normalized_trade_types))
      )
      AND (_work_type IS NULL OR _work_type = 'all' OR c.work_type = _work_type)
      AND (_business_size IS NULL OR _business_size = 'all' OR c.business_size = _business_size)
      AND (_prospect_tier IS NULL OR _prospect_tier = 'all' OR c.prospect_tier = _prospect_tier)
      AND (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
      AND (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
      AND (_has_google_ads IS NULL OR _has_google_ads = 'all' OR LOWER(COALESCE(c.has_google_ads, '')) = LOWER(_has_google_ads))
      AND (_has_facebook_ads IS NULL OR _has_facebook_ads = 'all' OR LOWER(COALESCE(c.has_facebook_ads, '')) = LOWER(_has_facebook_ads))
      AND (_buying_signal_strength IS NULL OR _buying_signal_strength = 'all' OR c.buying_signal_strength = _buying_signal_strength)
      AND (_phone_type IS NULL OR _phone_type = 'all' OR c.phone_type = _phone_type)
      AND (_has_dm_phone IS NULL
        OR (_has_dm_phone = true AND c.dm_phone IS NOT NULL AND c.dm_phone <> '')
        OR (_has_dm_phone = false AND (c.dm_phone IS NULL OR c.dm_phone = '')))
      AND (_mobile_gatekeeper IS NULL OR _mobile_gatekeeper = 'all'
        OR (_mobile_gatekeeper = 'hide' AND COALESCE(c.mobile_reaches_gatekeeper, false) = false)
        OR (_mobile_gatekeeper = 'only' AND COALESCE(c.mobile_reaches_gatekeeper, false) = true))
      AND (_contact_owner IS NULL
        OR (_contact_owner = 'unassigned' AND c.uploaded_by IS NULL)
        OR (_contact_owner <> 'unassigned' AND c.uploaded_by IS NOT NULL AND c.uploaded_by::text = _contact_owner))
      AND (_dnc_reasons IS NULL OR c.dnc_reason = ANY(_dnc_reasons))
      AND (_dq_reasons IS NULL OR c.disqualified_reason = ANY(_dq_reasons))
      AND (_has_existing_agency IS NULL OR _has_existing_agency = 'all'
        OR (_has_existing_agency = 'yes' AND c.has_existing_agency = true)
        OR (_has_existing_agency = 'no' AND (c.has_existing_agency = false OR c.has_existing_agency IS NULL)))
      AND (_existing_agency_services IS NULL OR c.existing_agency_services && _existing_agency_services)
      AND (_lead_type IS NULL OR _lead_type = 'all' OR c.lead_type = _lead_type)
      AND (_lead_channel IS NULL OR _lead_channel = 'all' OR c.lead_channel = _lead_channel)
      AND (_lead_source IS NULL OR _lead_source = 'all' OR c.lead_source = _lead_source)
      AND (_call_recency IS NULL OR _call_recency = 'all'
        OR (_call_recency = 'never' AND COALESCE(c.call_attempt_count,0) = 0)
        OR (_call_recency = '30' AND (c.last_called_at IS NULL OR c.last_called_at < now() - interval '30 days'))
        OR (_call_recency = '60' AND (c.last_called_at IS NULL OR c.last_called_at < now() - interval '60 days'))
        OR (_call_recency = '90' AND (c.last_called_at IS NULL OR c.last_called_at < now() - interval '90 days')))
      AND (l.contact_id IS NULL OR l.session_id = _session_id)
  ),
  total_available AS (
    SELECT COUNT(*)::int AS total_count FROM visible_contacts
  ),
  claimable_contacts AS (
    SELECT vc.id
    FROM visible_contacts vc
    WHERE vc.lock_session_id IS NULL
    ORDER BY vc.is_mobile_reachable DESC, vc.priority_score DESC, vc.call_attempt_count ASC, random()
    LIMIT _normalized_claim_size
  ),
  inserted_locks AS (
    INSERT INTO public.dialer_lead_locks (contact_id, user_id, session_id, expires_at)
    SELECT cc.id, _user_id, _session_id, now() + make_interval(mins => _normalized_lock_minutes)
    FROM claimable_contacts cc
    WHERE _normalized_claim_size > 0
    ON CONFLICT (contact_id) DO NOTHING
    RETURNING contact_id
  ),
  claimed_contacts AS (
    SELECT c.*
    FROM inserted_locks il
    JOIN public.contacts c ON c.id = il.contact_id
    ORDER BY
      ((c.dm_phone IS NOT NULL AND c.dm_phone <> '') OR c.phone_type = 'mobile') DESC,
      (
        CASE WHEN c.dm_phone IS NOT NULL AND c.dm_phone <> '' THEN 150
             WHEN c.phone_type = 'mobile' THEN 100
             ELSE 0 END
        + CASE c.prospect_tier
            WHEN 'Tier 1 - Hot' THEN 80 WHEN 'Tier 2 - Warm' THEN 55
            WHEN 'Tier 3 - Nurture' THEN 30 WHEN 'Tier 5 - New / No Reviews' THEN 25
            WHEN 'Tier 4 - Long Shot' THEN 10 ELSE 20 END
        + CASE
            WHEN c.last_called_at IS NULL THEN 40
            WHEN c.last_called_at < now() - interval '90 days' THEN 35
            WHEN c.last_called_at < now() - interval '60 days' THEN 25
            WHEN c.last_called_at < now() - interval '30 days' THEN 15
            ELSE 5 END
        + CASE c.buying_signal_strength WHEN 'Strong' THEN 30 WHEN 'Moderate' THEN 15 ELSE 0 END
        + CASE c.budget_indication WHEN 'Has Budget' THEN 20 ELSE 0 END
        + CASE c.authority_level WHEN 'Decision Maker' THEN 15 ELSE 0 END
        + CASE c.last_call_sentiment WHEN 'Warm' THEN 10 WHEN 'Engaged' THEN 10 ELSE 0 END
        + CASE WHEN c.has_existing_agency = true THEN 25 ELSE 0 END
        - CASE WHEN c.call_attempt_count > 6 THEN 15 ELSE 0 END
        - CASE c.phone_number_quality WHEN 'suspect' THEN 10 ELSE 0 END
      ) DESC, c.call_attempt_count ASC, random()
  )
  SELECT jsonb_build_object(
    'total_available_count', COALESCE((SELECT total_count FROM total_available), 0),
    'claimed_contacts', COALESCE((SELECT jsonb_agg(to_jsonb(claimed_contacts)) FROM claimed_contacts), '[]'::jsonb)
  )
  INTO _result;

  RETURN COALESCE(_result, jsonb_build_object('total_available_count', 0, 'claimed_contacts', '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dialer_queue_count(
  _session_id uuid,
  _industries text[] DEFAULT NULL,
  _states text[] DEFAULT NULL,
  _trade_types text[] DEFAULT NULL,
  _work_type text DEFAULT NULL,
  _business_size text DEFAULT NULL,
  _prospect_tier text DEFAULT NULL,
  _min_gbp_rating numeric DEFAULT NULL,
  _min_review_count integer DEFAULT NULL,
  _has_google_ads text DEFAULT NULL,
  _has_facebook_ads text DEFAULT NULL,
  _buying_signal_strength text DEFAULT NULL,
  _phone_type text DEFAULT NULL,
  _has_dm_phone boolean DEFAULT NULL,
  _contact_owner text DEFAULT NULL,
  _include_dnc boolean DEFAULT false,
  _include_disqualified boolean DEFAULT false,
  _dnc_reasons text[] DEFAULT NULL,
  _dq_reasons text[] DEFAULT NULL,
  _has_existing_agency text DEFAULT NULL,
  _existing_agency_services text[] DEFAULT NULL,
  _lead_type text DEFAULT NULL,
  _lead_channel text DEFAULT NULL,
  _lead_source text DEFAULT NULL,
  _call_recency text DEFAULT NULL,
  _mobile_gatekeeper text DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _current_hour integer := EXTRACT(HOUR FROM now() AT TIME ZONE 'Australia/Melbourne')::integer;
  _normalized_trade_types text[] := NULL;
  _count integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _trade_types IS NOT NULL AND array_length(_trade_types, 1) > 0 THEN
    SELECT ARRAY(
      SELECT DISTINCT v FROM (
        SELECT unnest(_trade_types) AS v
        UNION ALL
        SELECT CASE lower(unnest(_trade_types))
          WHEN 'plumbers'    THEN 'Plumbing'
          WHEN 'plumbing'    THEN 'Plumbers'
          WHEN 'electricians' THEN 'Electrical'
          WHEN 'electrical'   THEN 'Electricians'
          WHEN 'builders'    THEN 'Building & Construction'
          WHEN 'building & construction' THEN 'Builders'
          WHEN 'renovators'  THEN 'Renovations'
          WHEN 'renovations' THEN 'Renovators'
          WHEN 'roofers'     THEN 'Roofing'
          WHEN 'roofing'     THEN 'Roofers'
          ELSE NULL
        END
      ) sub
      WHERE v IS NOT NULL
    ) INTO _normalized_trade_types;
  END IF;

  SELECT COUNT(*)::int INTO _count
  FROM public.contacts c
  LEFT JOIN public.dialer_lead_locks l ON l.contact_id = c.id AND l.expires_at > now()
  WHERE c.status = 'uncalled' AND c.is_archived IS NOT TRUE
    AND (_include_dnc OR c.is_dnc IS NOT TRUE)
    AND (_include_disqualified OR c.disqualified IS NOT TRUE)
    AND c.meeting_booked_date IS NULL
    AND (c.next_followup_date IS NULL OR c.next_followup_date <= now())
    AND c.phone_number_quality <> 'dead'
    AND (c.buying_signal_strength IS NULL OR c.buying_signal_strength <> 'None')
    AND (c.last_call_sentiment IS NULL OR c.last_call_sentiment <> 'Hostile')
    AND c.call_attempt_count < 10
    AND (
      c.last_called_at IS NULL
      OR c.last_called_at < now() - (
        CASE
          WHEN c.last_outcome = 'voicemail' THEN interval '48 hours'
          WHEN c.call_attempt_count >= 3 THEN interval '48 hours'
          ELSE interval '24 hours'
        END
      )
    )
    AND (
      c.best_time_to_call IS NULL
      OR c.best_time_to_call = ''
      OR (c.best_time_to_call = 'Morning' AND _current_hour BETWEEN 8 AND 11)
      OR (c.best_time_to_call = 'Afternoon' AND _current_hour BETWEEN 12 AND 15)
      OR (c.best_time_to_call = 'After Hours' AND _current_hour BETWEEN 16 AND 18)
      OR (c.best_time_to_call NOT IN ('Morning', 'Afternoon', 'After Hours'))
    )
    AND (_industries IS NULL OR c.industry = ANY(_industries))
    AND (_states IS NULL OR UPPER(COALESCE(c.state, '')) = ANY(ARRAY(SELECT UPPER(value) FROM unnest(_states) AS value)))
    AND (
      _normalized_trade_types IS NULL
      OR c.trade_type = ANY(_normalized_trade_types)
      OR (c.trade_type IS NULL AND c.industry = ANY(_normalized_trade_types))
    )
    AND (_work_type IS NULL OR _work_type = 'all' OR c.work_type = _work_type)
    AND (_business_size IS NULL OR _business_size = 'all' OR c.business_size = _business_size)
    AND (_prospect_tier IS NULL OR _prospect_tier = 'all' OR c.prospect_tier = _prospect_tier)
    AND (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
    AND (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
    AND (_has_google_ads IS NULL OR _has_google_ads = 'all' OR LOWER(COALESCE(c.has_google_ads, '')) = LOWER(_has_google_ads))
    AND (_has_facebook_ads IS NULL OR _has_facebook_ads = 'all' OR LOWER(COALESCE(c.has_facebook_ads, '')) = LOWER(_has_facebook_ads))
    AND (_buying_signal_strength IS NULL OR _buying_signal_strength = 'all' OR c.buying_signal_strength = _buying_signal_strength)
    AND (_phone_type IS NULL OR _phone_type = 'all' OR c.phone_type = _phone_type)
    AND (_has_dm_phone IS NULL
      OR (_has_dm_phone = true AND c.dm_phone IS NOT NULL AND c.dm_phone <> '')
      OR (_has_dm_phone = false AND (c.dm_phone IS NULL OR c.dm_phone = '')))
    AND (_mobile_gatekeeper IS NULL OR _mobile_gatekeeper = 'all'
      OR (_mobile_gatekeeper = 'hide' AND COALESCE(c.mobile_reaches_gatekeeper, false) = false)
      OR (_mobile_gatekeeper = 'only' AND COALESCE(c.mobile_reaches_gatekeeper, false) = true))
    AND (_contact_owner IS NULL
      OR (_contact_owner = 'unassigned' AND c.uploaded_by IS NULL)
      OR (_contact_owner <> 'unassigned' AND c.uploaded_by IS NOT NULL AND c.uploaded_by::text = _contact_owner))
    AND (_dnc_reasons IS NULL OR c.dnc_reason = ANY(_dnc_reasons))
    AND (_dq_reasons IS NULL OR c.disqualified_reason = ANY(_dq_reasons))
    AND (_has_existing_agency IS NULL OR _has_existing_agency = 'all'
      OR (_has_existing_agency = 'yes' AND c.has_existing_agency = true)
      OR (_has_existing_agency = 'no' AND (c.has_existing_agency = false OR c.has_existing_agency IS NULL)))
    AND (_existing_agency_services IS NULL OR c.existing_agency_services && _existing_agency_services)
    AND (_lead_type IS NULL OR _lead_type = 'all' OR c.lead_type = _lead_type)
    AND (_lead_channel IS NULL OR _lead_channel = 'all' OR c.lead_channel = _lead_channel)
    AND (_lead_source IS NULL OR _lead_source = 'all' OR c.lead_source = _lead_source)
    AND (_call_recency IS NULL OR _call_recency = 'all'
      OR (_call_recency = 'never' AND COALESCE(c.call_attempt_count,0) = 0)
      OR (_call_recency = '30' AND (c.last_called_at IS NULL OR c.last_called_at < now() - interval '30 days'))
      OR (_call_recency = '60' AND (c.last_called_at IS NULL OR c.last_called_at < now() - interval '60 days'))
      OR (_call_recency = '90' AND (c.last_called_at IS NULL OR c.last_called_at < now() - interval '90 days')))
    AND (l.contact_id IS NULL OR l.session_id = _session_id);

  RETURN COALESCE(_count, 0);
END;
$function$;
