CREATE TABLE public.smart_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  filters jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  is_shared boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_lists TO authenticated;
GRANT ALL ON public.smart_lists TO service_role;

ALTER TABLE public.smart_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shared or own smart lists"
  ON public.smart_lists FOR SELECT TO authenticated
  USING (is_shared = true OR created_by = auth.uid());

CREATE POLICY "Users can create their own smart lists"
  ON public.smart_lists FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete their own smart lists"
  ON public.smart_lists FOR DELETE TO authenticated
  USING (created_by = auth.uid());
