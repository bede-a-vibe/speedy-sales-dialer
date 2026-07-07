
CREATE TABLE IF NOT EXISTS public.call_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_log_id UUID REFERENCES public.call_logs(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  dialpad_call_id TEXT,
  scorecard JSONB NOT NULL,
  overall_score INTEGER NOT NULL DEFAULT 0,
  broke_down_at TEXT,
  booking_blocker TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS call_scores_call_log_id_idx ON public.call_scores(call_log_id);
CREATE INDEX IF NOT EXISTS call_scores_contact_id_idx ON public.call_scores(contact_id);
CREATE INDEX IF NOT EXISTS call_scores_dialpad_call_id_idx ON public.call_scores(dialpad_call_id);

GRANT SELECT ON public.call_scores TO authenticated;
GRANT ALL ON public.call_scores TO service_role;

ALTER TABLE public.call_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all call scores"
  ON public.call_scores FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_call_scores_updated_at
  BEFORE UPDATE ON public.call_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
