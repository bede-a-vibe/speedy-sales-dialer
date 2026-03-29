-- ============================================================
-- COMBINED MIGRATION: All pending changes for Speedy Sales Dialer
-- Run this in Supabase SQL Editor in one go
-- ============================================================

-- ============================================================
-- PART 1: Add 'ai_summary' to contact_note_source enum
-- ============================================================
ALTER TYPE public.contact_note_source ADD VALUE IF NOT EXISTS 'ai_summary';

-- ============================================================
-- PART 2: Follow-up sync to GHL trigger
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.sync_followup_to_ghl()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ghl_contact_id text;
  _contact_name text;
  _supabase_url text;
  _service_role_key text;
  _request_body jsonb;
BEGIN
  IF NEW.pipeline_type <> 'follow_up' THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  SELECT ghl_contact_id,
         COALESCE(first_name || ' ' || last_name, company_name, 'Contact')
  INTO _ghl_contact_id, _contact_name
  FROM public.contacts
  WHERE id = NEW.contact_id;

  IF _ghl_contact_id IS NULL OR _ghl_contact_id = '' THEN
    RAISE LOG '[sync_followup_to_ghl] No ghl_contact_id for contact_id=%, skipping', NEW.contact_id;
    RETURN NEW;
  END IF;

  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_role_key := current_setting('app.settings.service_role_key', true);

  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://xhcvwhcpaeetmmzkuwyw.supabase.co';
  END IF;

  IF _service_role_key IS NULL OR _service_role_key = '' THEN
    RAISE LOG '[sync_followup_to_ghl] service_role_key not available, skipping GHL sync for follow-up';
    RETURN NEW;
  END IF;

  _request_body := jsonb_build_object(
    'action', 'create_task',
    'contactId', _ghl_contact_id,
    'payload', jsonb_build_object(
      'title', COALESCE(NEW.notes, 'Follow-Up Call'),
      'body', 'Auto-created follow-up from Speedy Sales Dialer. Contact: ' || _contact_name,
      'dueDate', to_char(NEW.scheduled_for AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'completed', false
    )
  );

  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/ghl',
    body := _request_body::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    )
  );

  RAISE LOG '[sync_followup_to_ghl] Queued GHL task creation for contact_id=% ghl_contact_id=%', NEW.contact_id, _ghl_contact_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_followup_to_ghl ON public.pipeline_items;
CREATE TRIGGER trg_sync_followup_to_ghl
  AFTER INSERT ON public.pipeline_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_followup_to_ghl();

-- ============================================================
-- PART 3: Add new filterable columns to contacts table
-- ============================================================
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS trade_type TEXT,
  ADD COLUMN IF NOT EXISTS work_type TEXT,
  ADD COLUMN IF NOT EXISTS business_size TEXT,
  ADD COLUMN IF NOT EXISTS prospect_tier TEXT,
  ADD COLUMN IF NOT EXISTS gbp_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_google_ads TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS has_facebook_ads TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS buying_signal_strength TEXT,
  ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_trade_type ON public.contacts(trade_type);
CREATE INDEX IF NOT EXISTS idx_contacts_work_type ON public.contacts(work_type);
CREATE INDEX IF NOT EXISTS idx_contacts_business_size ON public.contacts(business_size);
CREATE INDEX IF NOT EXISTS idx_contacts_prospect_tier ON public.contacts(prospect_tier);
CREATE INDEX IF NOT EXISTS idx_contacts_gbp_rating ON public.contacts(gbp_rating);
CREATE INDEX IF NOT EXISTS idx_contacts_has_google_ads ON public.contacts(has_google_ads);
CREATE INDEX IF NOT EXISTS idx_contacts_has_facebook_ads ON public.contacts(has_facebook_ads);
CREATE INDEX IF NOT EXISTS idx_contacts_buying_signal_strength ON public.contacts(buying_signal_strength);
CREATE INDEX IF NOT EXISTS idx_contacts_ghl_contact_id ON public.contacts(ghl_contact_id);

-- ============================================================
-- PART 4: Phone type classification & DM tracking columns
-- ============================================================
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_type TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS dm_name TEXT,
  ADD COLUMN IF NOT EXISTS dm_role TEXT,
  ADD COLUMN IF NOT EXISTS dm_phone TEXT,
  ADD COLUMN IF NOT EXISTS dm_phone_type TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS dm_email TEXT,
  ADD COLUMN IF NOT EXISTS gatekeeper_name TEXT,
  ADD COLUMN IF NOT EXISTS best_time_to_call TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_type ON public.contacts(phone_type);
CREATE INDEX IF NOT EXISTS idx_contacts_dm_phone ON public.contacts(dm_phone);
CREATE INDEX IF NOT EXISTS idx_contacts_dm_phone_type ON public.contacts(dm_phone_type);

