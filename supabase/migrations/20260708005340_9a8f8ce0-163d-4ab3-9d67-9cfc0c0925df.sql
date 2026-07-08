CREATE TABLE public.client_deals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  stream text NOT NULL CHECK (stream IN ('google_ads','meta_ads','seo','web','social','other')),
  amount numeric NOT NULL,
  billing_period text NOT NULL CHECK (billing_period IN ('weekly','fortnightly','monthly','quarterly','annually','one_off')),
  gst boolean NOT NULL DEFAULT true,
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','churned')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_deals TO authenticated;
GRANT ALL ON public.client_deals TO service_role;

ALTER TABLE public.client_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view client deals" ON public.client_deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert client deals" ON public.client_deals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update client deals" ON public.client_deals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete client deals" ON public.client_deals FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_client_deals_contact ON public.client_deals (contact_id);
CREATE INDEX idx_client_deals_status ON public.client_deals (status);

CREATE TRIGGER update_client_deals_updated_at
  BEFORE UPDATE ON public.client_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.client_deals (contact_id, stream, amount, billing_period, gst, start_date, status)
VALUES
  ('0796a755-8900-46d2-88d3-c17fe033f3a5', 'google_ads', 300, 'weekly', true, '2026-05-08', 'active'),
  ('0796a755-8900-46d2-88d3-c17fe033f3a5', 'seo', 2000, 'monthly', true, '2026-05-08', 'active');

UPDATE public.contacts
SET lifecycle_stage = 'won', status = 'closed'
WHERE id = '0796a755-8900-46d2-88d3-c17fe033f3a5'
  AND (lifecycle_stage IS DISTINCT FROM 'won' OR status IS DISTINCT FROM 'closed');
