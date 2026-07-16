
ALTER TABLE public.enrichment_ai_budget
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'enrichment_name';

CREATE UNIQUE INDEX IF NOT EXISTS enrichment_ai_budget_kind_key
  ON public.enrichment_ai_budget (kind);

INSERT INTO public.enrichment_ai_budget (day, calls_used, daily_cap, kind)
SELECT (now() AT TIME ZONE 'Australia/Melbourne')::date, 0, 100, 'booked_call_scoring'
WHERE NOT EXISTS (SELECT 1 FROM public.enrichment_ai_budget WHERE kind = 'booked_call_scoring');
