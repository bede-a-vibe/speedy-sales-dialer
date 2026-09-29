CREATE TABLE public.kpi_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_settings TO authenticated;
GRANT ALL ON public.kpi_settings TO service_role;
ALTER TABLE public.kpi_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read KPI settings" ON public.kpi_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage KPI settings" ON public.kpi_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));