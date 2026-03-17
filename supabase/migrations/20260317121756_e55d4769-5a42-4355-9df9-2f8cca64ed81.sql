ALTER TABLE public.call_logs
ADD COLUMN IF NOT EXISTS dialpad_talk_time_seconds integer,
ADD COLUMN IF NOT EXISTS dialpad_total_duration_seconds integer;