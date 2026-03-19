
ALTER TABLE public.dialpad_calls ADD COLUMN IF NOT EXISTS call_state text DEFAULT null;

ALTER PUBLICATION supabase_realtime ADD TABLE public.dialpad_calls;
