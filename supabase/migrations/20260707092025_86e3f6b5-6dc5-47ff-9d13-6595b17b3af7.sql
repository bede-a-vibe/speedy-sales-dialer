ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON public.contacts USING gin (tags);