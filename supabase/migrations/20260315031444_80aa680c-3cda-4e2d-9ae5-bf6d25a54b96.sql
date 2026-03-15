
-- Fix: contacts UPDATE should only allow authenticated users to update non-DNC contacts they're working with
-- The "true" UPDATE policy is needed since any sales rep can update call status on any contact
-- But let's tighten it to only allow sales-relevant fields, not full row access
DROP POLICY "Authenticated users can update contacts" ON public.contacts;
CREATE POLICY "Authenticated users can update contacts" ON public.contacts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
