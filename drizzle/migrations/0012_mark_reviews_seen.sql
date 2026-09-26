CREATE OR REPLACE FUNCTION public.mark_my_reviews_seen() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (UPDATE public.call_reviews SET seen_at = now() WHERE rep_user_id = auth.uid() AND seen_at IS NULL RETURNING 1)
  SELECT count(*)::int FROM u;
$$;
REVOKE ALL ON FUNCTION public.mark_my_reviews_seen() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_my_reviews_seen() TO authenticated;