-- State of Being & Discipline block on the End of Day report.
--
-- Six answers, all captured as taps in the rep's EOD form. The split matters:
--   accountability (performance-manageable): precall_checklist_done,
--     script_reviewed_morning, script_reviewed_tonight, recordings_reviewed
--   pattern trackers (coaching context ONLY, never performance-manage on them):
--     energy_rating, right_headspace
--
-- Nullable on purpose: reports submitted before this migration have no answers,
-- and the frontend renders "not captured" rather than assuming a value.

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
    SELECT 1 FROM pg_constraint WHERE conname = 'eod_reports_recordings_reviewed_check'
  ) THEN
    ALTER TABLE public.eod_reports
      ADD CONSTRAINT eod_reports_recordings_reviewed_check
      CHECK (recordings_reviewed IS NULL OR recordings_reviewed >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'eod_reports_energy_rating_check'
  ) THEN
    ALTER TABLE public.eod_reports
      ADD CONSTRAINT eod_reports_energy_rating_check
      CHECK (energy_rating IS NULL OR (energy_rating BETWEEN 1 AND 10));
  END IF;
END $$;

COMMENT ON COLUMN public.eod_reports.precall_checklist_done IS
  'Accountability. "Did you complete the pre-call checklist and warm-up before your first dial?"';
COMMENT ON COLUMN public.eod_reports.script_reviewed_morning IS
  'Accountability. "Did you review your script this morning before dialing?"';
COMMENT ON COLUMN public.eod_reports.script_reviewed_tonight IS
  'Accountability. "Did you review your script tonight before submitting this report?"';
COMMENT ON COLUMN public.eod_reports.recordings_reviewed IS
  'Accountability, highest-leverage metric in the block. "How many of your own call recordings did you listen to today?"';
COMMENT ON COLUMN public.eod_reports.energy_rating IS
  'Pattern tracker - coaching context only, never performance-manage. "Rate your energy going into the shift, 1 to 10."';
COMMENT ON COLUMN public.eod_reports.right_headspace IS
  'Pattern tracker - coaching context only, never performance-manage. "Did you feel you were in the right headspace to perform today?"';
