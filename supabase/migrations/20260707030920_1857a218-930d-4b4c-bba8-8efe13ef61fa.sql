CREATE OR REPLACE FUNCTION public.get_dialer_filter_options()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'industries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('value', value, 'count', c) ORDER BY c DESC)
      FROM (
        SELECT industry AS value, COUNT(*)::int AS c
        FROM public.contacts
        WHERE status = 'uncalled'
          AND is_dnc IS NOT TRUE
          AND disqualified IS NOT TRUE
          AND industry IS NOT NULL
          AND industry <> ''
        GROUP BY industry
      ) t
    ), '[]'::jsonb),
    'channels', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('value', value, 'count', c) ORDER BY c DESC)
      FROM (
        SELECT lead_channel AS value, COUNT(*)::int AS c
        FROM public.contacts
        WHERE status = 'uncalled'
          AND is_dnc IS NOT TRUE
          AND disqualified IS NOT TRUE
          AND lead_channel IS NOT NULL
          AND lead_channel <> ''
        GROUP BY lead_channel
      ) t
    ), '[]'::jsonb),
    'states', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('value', value, 'count', c) ORDER BY c DESC)
      FROM (
        SELECT state AS value, COUNT(*)::int AS c
        FROM public.contacts
        WHERE status = 'uncalled'
          AND is_dnc IS NOT TRUE
          AND disqualified IS NOT TRUE
          AND state IS NOT NULL
          AND state <> ''
        GROUP BY state
      ) t
    ), '[]'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dialer_filter_options() TO authenticated;