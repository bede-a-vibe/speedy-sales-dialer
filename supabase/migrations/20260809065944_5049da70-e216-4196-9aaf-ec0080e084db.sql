ALTER TABLE public.eod_reports
  ADD COLUMN IF NOT EXISTS precall_checklist_done boolean,
  ADD COLUMN IF NOT EXISTS script_reviewed_morning boolean,
  ADD COLUMN IF NOT EXISTS script_reviewed_tonight boolean,
  ADD COLUMN IF NOT EXISTS recordings_reviewed integer,
  ADD COLUMN IF NOT EXISTS energy_rating smallint,
  ADD COLUMN IF NOT EXISTS right_headspace boolean;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eod_reports_recordings_reviewed_check'
      AND conrelid = 'public.eod_reports'::regclass
  ) THEN
    ALTER TABLE public.eod_reports
      ADD CONSTRAINT eod_reports_recordings_reviewed_check
      CHECK (recordings_reviewed >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'eod_reports_energy_rating_check'
      AND conrelid = 'public.eod_reports'::regclass
  ) THEN
    ALTER TABLE public.eod_reports
      ADD CONSTRAINT eod_reports_energy_rating_check
      CHECK (energy_rating BETWEEN 1 AND 10);
  END IF;
END $$;

COMMENT ON COLUMN public.eod_reports.precall_checklist_done IS 'Accountability: rep completed pre-call checklist and warm-up before first dial';
COMMENT ON COLUMN public.eod_reports.script_reviewed_morning IS 'Accountability: rep reviewed script in the morning before dialing';
COMMENT ON COLUMN public.eod_reports.script_reviewed_tonight IS 'Accountability: rep reviewed script at night before submitting EOD';
COMMENT ON COLUMN public.eod_reports.recordings_reviewed IS 'Accountability, highest leverage: count of own call recordings the rep reviewed today';
COMMENT ON COLUMN public.eod_reports.energy_rating IS 'Pattern tracker only, never performance-managed: self-reported energy 1-10';
COMMENT ON COLUMN public.eod_reports.right_headspace IS 'Pattern tracker only, never performance-managed: self-reported headspace';