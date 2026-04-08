
CREATE TABLE public.pending_ghl_pushes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  dialpad_call_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  ai_note TEXT,
  ai_fields JSONB DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'dialpad_ai_summary',
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, dialpad_call_id, source)
);

ALTER TABLE public.pending_ghl_pushes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on pending_ghl_pushes"
  ON public.pending_ghl_pushes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can read pending_ghl_pushes"
  ON public.pending_ghl_pushes
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
