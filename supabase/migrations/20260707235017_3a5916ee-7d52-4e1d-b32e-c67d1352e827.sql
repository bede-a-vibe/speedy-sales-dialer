
CREATE TABLE public.enrichment_ai_budget (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'Australia/Melbourne')::date,
  calls_used INT NOT NULL DEFAULT 0,
  daily_cap INT NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.enrichment_ai_budget TO authenticated;
GRANT ALL ON public.enrichment_ai_budget TO service_role;

ALTER TABLE public.enrichment_ai_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view budget"
  ON public.enrichment_ai_budget
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.enrichment_ai_budget (day, calls_used, daily_cap)
VALUES ((now() AT TIME ZONE 'Australia/Melbourne')::date, 0, 500);
