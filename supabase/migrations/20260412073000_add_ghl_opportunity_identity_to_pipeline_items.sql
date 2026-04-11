ALTER TABLE public.pipeline_items
  ADD COLUMN IF NOT EXISTS ghl_opportunity_id text,
  ADD COLUMN IF NOT EXISTS ghl_pipeline_id text,
  ADD COLUMN IF NOT EXISTS ghl_stage_id text;

CREATE INDEX IF NOT EXISTS idx_pipeline_items_ghl_opportunity_id
  ON public.pipeline_items (ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_items_ghl_pipeline_stage
  ON public.pipeline_items (ghl_pipeline_id, ghl_stage_id)
  WHERE ghl_pipeline_id IS NOT NULL OR ghl_stage_id IS NOT NULL;
