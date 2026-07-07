
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS deep_crawl_attempted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS contacts_deep_crawl_pending_idx
  ON public.contacts (deep_crawl_attempted)
  WHERE deep_crawl_attempted = false AND dm_name IS NULL AND website IS NOT NULL;
