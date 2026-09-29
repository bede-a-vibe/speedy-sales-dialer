ALTER TABLE public.pipeline_items
  ADD COLUMN IF NOT EXISTS meeting_ghl_opportunity_id text,
  ADD COLUMN IF NOT EXISTS meeting_ghl_stage_id text;