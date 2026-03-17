-- Add transcript/sync fields to call logs
ALTER TABLE public.call_logs
ADD COLUMN IF NOT EXISTS dialpad_call_id text,
ADD COLUMN IF NOT EXISTS dialpad_summary text,
ADD COLUMN IF NOT EXISTS dialpad_transcript text,
ADD COLUMN IF NOT EXISTS transcript_synced_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_call_logs_dialpad_call_id ON public.call_logs(dialpad_call_id);

-- Track outbound Dialpad calls before a CRM call log is submitted
CREATE TABLE IF NOT EXISTS public.dialpad_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dialpad_call_id text NOT NULL UNIQUE,
  contact_id uuid NOT NULL,
  user_id uuid NOT NULL,
  call_log_id uuid,
  sync_status text NOT NULL DEFAULT 'pending',
  sync_error text,
  transcript_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dialpad_calls_sync_status_check CHECK (sync_status IN ('pending', 'processing', 'synced', 'failed')),
  CONSTRAINT dialpad_calls_call_log_id_key UNIQUE (call_log_id)
);

CREATE INDEX IF NOT EXISTS idx_dialpad_calls_contact_id ON public.dialpad_calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_dialpad_calls_user_id ON public.dialpad_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_dialpad_calls_sync_status ON public.dialpad_calls(sync_status);

ALTER TABLE public.dialpad_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert own dialpad calls"
ON public.dialpad_calls
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can view dialpad calls"
ON public.dialpad_calls
FOR SELECT
TO authenticated
USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can update own dialpad calls"
ON public.dialpad_calls
FOR UPDATE
TO authenticated
USING ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK ((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete dialpad calls"
ON public.dialpad_calls
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_dialpad_calls_updated_at
BEFORE UPDATE ON public.dialpad_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Append-only contact notes timeline
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'contact_note_source' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.contact_note_source AS ENUM ('manual', 'dialpad_summary', 'dialpad_transcript');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL,
  created_by uuid NOT NULL,
  source public.contact_note_source NOT NULL,
  content text NOT NULL,
  dialpad_call_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact_id_created_at ON public.contact_notes(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_notes_dialpad_call_id ON public.contact_notes(dialpad_call_id);

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contact notes"
ON public.contact_notes
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert own contact notes"
ON public.contact_notes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators or admins can update contact notes"
ON public.contact_notes
FOR UPDATE
TO authenticated
USING ((auth.uid() = created_by) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK ((auth.uid() = created_by) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creators or admins can delete contact notes"
ON public.contact_notes
FOR DELETE
TO authenticated
USING ((auth.uid() = created_by) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_contact_notes_updated_at
BEFORE UPDATE ON public.contact_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Foreign keys added after table creation to keep migration idempotent-friendly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'dialpad_calls' AND constraint_name = 'dialpad_calls_contact_id_fkey'
  ) THEN
    ALTER TABLE public.dialpad_calls
      ADD CONSTRAINT dialpad_calls_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'dialpad_calls' AND constraint_name = 'dialpad_calls_call_log_id_fkey'
  ) THEN
    ALTER TABLE public.dialpad_calls
      ADD CONSTRAINT dialpad_calls_call_log_id_fkey
      FOREIGN KEY (call_log_id) REFERENCES public.call_logs(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'contact_notes' AND constraint_name = 'contact_notes_contact_id_fkey'
  ) THEN
    ALTER TABLE public.contact_notes
      ADD CONSTRAINT contact_notes_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;
  END IF;
END $$;