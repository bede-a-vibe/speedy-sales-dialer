-- Correct the Industry in GHL for leads that came in under the wrong trade (Bede, 24 Nov 2026).
alter table public.ghl_contact_push_queue drop constraint if exists ghl_contact_push_queue_kind_check;
alter table public.ghl_contact_push_queue add constraint ghl_contact_push_queue_kind_check
  check (kind in ('create', 'phone', 'fields', 'industry'));
