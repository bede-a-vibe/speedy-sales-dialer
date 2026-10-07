ALTER TABLE public.fathom_connections ADD COLUMN IF NOT EXISTS webhook_secret text;
REVOKE SELECT ON public.fathom_connections FROM authenticated, anon;
GRANT SELECT (user_id, status, last_synced_at, last_error, created_at, updated_at) ON public.fathom_connections TO authenticated;
GRANT ALL ON public.fathom_connections TO service_role;