CREATE INDEX IF NOT EXISTS idx_contacts_phone_suffix9
  ON public.contacts ((right(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'), 9)));

CREATE INDEX IF NOT EXISTS idx_contacts_dm_phone_suffix9
  ON public.contacts ((right(regexp_replace(coalesce(dm_phone,''), '[^0-9]', '', 'g'), 9)));