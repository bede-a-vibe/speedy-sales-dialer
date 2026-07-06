CREATE TABLE IF NOT EXISTS public.ghl_import_state (
  id int PRIMARY KEY DEFAULT 1,
  cursor jsonb,
  done boolean NOT NULL DEFAULT false,
  imported int NOT NULL DEFAULT 0,
  skipped_dupe int NOT NULL DEFAULT 0,
  skipped_excluded int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ghl_import_state_singleton CHECK (id = 1)
);

GRANT ALL ON public.ghl_import_state TO service_role;

ALTER TABLE public.ghl_import_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.ghl_import_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.ghl_import_state (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;