CREATE OR REPLACE FUNCTION public.number_audit()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin_or_coach(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  WITH c AS (
    SELECT id, business_name, phone, dm_name, dm_phone, dm_phone_verified, phone_number_quality, ghl_contact_id,
      right(regexp_replace(coalesce(phone,''),'\D','','g'),9) pk,
      right(regexp_replace(coalesce(dm_phone,''),'\D','','g'),9) dk,
      lower(regexp_replace(business_name,'[^a-zA-Z]','','g')) nk
    FROM contacts
  ),
  dm_clash AS (
    SELECT a.id, a.business_name, a.dm_name, a.dm_phone, a.dm_phone_verified,
      jsonb_agg(DISTINCT jsonb_build_object('id', b.id, 'business_name', b.business_name)) others
    FROM c a JOIN c b ON b.id <> a.id AND b.nk <> a.nk AND (b.dk = a.dk OR b.pk = a.dk)
    WHERE a.dk <> '' AND length(a.dk) = 9
    GROUP BY 1,2,3,4,5
  ),
  main_clash AS (
    SELECT a.pk, jsonb_agg(jsonb_build_object('id', a.id, 'business_name', a.business_name, 'phone', a.phone, 'quality', a.phone_number_quality, 'ghl_contact_id', a.ghl_contact_id) ORDER BY a.business_name) contacts
    FROM c a WHERE length(a.pk) = 9 AND coalesce(a.phone_number_quality::text,'') NOT IN ('dead','confirmed')
    GROUP BY a.pk HAVING count(*) > 1 AND count(DISTINCT a.nk) > 1
  ),
  flagged AS (
    SELECT DISTINCT ON (c.id) c.id, c.business_name, c.phone, c.phone_number_quality quality, c.ghl_contact_id,
      l.created_at flagged_at
    FROM c LEFT JOIN call_logs l ON l.contact_id = c.id AND l.outcome = 'wrong_number'
    WHERE (l.id IS NOT NULL OR c.phone_number_quality IN ('suspect','dead'))
    ORDER BY c.id, l.created_at DESC NULLS LAST
  )
  SELECT jsonb_build_object(
    'dm_total', (SELECT count(*) FROM c WHERE dk <> ''),
    'dm_confirmed', (SELECT count(*) FROM c WHERE dk <> '' AND dm_phone_verified),
    'dm_clashes', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.business_name) FROM dm_clash d), '[]'::jsonb),
    'main_clashes', coalesce((SELECT jsonb_agg(m.contacts) FROM main_clash m), '[]'::jsonb),
    'flagged', coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.flagged_at DESC NULLS LAST) FROM flagged f), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.number_audit() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.number_audit() TO authenticated;