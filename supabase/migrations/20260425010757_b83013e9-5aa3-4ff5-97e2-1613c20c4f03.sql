-- Helper: admin OR coach
CREATE OR REPLACE FUNCTION public.is_admin_or_coach(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'coach'::app_role);
$$;

-- dialpad_settings: extend SELECT to coach
DROP POLICY IF EXISTS "Users can view own dialpad_settings" ON public.dialpad_settings;
CREATE POLICY "Users or coaches can view dialpad_settings"
ON public.dialpad_settings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'coach'::app_role));

-- dialer_lead_locks: add coach SELECT policy
CREATE POLICY "Coaches can view dialer lead locks"
ON public.dialer_lead_locks
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'coach'::app_role));

-- pending_ghl_pushes: extend admin SELECT to coach
DROP POLICY IF EXISTS "Admins can read pending_ghl_pushes" ON public.pending_ghl_pushes;
CREATE POLICY "Admins or coaches can read pending_ghl_pushes"
ON public.pending_ghl_pushes
FOR SELECT
TO authenticated
USING (public.is_admin_or_coach(auth.uid()));

-- dialpad_calls: extend SELECT to coach
DROP POLICY IF EXISTS "Authenticated users can view dialpad calls" ON public.dialpad_calls;
CREATE POLICY "Authenticated users or coaches can view dialpad calls"
ON public.dialpad_calls
FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.is_admin_or_coach(auth.uid()));

-- preview_dialer_leads RPC: same scoring as claim_dialer_leads, NO locks inserted
CREATE OR REPLACE FUNCTION public.preview_dialer_leads(
  _session_id uuid,
  _claim_size integer DEFAULT 25,
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
  _contact_owner text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _normalized_claim_size integer := LEAST(GREATEST(COALESCE(_claim_size, 25), 0), 100);
  _current_hour integer := EXTRACT(HOUR FROM now() AT TIME ZONE 'Australia/Sydney')::integer;
  _normalized_trade_types text[] := NULL;
  _result jsonb;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.is_admin_or_coach(_user_id) THEN
    RAISE EXCEPTION 'Only admins or coaches can preview leads';
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

  WITH visible_contacts AS (
    SELECT c.id, c.call_attempt_count,
      (
        CASE c.prospect_tier
          WHEN 'Tier 1 - Hot' THEN 100
          WHEN 'Tier 2 - Warm' THEN 50
          WHEN 'Tier 3 - Nurture' THEN 20
          WHEN 'Tier 4 - Long Shot' THEN 10
          ELSE 30
        END
        + CASE c.buying_signal_strength WHEN 'Strong' THEN 30 WHEN 'Moderate' THEN 15 ELSE 0 END
        + CASE c.budget_indication WHEN 'Has Budget' THEN 20 ELSE 0 END
        + CASE c.authority_level WHEN 'Decision Maker' THEN 15 ELSE 0 END
        + CASE c.last_call_sentiment WHEN 'Warm' THEN 10 WHEN 'Engaged' THEN 10 ELSE 0 END
        - CASE WHEN c.call_attempt_count > 6 THEN 15 ELSE 0 END
        - CASE c.phone_number_quality WHEN 'suspect' THEN 10 ELSE 0 END
      ) AS priority_score
    FROM public.contacts c
    WHERE c.status = 'uncalled'
      AND c.is_dnc IS NOT TRUE
      AND c.meeting_booked_date IS NULL
      AND (c.next_followup_date IS NULL OR c.next_followup_date <= now())
      AND c.phone_number_quality <> 'dead'
      AND (c.buying_signal_strength IS NULL OR c.buying_signal_strength <> 'None')
      AND (c.last_call_sentiment IS NULL OR c.last_call_sentiment <> 'Hostile')
      AND c.call_attempt_count <= 12
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
      AND (
        _has_dm_phone IS NULL
        OR (_has_dm_phone = true AND c.dm_phone IS NOT NULL AND c.dm_phone <> '')
        OR (_has_dm_phone = false AND (c.dm_phone IS NULL OR c.dm_phone = ''))
      )
      AND (
        _contact_owner IS NULL
        OR (_contact_owner = 'unassigned' AND c.uploaded_by IS NULL)
        OR (_contact_owner <> 'unassigned' AND c.uploaded_by IS NOT NULL AND c.uploaded_by::text = _contact_owner)
      )
  ),
  total_available AS (
    SELECT COUNT(*)::int AS total_count FROM visible_contacts
  ),
  picked AS (
    SELECT vc.id
    FROM visible_contacts vc
    ORDER BY vc.priority_score DESC, vc.call_attempt_count ASC, random()
    LIMIT _normalized_claim_size
  ),
  picked_contacts AS (
    SELECT c.id, c.business_name, c.call_attempt_count, c.city, c.contact_person,
      c.created_at, c.email, c.gmb_link, c.industry, c.is_dnc, c.last_outcome,
      c.latest_appointment_outcome, c.latest_appointment_recorded_at,
      c.latest_appointment_scheduled_for, c.phone, c.phone_type, c.state, c.status,
      c.updated_at, c.uploaded_by, c.website, c.trade_type, c.work_type, c.business_size,
      c.prospect_tier, c.gbp_rating, c.review_count, c.has_google_ads, c.has_facebook_ads,
      c.buying_signal_strength, c.ghl_contact_id, c.dm_name, c.dm_role, c.dm_phone,
      c.dm_phone_type, c.dm_email, c.gatekeeper_name, c.best_route_to_decision_maker,
      c.best_time_to_call, c.google_rating, c.google_review_count, c.follow_up_note,
      c.voicemail_count, c.phone_number_quality, c.last_call_sentiment,
      c.budget_indication, c.authority_level, c.meeting_booked_date, c.next_followup_date
    FROM picked p
    JOIN public.contacts c ON c.id = p.id
  )
  SELECT jsonb_build_object(
    'total_available_count', COALESCE((SELECT total_count FROM total_available), 0),
    'claimed_contacts', COALESCE((SELECT jsonb_agg(to_jsonb(picked_contacts)) FROM picked_contacts), '[]'::jsonb)
  ) INTO _result;

  RETURN COALESCE(_result, jsonb_build_object('total_available_count', 0, 'claimed_contacts', '[]'::jsonb));
END;
$$;
