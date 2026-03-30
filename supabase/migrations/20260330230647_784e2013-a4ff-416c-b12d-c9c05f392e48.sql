DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('claim_dialer_leads', 'get_dialer_queue_count')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s)', r.proname, r.args);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_dialer_leads(
  _session_id uuid,
  _claim_size integer DEFAULT 25,
  _lock_minutes integer DEFAULT 15,
  _industries text[] DEFAULT NULL::text[],
  _states text[] DEFAULT NULL::text[],
  _trade_types text[] DEFAULT NULL::text[],
  _work_type text DEFAULT NULL::text,
  _business_size text DEFAULT NULL::text,
  _prospect_tier text DEFAULT NULL::text,
  _min_gbp_rating numeric DEFAULT NULL::numeric,
  _min_review_count integer DEFAULT NULL::integer,
  _has_google_ads text DEFAULT NULL::text,
  _has_facebook_ads text DEFAULT NULL::text,
  _buying_signal_strength text DEFAULT NULL::text,
  _phone_type text DEFAULT NULL::text,
  _has_dm_phone boolean DEFAULT NULL::boolean,
  _contact_owner text DEFAULT NULL::text
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
  _result jsonb;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.dialer_lead_locks
  WHERE expires_at <= now();

  WITH visible_contacts AS (
    SELECT c.id, c.call_attempt_count, c.created_at, l.session_id AS lock_session_id
    FROM public.contacts c
    LEFT JOIN public.dialer_lead_locks l ON l.contact_id = c.id AND l.expires_at > now()
    WHERE c.status = 'uncalled'
      AND c.is_dnc IS NOT TRUE
      AND (_industries IS NULL OR c.industry = ANY(_industries))
      AND (_states IS NULL OR UPPER(COALESCE(c.state, '')) = ANY(ARRAY(SELECT UPPER(value) FROM unnest(_states) AS value)))
      AND (_trade_types IS NULL OR c.trade_type = ANY(_trade_types) OR (c.trade_type IS NULL AND c.industry = ANY(_trade_types)))
      AND (_work_type IS NULL OR _work_type = 'all' OR c.work_type = _work_type)
      AND (_business_size IS NULL OR _business_size = 'all' OR c.business_size = _business_size)
      AND (_prospect_tier IS NULL OR _prospect_tier = 'all' OR c.prospect_tier = _prospect_tier)
      AND (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
      AND (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
      AND (_has_google_ads IS NULL OR _has_google_ads = 'all' OR c.has_google_ads = _has_google_ads)
      AND (_has_facebook_ads IS NULL OR _has_facebook_ads = 'all' OR c.has_facebook_ads = _has_facebook_ads)
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
      AND (l.contact_id IS NULL OR l.session_id = _session_id)
  ),
  total_available AS (
    SELECT COUNT(*)::int AS total_count FROM visible_contacts
  ),
  claimable_contacts AS (
    SELECT vc.id
    FROM visible_contacts vc
    WHERE vc.lock_session_id IS NULL
    ORDER BY vc.call_attempt_count ASC, random()
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
    SELECT c.id, c.business_name, c.call_attempt_count, c.city, c.contact_person,
      c.created_at, c.email, c.gmb_link, c.industry, c.is_dnc, c.last_outcome,
      c.latest_appointment_outcome, c.latest_appointment_recorded_at,
      c.latest_appointment_scheduled_for, c.phone, c.phone_type, c.state, c.status,
      c.updated_at, c.uploaded_by, c.website, c.trade_type, c.work_type, c.business_size,
      c.prospect_tier, c.gbp_rating, c.review_count, c.has_google_ads, c.has_facebook_ads,
      c.buying_signal_strength, c.ghl_contact_id, c.dm_name, c.dm_role, c.dm_phone,
      c.dm_phone_type, c.dm_email, c.gatekeeper_name, c.best_time_to_call,
      c.google_rating, c.google_review_count, c.follow_up_note, c.voicemail_count,
      c.phone_number_quality
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

CREATE OR REPLACE FUNCTION public.get_dialer_queue_count(
  _session_id uuid,
  _industries text[] DEFAULT NULL::text[],
  _states text[] DEFAULT NULL::text[],
  _trade_types text[] DEFAULT NULL::text[],
  _work_type text DEFAULT NULL::text,
  _business_size text DEFAULT NULL::text,
  _prospect_tier text DEFAULT NULL::text,
  _min_gbp_rating numeric DEFAULT NULL::numeric,
  _min_review_count integer DEFAULT NULL::integer,
  _has_google_ads text DEFAULT NULL::text,
  _has_facebook_ads text DEFAULT NULL::text,
  _buying_signal_strength text DEFAULT NULL::text,
  _phone_type text DEFAULT NULL::text,
  _has_dm_phone boolean DEFAULT NULL::boolean,
  _contact_owner text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _count integer;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.dialer_lead_locks
  WHERE expires_at <= now();

  SELECT COUNT(*)::int
  INTO _count
  FROM public.contacts c
  LEFT JOIN public.dialer_lead_locks l ON l.contact_id = c.id AND l.expires_at > now()
  WHERE c.status = 'uncalled'
    AND c.is_dnc IS NOT TRUE
    AND (_industries IS NULL OR c.industry = ANY(_industries))
    AND (_states IS NULL OR UPPER(COALESCE(c.state, '')) = ANY(ARRAY(SELECT UPPER(value) FROM unnest(_states) AS value)))
    AND (_trade_types IS NULL OR c.trade_type = ANY(_trade_types) OR (c.trade_type IS NULL AND c.industry = ANY(_trade_types)))
    AND (_work_type IS NULL OR _work_type = 'all' OR c.work_type = _work_type)
    AND (_business_size IS NULL OR _business_size = 'all' OR c.business_size = _business_size)
    AND (_prospect_tier IS NULL OR _prospect_tier = 'all' OR c.prospect_tier = _prospect_tier)
    AND (_min_gbp_rating IS NULL OR COALESCE(c.gbp_rating, 0) >= _min_gbp_rating)
    AND (_min_review_count IS NULL OR COALESCE(c.review_count, 0) >= _min_review_count)
    AND (_has_google_ads IS NULL OR _has_google_ads = 'all' OR c.has_google_ads = _has_google_ads)
    AND (_has_facebook_ads IS NULL OR _has_facebook_ads = 'all' OR c.has_facebook_ads = _has_facebook_ads)
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
    AND (l.contact_id IS NULL OR l.session_id = _session_id);

  RETURN COALESCE(_count, 0);
END;
$function$;