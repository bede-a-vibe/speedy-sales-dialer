-- Add 'ai_summary' to the contact_note_source enum for AI-generated call summaries
ALTER TYPE public.contact_note_source ADD VALUE IF NOT EXISTS 'ai_summary';
