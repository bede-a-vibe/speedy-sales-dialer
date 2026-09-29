ALTER TYPE public.appointment_outcome ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TABLE public.pipeline_items
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES public.pipeline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ghl_stage_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS ghl_sync_error text;