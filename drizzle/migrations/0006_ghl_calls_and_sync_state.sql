-- GHL call ingest ------------------------------------------------------------
-- Reps place calls from two systems: the dialer (Dialpad) and GoHighLevel's own
-- built-in phone. Only Dialpad was ever captured, so the End of Day report
-- understated real dials and talk time.
--
-- This migration adds the storage side of the fix:
--   * public.ghl_calls       — one raw row per GHL call, deduped on alt_id
--   * public.ghl_sync_state  — incremental cursor (mirrors dialpad_sync_state)
--   * get_rep_ghl_call_metrics(user, date) — aggregate at QUERY time
--   * a daily pg_cron job that invokes the ghl-calls-sync edge function
--
-- Deliberately NOT here: no daily totals are stored anywhere. Inputs in,
-- outputs calculated. A stored total goes stale and nobody notices.

-- 1. Raw call rows -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ghl_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Twilio call SID from the GHL message's `altId`. Natural unique key, so
  -- re-running the sync over an overlapping window is a no-op.
  alt_id text NOT NULL UNIQUE,
  ghl_message_id text,
  ghl_user_id text,
  ghl_contact_id text,
  conversation_id text,
  direction text,
  status text,
  duration_seconds integer NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ghl_calls IS
  'Calls placed through GoHighLevel''s built-in phone. Separate system from dialpad_calls — never union the two without deduping on the underlying provider call SID.';
COMMENT ON COLUMN public.ghl_calls.alt_id IS 'GHL message altId = the Twilio call SID. Unique key used for idempotent upserts.';
COMMENT ON COLUMN public.ghl_calls.ghl_user_id IS 'GHL user who placed the call. Joins to profiles.ghl_user_id. Rows with no matching profile are still stored and logged as unmapped.';
COMMENT ON COLUMN public.ghl_calls.duration_seconds IS 'meta.call.duration from GHL — talk time in seconds.';

CREATE INDEX IF NOT EXISTS idx_ghl_calls_user_occurred
  ON public.ghl_calls (ghl_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_calls_occurred_at
  ON public.ghl_calls (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_calls_contact
  ON public.ghl_calls (ghl_contact_id);

ALTER TABLE public.ghl_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and coaches can view GHL calls" ON public.ghl_calls;
CREATE POLICY "Admins and coaches can view GHL calls"
  ON public.ghl_calls
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'coach'::app_role)
  );

-- Reps read their own calls through the mapping on their profile. Everything
-- else goes via get_rep_ghl_call_metrics, which is SECURITY DEFINER.
DROP POLICY IF EXISTS "Reps can view their own GHL calls" ON public.ghl_calls;
CREATE POLICY "Reps can view their own GHL calls"
  ON public.ghl_calls
  FOR SELECT
  TO authenticated
  USING (
    ghl_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid() AND p.ghl_user_id = public.ghl_calls.ghl_user_id
    )
  );

GRANT SELECT ON public.ghl_calls TO authenticated;
GRANT ALL ON public.ghl_calls TO service_role;

-- 2. Incremental cursor ------------------------------------------------------
-- Same shape as public.dialpad_sync_state, kept as its own table so GHL state
-- never has to live under a table named after Dialpad.

CREATE TABLE IF NOT EXISTS public.ghl_sync_state (
  key text PRIMARY KEY,
  last_synced_at timestamptz,
  last_run_at timestamptz,
  last_pulled integer,
  last_stored integer,
  last_unmapped jsonb,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.ghl_sync_state.last_synced_at IS
  'High-water mark. The sync asks GHL for conversations with lastMessageDate newer than this (minus a 10 minute overlap) and only advances it on a clean pass.';
COMMENT ON COLUMN public.ghl_sync_state.last_unmapped IS
  'GHL user ids seen on the last run with no matching profiles.ghl_user_id, with call counts. Their calls ARE stored — this is the signal to add the mapping.';

ALTER TABLE public.ghl_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view GHL sync state" ON public.ghl_sync_state;
CREATE POLICY "Admins can view GHL sync state"
  ON public.ghl_sync_state
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.ghl_sync_state TO authenticated;
GRANT ALL ON public.ghl_sync_state TO service_role;

INSERT INTO public.ghl_sync_state (key) VALUES ('ghl_calls_sync')
ON CONFLICT (key) DO NOTHING;

-- 3. Query-time aggregation --------------------------------------------------
-- Additive and deliberately separate from get_rep_eod_metrics (which lives in
-- production but not in this migrations folder). Merging the two into a single
-- dials/talk-time number is a follow-up that needs the prod RPC definition.

CREATE OR REPLACE FUNCTION public.get_rep_ghl_call_metrics(_user_id uuid, _date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ghl_user_id text;
  _day_start timestamptz;
  _day_end timestamptz;
  _result jsonb;
BEGIN
  -- A rep reads their own numbers; admins and coaches read anyone's.
  -- auth.uid() is NULL for service_role / cron callers, which are trusted.
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> _user_id
     AND NOT public.is_admin_or_coach(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised to read GHL call metrics for another user';
  END IF;

  SELECT p.ghl_user_id INTO _ghl_user_id
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  -- The report day is a Melbourne calendar day, matching @/lib/eodDates.
  _day_start := (_date::timestamp AT TIME ZONE 'Australia/Melbourne');
  _day_end := ((_date + 1)::timestamp AT TIME ZONE 'Australia/Melbourne');

  IF _ghl_user_id IS NULL OR _ghl_user_id = '' THEN
    -- No mapping yet. Say so explicitly rather than reporting a truthful-looking
    -- zero: an unmapped rep is a setup problem, not a quiet day.
    RETURN jsonb_build_object(
      'date', _date,
      'mapped', false,
      'ghl_user_id', NULL,
      'dials', 0,
      'connects', 0,
      'talk_time_seconds', 0,
      'inbound_calls', 0,
      'inbound_talk_time_seconds', 0
    );
  END IF;

  SELECT jsonb_build_object(
    'date', _date,
    'mapped', true,
    'ghl_user_id', _ghl_user_id,
    'dials', COUNT(*) FILTER (WHERE c.direction = 'outbound'),
    'connects', COUNT(*) FILTER (
      WHERE c.direction = 'outbound' AND c.status = 'completed' AND c.duration_seconds > 0
    ),
    'talk_time_seconds', COALESCE(SUM(c.duration_seconds) FILTER (WHERE c.direction = 'outbound'), 0),
    'inbound_calls', COUNT(*) FILTER (WHERE c.direction = 'inbound'),
    'inbound_talk_time_seconds', COALESCE(SUM(c.duration_seconds) FILTER (WHERE c.direction = 'inbound'), 0)
  )
  INTO _result
  FROM public.ghl_calls c
  WHERE c.ghl_user_id = _ghl_user_id
    AND c.occurred_at >= _day_start
    AND c.occurred_at < _day_end;

  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_rep_ghl_call_metrics(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rep_ghl_call_metrics(uuid, date) TO authenticated, service_role;

-- 4. Daily cron --------------------------------------------------------------
-- 19:00 UTC = 05:00 Melbourne (AEST) / 06:00 (AEDT) — early enough that the
-- previous Melbourne day is closed and complete.
-- ghl-calls-sync runs with verify_jwt = false (see supabase/config.toml), so no
-- key is embedded here.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ghl-calls-sync-daily') THEN
    PERFORM cron.unschedule('ghl-calls-sync-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'ghl-calls-sync-daily',
  '0 19 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://xhcvwhcpaeetmmzkuwyw.supabase.co/functions/v1/ghl-calls-sync',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"action":"sync"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);