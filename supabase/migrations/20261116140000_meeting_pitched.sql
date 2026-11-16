-- Bede, 16 Nov 2026: track whether the offer was actually pitched on a sitting.
-- Null = not recorded; reports fall back to inferring a pitch from the outcome.
alter table public.pipeline_items add column if not exists pitched boolean;
comment on column public.pipeline_items.pitched is 'Closer''s record of whether the offer was pitched on this sitting. Null = not recorded (reports fall back to inferring from the outcome).';
