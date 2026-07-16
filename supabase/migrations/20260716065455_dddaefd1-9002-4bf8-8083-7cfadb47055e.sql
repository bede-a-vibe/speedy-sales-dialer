
-- Expression indexes for fast last-9-digit lookup on phone/dm_phone
CREATE INDEX IF NOT EXISTS idx_contacts_dm_phone_digits9
  ON public.contacts (right(regexp_replace(coalesce(dm_phone,''), '[^0-9]', '', 'g'), 9))
  WHERE dm_phone IS NOT NULL AND dm_phone <> '';

CREATE INDEX IF NOT EXISTS idx_contacts_phone_digits9
  ON public.contacts (right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 9))
  WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS idx_contacts_dm_email_lower
  ON public.contacts (lower(dm_email))
  WHERE dm_email IS NOT NULL AND dm_email <> '';

-- Count contacts (excluding _exclude_id) whose phone or dm_phone shares the last-9 digits of _digits
CREATE OR REPLACE FUNCTION public.count_contacts_with_phone_digits(_digits text, _exclude_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT right(regexp_replace(coalesce(_digits,''), '[^0-9]', '', 'g'), 9) AS sfx
  )
  SELECT COALESCE(count(*)::int, 0)
  FROM public.contacts c, q
  WHERE q.sfx <> ''
    AND length(q.sfx) = 9
    AND (c.id IS DISTINCT FROM _exclude_id)
    AND c.is_archived IS NOT TRUE
    AND (
      right(regexp_replace(coalesce(c.phone,''), '[^0-9]', '', 'g'), 9) = q.sfx
      OR right(regexp_replace(coalesce(c.dm_phone,''), '[^0-9]', '', 'g'), 9) = q.sfx
    );
$$;

-- Count contacts (excluding _exclude_id) sharing this dm_email (case-insensitive)
CREATE OR REPLACE FUNCTION public.count_contacts_with_dm_email(_email text, _exclude_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*)::int, 0)
  FROM public.contacts c
  WHERE _email IS NOT NULL
    AND _email <> ''
    AND (c.id IS DISTINCT FROM _exclude_id)
    AND c.is_archived IS NOT TRUE
    AND lower(c.dm_email) = lower(_email);
$$;

GRANT EXECUTE ON FUNCTION public.count_contacts_with_phone_digits(text, uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.count_contacts_with_dm_email(text, uuid) TO service_role, authenticated;
