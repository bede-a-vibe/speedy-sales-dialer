
-- caller_id_pool table
CREATE TABLE public.caller_id_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  label text,
  position int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX caller_id_pool_user_active_pos_idx
  ON public.caller_id_pool (user_id, is_active, position);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.caller_id_pool TO authenticated;
GRANT ALL ON public.caller_id_pool TO service_role;

ALTER TABLE public.caller_id_pool ENABLE ROW LEVEL SECURITY;

-- Reps can see their own active numbers
CREATE POLICY "Reps can view own active caller ids"
  ON public.caller_id_pool FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_id AND is_active = true)
    OR public.has_role(auth.uid(), 'admin')
  );

-- Admins manage all
CREATE POLICY "Admins insert caller ids"
  ON public.caller_id_pool FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update caller ids"
  ON public.caller_id_pool FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete caller ids"
  ON public.caller_id_pool FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_caller_id_pool_updated_at
  BEFORE UPDATE ON public.caller_id_pool
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-rep cumulative rotation counter
ALTER TABLE public.dialpad_settings
  ADD COLUMN IF NOT EXISTS rotation_dial_count int NOT NULL DEFAULT 0;

-- Atomic increment RPC (increments and returns new value)
CREATE OR REPLACE FUNCTION public.increment_rotation_dial_count(_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count int;
BEGIN
  UPDATE public.dialpad_settings
     SET rotation_dial_count = COALESCE(rotation_dial_count, 0) + 1,
         updated_at = now()
   WHERE user_id = _user_id
     AND is_active = true
  RETURNING rotation_dial_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_rotation_dial_count(uuid) TO authenticated;
