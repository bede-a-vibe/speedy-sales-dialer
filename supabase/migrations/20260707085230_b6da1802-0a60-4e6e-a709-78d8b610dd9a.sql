-- Pin search_path on the helper and revoke public execution on the
-- new SECURITY DEFINER helpers so the linter is happy and the app
-- cannot call them directly.
ALTER FUNCTION public.lifecycle_rank(text) SET search_path = public;

REVOKE ALL ON FUNCTION public.advance_contact_lifecycle(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_call_log_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_contact_status_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_pipeline_lifecycle() FROM PUBLIC, anon, authenticated;
