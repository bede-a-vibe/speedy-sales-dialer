
-- Caller ID rotation compliance & local-presence support
ALTER TABLE public.caller_id_pool
  ADD COLUMN IF NOT EXISTS area_code text,
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS owned_attested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attested_at timestamptz;

-- Backfill area_code from existing E.164 phone_number (best-effort AU parsing).
UPDATE public.caller_id_pool
SET area_code = CASE
  WHEN phone_number ~ '^\+614' THEN '04'
  WHEN phone_number ~ '^\+612' THEN '02'
  WHEN phone_number ~ '^\+613' THEN '03'
  WHEN phone_number ~ '^\+617' THEN '07'
  WHEN phone_number ~ '^\+618' THEN '08'
  ELSE area_code
END,
region = CASE
  WHEN phone_number ~ '^\+614' THEN 'MOBILE'
  WHEN phone_number ~ '^\+612' THEN 'NSW/ACT'
  WHEN phone_number ~ '^\+613' THEN 'VIC/TAS'
  WHEN phone_number ~ '^\+617' THEN 'QLD'
  WHEN phone_number ~ '^\+618' THEN 'SA/WA/NT'
  ELSE region
END
WHERE area_code IS NULL;

-- Mark existing numbers as attested so live rotation is not broken by the new gate.
-- Admins should re-review; toggling off is a single click in the manager.
UPDATE public.caller_id_pool
SET owned_attested = true, attested_at = COALESCE(attested_at, now())
WHERE owned_attested = false;

CREATE INDEX IF NOT EXISTS idx_caller_id_pool_user_area
  ON public.caller_id_pool (user_id, area_code)
  WHERE is_active AND owned_attested;
