-- GHL-first identity foundation
-- 1) Canonical phone cache for deterministic matching
-- 2) Durable retry queue for AI->GHL pushes when identity linkage is missing

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_e164 text;

CREATE OR REPLACE FUNCTION public.normalize_phone_e164(raw_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits text;
BEGIN
  IF raw_phone IS NULL OR btrim(raw_phone) = '' THEN
    RETURN NULL;
  END IF;

  digits := regexp_replace(raw_phone, '\\D', '', 'g');
  IF digits = '' THEN
    RETURN NULL;
  END IF;

  -- AU defaults: 04xxxxxxxx => +614xxxxxxxx
  IF left(digits, 2) = '04' AND length(digits) = 10 THEN
    RETURN '+61' || substring(digits from 2);
  END IF;

  -- AU without leading zero: 4xxxxxxxx => +614xxxxxxxx
  IF left(digits, 1) = '4' AND length(digits) = 9 THEN
    RETURN '+61' || digits;
  END IF;

  -- Already includes AU CC as 61xxxxxxxxx
  IF left(digits, 2) = '61' AND length(digits) = 11 THEN
    RETURN '+' || digits;
  END IF;

  -- Generic international (E.164 max 15 digits)
  IF length(digits) BETWEEN 8 AND 15 THEN
    RETURN '+' || digits;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_contact_phone_e164()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.phone_e164 := public.normalize_phone_e164(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_set_phone_e164 ON public.contacts;
CREATE TRIGGER trg_contacts_set_phone_e164
BEFORE INSERT OR UPDATE OF phone ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.set_contact_phone_e164();

UPDATE public.contacts
SET phone_e164 = public.normalize_phone_e164(phone)
WHERE phone IS NOT NULL
  AND (phone_e164 IS NULL OR phone_e164 = '');

CREATE INDEX IF NOT EXISTS idx_contacts_phone_e164 ON public.contacts(phone_e164);

CREATE TABLE IF NOT EXISTS public.pending_ghl_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  dialpad_call_id text,
  user_id uuid,
  ai_note text,
  ai_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'dialpad_ai_summary',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'synced', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_ghl_pushes_contact_call_source
  ON public.pending_ghl_pushes(contact_id, dialpad_call_id, source);

CREATE INDEX IF NOT EXISTS idx_pending_ghl_pushes_status_retry
  ON public.pending_ghl_pushes(status, next_retry_at);

DROP TRIGGER IF EXISTS update_pending_ghl_pushes_updated_at ON public.pending_ghl_pushes;
CREATE TRIGGER update_pending_ghl_pushes_updated_at
BEFORE UPDATE ON public.pending_ghl_pushes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