-- Phone type classification function
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

  cleaned := regexp_replace(phone_number, '[^0-9+]', '', 'g');

  -- Australian mobile: 04xx or +614xx
  IF cleaned ~ '^04[0-9]' THEN RETURN 'mobile'; END IF;
  IF cleaned ~ '^\+?614[0-9]' THEN RETURN 'mobile'; END IF;

  -- Australian landline: 02, 03, 07, 08 or +612, +613, +617, +618
  IF cleaned ~ '^0[2378][0-9]' THEN RETURN 'landline'; END IF;
  IF cleaned ~ '^\+?61[2378][0-9]' THEN RETURN 'landline'; END IF;

  -- Business/toll-free: 1300, 1800, 13xx
  IF cleaned ~ '^1300' THEN RETURN 'business_line'; END IF;
  IF cleaned ~ '^1800' THEN RETURN 'business_line'; END IF;
  IF cleaned ~ '^13[0-9]{2}$' THEN RETURN 'business_line'; END IF;

  RETURN 'unknown';
END;
$function$;

-- Auto-classify trigger function
CREATE OR REPLACE FUNCTION public.auto_classify_phone_types()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone OR TG_OP = 'INSERT' THEN
    NEW.phone_type := public.classify_au_phone_type(NEW.phone);
  END IF;

  IF NEW.dm_phone IS DISTINCT FROM OLD.dm_phone OR TG_OP = 'INSERT' THEN
    NEW.dm_phone_type := public.classify_au_phone_type(NEW.dm_phone);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_classify_phone_types ON public.contacts;
CREATE TRIGGER trg_auto_classify_phone_types
  BEFORE INSERT OR UPDATE OF phone, dm_phone
  ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_classify_phone_types();

-- Backfill phone_type for all existing contacts
UPDATE public.contacts
SET phone_type = public.classify_au_phone_type(phone)
WHERE phone IS NOT NULL AND phone != '';

-- ============================================================
-- PART 5: Updated claim_dialer_leads with ALL filters
-- FIXED: Keeps _cooldown_minutes, keeps original JSON keys
-- (claimed_contacts / total_available_count)
-- ============================================================

-- Drop old overloads to avoid ambiguity
DROP FUNCTION IF EXISTS public.claim_dialer_leads(uuid, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.claim_dialer_leads(uuid, text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.claim_dialer_leads(uuid, text, text, integer, integer, text, text, text, text, numeric, integer, text, text, text);
DROP FUNCTION IF EXISTS public.claim_dialer_leads(uuid, text, text, integer, integer, text, text, text, text, numeric, integer, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.claim_dialer_leads(
  _session_id uuid,
  _industry text DEFAULT NULL::text,
  _state text DEFAULT NULL::text,
  _claim_size integer DEFAULT 25,
  _lock_minutes integer DEFAULT 15,
  _cooldown_minutes integer DEFAULT 120,
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
  _normalized_cooldown INTEGER := GREATEST(COALESCE(_cooldown_minutes, 120), 0);
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
      c.call_attempt_count,
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
      c.phone_type,
      c.state,
      c.status,
      c.updated_at,
      c.uploaded_by,
      c.website,
      c.trade_type,
      c.work_type,
      c.business_size,
      c.prospect_tier,
      c.gbp_rating,
      c.review_count,
      c.has_google_ads,
      c.has_facebook_ads,
      c.buying_signal_strength,
      c.ghl_contact_id,
      c.dm_name,
      c.dm_role,
      c.dm_phone,
      c.dm_phone_type,
      c.dm_email,
      c.gatekeeper_name,
      c.best_time_to_call
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

-- ============================================================
-- PART 6: Updated get_dialer_queue_count with ALL filters
-- FIXED: Keeps _cooldown_minutes
-- ============================================================

DROP FUNCTION IF EXISTS public.get_dialer_queue_count(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_dialer_queue_count(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.get_dialer_queue_count(uuid, text, text, text, text, text, text, numeric, integer, text, text, text);
DROP FUNCTION IF EXISTS public.get_dialer_queue_count(uuid, text, text, text, text, text, text, numeric, integer, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.get_dialer_queue_count(
  _session_id uuid,
  _industry text DEFAULT NULL::text,
  _state text DEFAULT NULL::text,
  _cooldown_minutes integer DEFAULT 120,
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
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _normalized_cooldown INTEGER := GREATEST(COALESCE(_cooldown_minutes, 120), 0);
  _count INTEGER;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  DELETE FROM public.dialer_lead_locks
  WHERE expires_at <= now();

  SELECT COUNT(*)::INT INTO _count
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
    AND (_normalized_cooldown = 0 OR c.last_called_at IS NULL OR c.last_called_at < now() - make_interval(mins => _normalized_cooldown));

  RETURN COALESCE(_count, 0);
END;
$function$;

-- ============================================================
-- PART 7: Grant permissions
-- ============================================================
GRANT EXECUTE ON FUNCTION public.classify_au_phone_type(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dialer_leads(UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dialer_queue_count(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
