
-- Drop the old 3-param overload of get_dialer_queue_count that conflicts with the new 4-param version
DROP FUNCTION IF EXISTS public.get_dialer_queue_count(uuid, text, text);

-- Drop the old 5-param overload of claim_dialer_leads that conflicts with the new 6-param version
DROP FUNCTION IF EXISTS public.claim_dialer_leads(uuid, text, text, integer, integer);
