CREATE POLICY "Users can view own dialer lead locks"
ON public.dialer_lead_locks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own dialer lead locks"
ON public.dialer_lead_locks
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own dialer lead locks"
ON public.dialer_lead_locks
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own dialer lead locks"
ON public.dialer_lead_locks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);