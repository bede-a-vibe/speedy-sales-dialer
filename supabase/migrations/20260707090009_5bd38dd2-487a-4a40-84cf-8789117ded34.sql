
ALTER TABLE public.pipeline_items ADD COLUMN IF NOT EXISTS deal_stage text NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_items_deal_stage ON public.pipeline_items(deal_stage) WHERE pipeline_type = 'booked';

-- Optional constraint on allowed values (nullable)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_items_deal_stage_check'
  ) THEN
    ALTER TABLE public.pipeline_items
      ADD CONSTRAINT pipeline_items_deal_stage_check
      CHECK (deal_stage IS NULL OR deal_stage IN ('booked','showed','proposal','won','lost'));
  END IF;
END $$;

-- Backfill from appointment_outcome for booked-type items
UPDATE public.pipeline_items
SET deal_stage = CASE
  WHEN appointment_outcome = 'showed_closed' THEN 'won'
  WHEN appointment_outcome = 'showed_no_close' THEN 'lost'
  WHEN appointment_outcome = 'no_show' THEN 'lost'
  WHEN appointment_outcome = 'showed_verbal_commitment' THEN 'proposal'
  WHEN appointment_outcome = 'no_close_follow_up' THEN 'proposal'
  WHEN appointment_outcome = 'second_meeting_booked' THEN 'showed'
  ELSE 'booked'
END
WHERE pipeline_type = 'booked' AND deal_stage IS NULL;
