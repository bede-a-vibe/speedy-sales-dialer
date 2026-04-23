-- 1. Add new stage-specific exit reason columns
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS exit_reason_connection text,
  ADD COLUMN IF NOT EXISTS exit_reason_problem text,
  ADD COLUMN IF NOT EXISTS exit_reason_solution text,
  ADD COLUMN IF NOT EXISTS exit_reason_commitment text,
  ADD COLUMN IF NOT EXISTS exit_reason_booking text,
  ADD COLUMN IF NOT EXISTS exit_reason_notes text;

-- 2. Backfill existing drop_off_reason into the appropriate stage column
-- Furthest stage reached determines which exit stage the reason belongs to.
UPDATE public.call_logs
SET exit_reason_connection = drop_off_reason
WHERE drop_off_reason IS NOT NULL
  AND reached_connection = false;

UPDATE public.call_logs
SET exit_reason_problem = drop_off_reason
WHERE drop_off_reason IS NOT NULL
  AND reached_connection = true
  AND reached_problem_awareness = false;

UPDATE public.call_logs
SET exit_reason_solution = drop_off_reason
WHERE drop_off_reason IS NOT NULL
  AND reached_problem_awareness = true
  AND reached_solution_awareness = false;

UPDATE public.call_logs
SET exit_reason_commitment = drop_off_reason
WHERE drop_off_reason IS NOT NULL
  AND reached_solution_awareness = true
  AND reached_commitment = false;

UPDATE public.call_logs
SET exit_reason_booking = drop_off_reason
WHERE drop_off_reason IS NOT NULL
  AND reached_commitment = true
  AND outcome <> 'booked';