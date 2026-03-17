DROP POLICY IF EXISTS "Authenticated users can create pipeline items" ON public.pipeline_items;

CREATE POLICY "Authenticated users can create pipeline items"
ON public.pipeline_items
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = assigned_user_id
  )
);
