
-- Track background GHL sync jobs so the loop survives page navigation/refresh.
CREATE TABLE public.ghl_sync_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('active', 'all')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','cancelled')),
  batch_size integer NOT NULL DEFAULT 50,
  delay_ms integer NOT NULL DEFAULT 6000,
  current_offset integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  linked integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  last_batch_ms integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ghl_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ghl sync jobs"
ON public.ghl_sync_jobs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only one active job per user at a time
CREATE UNIQUE INDEX ghl_sync_jobs_one_active_per_user
  ON public.ghl_sync_jobs (created_by)
  WHERE status IN ('queued','running');

CREATE INDEX ghl_sync_jobs_recent_idx
  ON public.ghl_sync_jobs (created_by, created_at DESC);

CREATE TRIGGER update_ghl_sync_jobs_updated_at
BEFORE UPDATE ON public.ghl_sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
