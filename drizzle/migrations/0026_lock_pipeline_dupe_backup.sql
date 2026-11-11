ALTER TABLE public.pipeline_items_dupe_backup_20261111 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pipeline_items_dupe_backup_20261111 FROM anon, authenticated;
GRANT ALL ON public.pipeline_items_dupe_backup_20261111 TO service_role;