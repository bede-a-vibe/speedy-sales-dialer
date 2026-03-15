
CREATE TABLE public.dialpad_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  dialpad_user_id text NOT NULL,
  dialpad_phone_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.dialpad_settings ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage dialpad_settings"
  ON public.dialpad_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own settings
CREATE POLICY "Users can view own dialpad_settings"
  ON public.dialpad_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_dialpad_settings_updated_at
  BEFORE UPDATE ON public.dialpad_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
