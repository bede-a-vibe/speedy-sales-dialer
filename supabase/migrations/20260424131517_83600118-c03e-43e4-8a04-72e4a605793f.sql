-- Create benchmark_segments table for shared/team segments in Custom Monitor
CREATE TABLE public.benchmark_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  color TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.benchmark_segments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read team segments (low-sensitivity reporting filters)
CREATE POLICY "Authenticated users can view shared segments"
  ON public.benchmark_segments
  FOR SELECT
  TO authenticated
  USING (true);

-- Only the creator can insert their own
CREATE POLICY "Users can insert own segments"
  ON public.benchmark_segments
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Creator OR admin can update
CREATE POLICY "Creator or admin can update segments"
  ON public.benchmark_segments
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

-- Creator OR admin can delete
CREATE POLICY "Creator or admin can delete segments"
  ON public.benchmark_segments
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger to keep updated_at fresh (re-uses existing helper)
CREATE TRIGGER benchmark_segments_set_updated
  BEFORE UPDATE ON public.benchmark_segments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Helpful index for sorting team segments by recency
CREATE INDEX idx_benchmark_segments_created_at ON public.benchmark_segments (created_at DESC);
CREATE INDEX idx_benchmark_segments_created_by ON public.benchmark_segments (created_by);