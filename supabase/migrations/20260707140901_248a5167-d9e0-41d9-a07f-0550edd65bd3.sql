ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS abn text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS abr_attempted boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_contacts_abr_attempted ON public.contacts (abr_attempted) WHERE abr_attempted = false;