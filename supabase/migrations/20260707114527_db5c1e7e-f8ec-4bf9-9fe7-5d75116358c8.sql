-- Phase A: Transcript → prospect record pipeline
-- 1) Contact capture fields for AI extraction
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS buying_timeline text,
  ADD COLUMN IF NOT EXISTS key_quote text,
  ADD COLUMN IF NOT EXISTS agreed_next_steps text;

-- 2) Raw transcript storage on dialpad_calls
ALTER TABLE public.dialpad_calls
  ADD COLUMN IF NOT EXISTS transcript text;

-- 3) New contact note source for transcript-derived AI summaries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'contact_note_source'
      AND e.enumlabel = 'call_transcript'
  ) THEN
    ALTER TYPE public.contact_note_source ADD VALUE 'call_transcript';
  END IF;
END $$;