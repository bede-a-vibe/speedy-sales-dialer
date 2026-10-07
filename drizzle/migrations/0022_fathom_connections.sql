CREATE TABLE public.fathom_connections (
  user_id uuid PRIMARY KEY,
  api_key text NOT NULL,
  status text NOT NULL DEFAULT 'connected',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT (user_id, status, last_synced_at, last_error, created_at, updated_at) ON public.fathom_connections TO authenticated;
GRANT ALL ON public.fathom_connections TO service_role;
ALTER TABLE public.fathom_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or manager read fathom status" ON public.fathom_connections FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin_or_coach(auth.uid()));

CREATE TABLE public.fathom_meetings (
  fathom_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  title text,
  start_at timestamptz,
  end_at timestamptz,
  attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  share_url text,
  summary text,
  pipeline_item_id uuid REFERENCES public.pipeline_items(id) ON DELETE SET NULL,
  match_confidence text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fathom_meetings_user_idx ON public.fathom_meetings(user_id, start_at DESC);
CREATE INDEX fathom_meetings_item_idx ON public.fathom_meetings(pipeline_item_id);
GRANT SELECT ON public.fathom_meetings TO authenticated;
GRANT ALL ON public.fathom_meetings TO service_role;
ALTER TABLE public.fathom_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or manager read fathom meetings" ON public.fathom_meetings FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin_or_coach(auth.uid()));