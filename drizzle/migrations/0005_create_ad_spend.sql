CREATE TABLE IF NOT EXISTS public.ad_spend (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date          date NOT NULL,
  platform      text NOT NULL DEFAULT 'meta',
  brand         text NOT NULL DEFAULT 'odin',
  campaign_id   text,
  campaign_name text NOT NULL,
  spend         numeric(12,2) NOT NULL DEFAULT 0,
  impressions   integer NOT NULL DEFAULT 0,
  link_clicks   integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_spend_brand_chk CHECK (brand IN ('odin','veritas')),
  CONSTRAINT ad_spend_day_campaign_uniq UNIQUE (date, platform, campaign_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_spend TO authenticated;
GRANT ALL ON public.ad_spend TO service_role;

CREATE INDEX IF NOT EXISTS idx_ad_spend_date       ON public.ad_spend (date);
CREATE INDEX IF NOT EXISTS idx_ad_spend_brand_date ON public.ad_spend (brand, date);
CREATE INDEX IF NOT EXISTS idx_ad_spend_campaign   ON public.ad_spend (campaign_name);

ALTER TABLE public.ad_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View ad spend (admin/coach)" ON public.ad_spend
  FOR SELECT TO authenticated
  USING (public.is_admin_or_coach(auth.uid()));

CREATE POLICY "Manage ad spend (admin)" ON public.ad_spend
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages ad spend" ON public.ad_spend
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_ad_spend_updated_at
  BEFORE UPDATE ON public.ad_spend
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();