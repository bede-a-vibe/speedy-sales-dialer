
-- Add GHL user ID column to profiles
ALTER TABLE public.profiles ADD COLUMN ghl_user_id text;

-- Seed known mappings
UPDATE public.profiles SET ghl_user_id = 'NFi3vzrTHSOW3wpzu2yU' WHERE user_id = '35a0fecd-d996-414e-9402-ec3d1e08bfd9';
UPDATE public.profiles SET ghl_user_id = 'YmANuBMRtWVjCVDZ2mRV' WHERE user_id = '4c9febe8-520e-462e-be1d-c680cbf86898';
UPDATE public.profiles SET ghl_user_id = 'ikvOR4Mk6ntXL1DPaBd1' WHERE user_id = 'c1ec19b7-1b3e-4728-841b-74af631a124c';
