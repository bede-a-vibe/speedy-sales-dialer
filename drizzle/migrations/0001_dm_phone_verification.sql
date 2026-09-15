ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS dm_phone_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dm_phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS dm_phone_blocklist text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.contacts.dm_phone_verified IS 'True once a rep confirmed on a live call that dm_phone reaches the named decision maker. Dialer only auto-dials a verified DM number.';
COMMENT ON COLUMN public.contacts.dm_phone_blocklist IS 'Last-9-digit phone suffixes proven wrong for this lead. Enrichment must never write these back.';

CREATE TABLE IF NOT EXISTS public.dm_bleed_backup_20260915 (
  id uuid,
  business_name text,
  phone text,
  dm_name text,
  dm_phone text,
  dm_phone_type text,
  best_route_to_decision_maker text,
  reason text,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dm_bleed_backup_20260915 TO authenticated;
GRANT ALL ON public.dm_bleed_backup_20260915 TO service_role;

ALTER TABLE public.dm_bleed_backup_20260915 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view dm bleed backup" ON public.dm_bleed_backup_20260915;
CREATE POLICY "Admins can view dm bleed backup"
ON public.dm_bleed_backup_20260915
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));