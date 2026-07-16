
ALTER TABLE public.dialpad_calls
  ADD COLUMN IF NOT EXISTS recording_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_type TEXT,
  ADD COLUMN IF NOT EXISTS recording_url TEXT,
  ADD COLUMN IF NOT EXISTS recording_share_link TEXT,
  ADD COLUMN IF NOT EXISTS recording_share_link_id TEXT,
  ADD COLUMN IF NOT EXISTS recording_share_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS dialpad_calls_recording_missing_idx
  ON public.dialpad_calls (talk_time_seconds DESC)
  WHERE recording_id IS NULL;
