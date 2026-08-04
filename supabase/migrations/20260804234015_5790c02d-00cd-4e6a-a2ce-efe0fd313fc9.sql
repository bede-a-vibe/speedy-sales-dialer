ALTER TABLE public.dialpad_sync_state
  ADD COLUMN IF NOT EXISTS cursor text,
  ADD COLUMN IF NOT EXISTS done boolean NOT NULL DEFAULT false;