CREATE TYPE public.pipeline_type AS ENUM ('follow_up', 'booked');

CREATE TYPE public.pipeline_status AS ENUM ('open', 'completed', 'canceled');

CREATE TABLE public.pipeline_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  source_call_log_id UUID NULL REFERENCES public.call_logs(id) ON DELETE SET NULL,
  pipeline_type public.pipeline_type NOT NULL,
  assigned_user_id UUID NOT NULL,
  created_by UUID NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NULL,
  notes TEXT NOT NULL DEFAULT '',
  status public.pipeline_status NOT NULL DEFAULT 'open',
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_pipeline_items_type_status_scheduled
  ON public.pipeline_items (pipeline_type, status, scheduled_for);

CREATE INDEX idx_pipeline_items_assigned_status
  ON public.pipeline_items (assigned_user_id, status, scheduled_for);

CREATE INDEX idx_pipeline_items_contact
  ON public.pipeline_items (contact_id);

CREATE INDEX idx_pipeline_items_source_call_log
  ON public.pipeline_items (source_call_log_id)
  WHERE source_call_log_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_pipeline_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pipeline_type = 'follow_up' AND NEW.scheduled_for IS NULL THEN
    RAISE EXCEPTION 'scheduled_for is required for follow_up pipeline items';
  END IF;

  IF NEW.pipeline_type = 'booked' AND NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_pipeline_item_before_write
BEFORE INSERT OR UPDATE ON public.pipeline_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_pipeline_item();

CREATE TRIGGER update_pipeline_items_updated_at
BEFORE UPDATE ON public.pipeline_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated users can view pipeline items"
ON public.pipeline_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create pipeline items"
ON public.pipeline_items
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    auth.uid() = assigned_user_id
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Assigned users creators or admins can update pipeline items"
ON public.pipeline_items
FOR UPDATE
TO authenticated
USING (
  auth.uid() = assigned_user_id
  OR auth.uid() = created_by
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  auth.uid() = assigned_user_id
  OR auth.uid() = created_by
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete pipeline items"
ON public.pipeline_items
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
