CREATE OR REPLACE FUNCTION public.claim_dialer_leads(
  _session_id UUID,
  _industry TEXT DEFAULT NULL,
  _state TEXT DEFAULT NULL,
  _claim_size INTEGER DEFAULT 25,
  _lock_minutes INTEGER DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _normalized_claim_size INTEGER := LEAST(GREATEST(COALESCE(_claim_size, 25), 0), 100);
  _normalized_lock_minutes INTEGER := LEAST(GREATEST(COALESCE(_lock_minutes, 15), 1), 60);
  _result JSONB;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.dialer_lead_locks
  WHERE expires_at <= now();

  WITH call_counts AS (
    SELECT cl.contact_id, COUNT(*)::INT AS call_count
    FROM public.call_logs cl
    GROUP BY cl.contact_id
  ),
  visible_contacts AS (
    SELECT
      c.id,
      c.business_name,
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
      COALESCE(cc.call_count, 0) AS call_count,
      l.user_id AS lock_user_id,
      l.session_id AS lock_session_id
    FROM public.contacts c
    LEFT JOIN call_counts cc ON cc.contact_id = c.id
    LEFT JOIN public.dialer_lead_locks l
      ON l.contact_id = c.id
     AND l.expires_at > now()
    WHERE c.status = 'uncalled'
      AND c.is_dnc = false
      AND (_industry IS NULL OR _industry = 'all' OR c.industry = _industry)
      AND (_state IS NULL OR _state = 'all' OR c.state = _state)
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
    ORDER BY vc.call_count ASC, vc.created_at ASC, vc.id ASC
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
      COALESCE(cc.call_count, 0) AS call_count
    FROM inserted_locks il
    JOIN public.contacts c ON c.id = il.contact_id
    LEFT JOIN call_counts cc ON cc.contact_id = c.id
    ORDER BY COALESCE(cc.call_count, 0) ASC, c.created_at ASC, c.id ASC
  )
  SELECT jsonb_build_object(
    'total_available_count', COALESCE((SELECT total_count FROM total_available), 0),
    'claimed_contacts', COALESCE((SELECT jsonb_agg(to_jsonb(claimed_contacts)) FROM claimed_contacts), '[]'::jsonb)
  )
  INTO _result;

  RETURN COALESCE(_result, jsonb_build_object('total_available_count', 0, 'claimed_contacts', '[]'::jsonb));
END;
$$;