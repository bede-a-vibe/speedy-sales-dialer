-- Funnel tracking columns on call_logs
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS reached_connection boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reached_problem_awareness boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reached_solution_awareness boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reached_commitment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opener_used_id uuid,
  ADD COLUMN IF NOT EXISTS drop_off_reason text;

-- Call openers table
CREATE TABLE IF NOT EXISTS public.call_openers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  script text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_logs
  ADD CONSTRAINT call_logs_opener_used_id_fkey
  FOREIGN KEY (opener_used_id) REFERENCES public.call_openers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_opener_used_id ON public.call_logs(opener_used_id);
CREATE INDEX IF NOT EXISTS idx_call_openers_active ON public.call_openers(is_active);

ALTER TABLE public.call_openers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view call openers"
  ON public.call_openers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert call openers"
  ON public.call_openers FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update call openers"
  ON public.call_openers FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete call openers"
  ON public.call_openers FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_call_openers_updated_at
  BEFORE UPDATE ON public.call_openers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();