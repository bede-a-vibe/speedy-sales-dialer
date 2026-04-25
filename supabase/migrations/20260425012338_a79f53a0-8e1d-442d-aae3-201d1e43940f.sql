-- Admin-only function to fetch users with their last sign-in timestamp.
-- Reads from auth.users (not exposed to clients) via SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.admin_list_users_with_last_login()
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can list users with last login';
  END IF;

  RETURN QUERY
  SELECT
    p.user_id,
    p.display_name,
    COALESCE(p.email, u.email) AS email,
    u.last_sign_in_at,
    u.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.user_id
  ORDER BY p.display_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users_with_last_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users_with_last_login() TO authenticated;