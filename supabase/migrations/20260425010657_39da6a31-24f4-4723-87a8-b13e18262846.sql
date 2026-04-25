-- 1. Extend app_role enum with 'coach'
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coach';
