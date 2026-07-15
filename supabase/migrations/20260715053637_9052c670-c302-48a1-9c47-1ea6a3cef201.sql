
-- Extend dialpad_calls for pull-sync
ALTER TABLE public.dialpad_calls
  ALTER COLUMN contact_id DROP NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS talk_time_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS total_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_number TEXT,
  ADD COLUMN IF NOT EXISTS is_connected BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dialpad_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_dialpad_calls_started_at ON public.dialpad_calls(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_dialpad_calls_external_number ON public.dialpad_calls(external_number);

-- Sync state table (singleton row per key)
CREATE TABLE IF NOT EXISTS public.dialpad_sync_state (
  key TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_pulled INTEGER,
  last_linked INTEGER,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dialpad_sync_state TO authenticated;
GRANT ALL ON public.dialpad_sync_state TO service_role;

ALTER TABLE public.dialpad_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view dialpad sync state"
  ON public.dialpad_sync_state
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
