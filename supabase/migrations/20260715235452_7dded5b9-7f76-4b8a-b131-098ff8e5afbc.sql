
CREATE OR REPLACE FUNCTION public.find_contacts_by_phone_digits(_digits text)
RETURNS TABLE(id uuid, last_called_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT right(regexp_replace(coalesce(_digits,''), '[^0-9]', '', 'g'), 9) AS sfx
  )
  SELECT c.id, c.last_called_at
  FROM public.contacts c, q
  WHERE q.sfx <> ''
    AND length(q.sfx) = 9
    AND (
      right(regexp_replace(coalesce(c.phone,''), '[^0-9]', '', 'g'), 9) = q.sfx
      OR right(regexp_replace(coalesce(c.dm_phone,''), '[^0-9]', '', 'g'), 9) = q.sfx
    )
  ORDER BY c.last_called_at DESC NULLS LAST
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.find_contacts_by_phone_digits(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_contacts_by_phone_digits(text) TO service_role;
