
-- 1. Add last_called_at column
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS last_called_at timestamptz;

-- 2. Backfill from most recent call_log
UPDATE public.contacts c
SET last_called_at = sub.max_created
FROM (
  SELECT contact_id, MAX(created_at) AS max_created
  FROM public.call_logs
  GROUP BY contact_id
) sub
WHERE c.id = sub.contact_id;

-- 3. Update trigger to also set last_called_at
CREATE OR REPLACE FUNCTION public.sync_contact_call_attempt_count()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.contacts
    SET call_attempt_count = COALESCE(call_attempt_count, 0) + 1,
        last_called_at = now(),
        updated_at = now()
    WHERE id = NEW.contact_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.contacts
    SET call_attempt_count = GREATEST(COALESCE(call_attempt_count, 0) - 1, 0),
        updated_at = now()
    WHERE id = OLD.contact_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
      UPDATE public.contacts
      SET call_attempt_count = GREATEST(COALESCE(call_attempt_count, 0) - 1, 0),
          updated_at = now()
      WHERE id = OLD.contact_id;

      UPDATE public.contacts
      SET call_attempt_count = COALESCE(call_attempt_count, 0) + 1,
          last_called_at = now(),
          updated_at = now()
      WHERE id = NEW.contact_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- 4. Update claim_dialer_leads with cooldown parameter
CREATE OR REPLACE FUNCTION public.claim_dialer_leads(
  _session_id uuid,
  _industry text DEFAULT NULL,
  _state text DEFAULT NULL,
  _claim_size integer DEFAULT 25,
  _lock_minutes integer DEFAULT 15,
  _cooldown_minutes integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _normalized_claim_size INTEGER := LEAST(GREATEST(COALESCE(_claim_size, 25), 0), 100);
  _normalized_lock_minutes INTEGER := LEAST(GREATEST(COALESCE(_lock_minutes, 15), 1), 60);
  _normalized_cooldown INTEGER := GREATEST(COALESCE(_cooldown_minutes, 120), 0);
  _result JSONB;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

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
      AND (l.contact_id IS NULL OR l.session_id = _session_id)
      AND (_normalized_cooldown = 0 OR c.last_called_at IS NULL OR c.last_called_at < now() - make_interval(mins => _normalized_cooldown))
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
      contact_id, user_id, session_id, industry, state, expires_at
    )
    SELECT
      cc.id, _user_id, _session_id, _industry, _state,
      now() + make_interval(mins => _normalized_lock_minutes)
    FROM claimable_contacts cc
    WHERE _normalized_claim_size > 0
    ON CONFLICT (contact_id) DO NOTHING
    RETURNING contact_id
  ),
  claimed_contacts AS (
    SELECT
      c.id, c.business_name, c.call_attempt_count, c.city, c.contact_person,
      c.created_at, c.email, c.gmb_link, c.industry, c.is_dnc, c.last_outcome,
      c.latest_appointment_outcome, c.latest_appointment_recorded_at,
      c.latest_appointment_scheduled_for, c.phone, c.state, c.status,
      c.updated_at, c.uploaded_by, c.website
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
$$;

-- 5. Update get_dialer_queue_count with same cooldown
CREATE OR REPLACE FUNCTION public.get_dialer_queue_count(
  _session_id uuid,
  _industry text DEFAULT NULL,
  _state text DEFAULT NULL,
  _cooldown_minutes integer DEFAULT 120
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _normalized_cooldown INTEGER := GREATEST(COALESCE(_cooldown_minutes, 120), 0);
  _visible_count integer := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.dialer_lead_locks
  WHERE expires_at <= now();

  SELECT COUNT(*)::integer
  INTO _visible_count
  FROM public.contacts c
  LEFT JOIN public.dialer_lead_locks l
    ON l.contact_id = c.id
   AND l.expires_at > now()
  WHERE c.status = 'uncalled'
    AND c.is_dnc = false
    AND (_industry IS NULL OR _industry = 'all' OR c.industry = _industry)
    AND (_state IS NULL OR _state = 'all' OR c.state = _state)
    AND (l.contact_id IS NULL OR l.session_id = _session_id)
    AND (_normalized_cooldown = 0 OR c.last_called_at IS NULL OR c.last_called_at < now() - make_interval(mins => _normalized_cooldown));

  RETURN COALESCE(_visible_count, 0);
END;
$$;
