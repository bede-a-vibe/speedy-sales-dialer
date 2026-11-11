-- Contact Intelligence: combine the dialer's own fields with GHL's, 11 Nov 2026.
-- PR #183 laid the panel out from GHL's folders only, which dropped the dialer
-- fields GHL no longer had. These GHL contact fields were created through the
-- GHL API (not here) so both sides carry the same set:
--   03 Dialer Activity: Call Disposition
--   05 Appointments:    Meeting Booked Date, Setter Name, Assigned Closer,
--                       Meeting Source, Meeting Set By (Role)
--   Additional Info:    SEO Visibility
--   01 Lead Routing:    Lifecycle Reason, Lead Type
alter table public.contacts add column if not exists seo_visibility text;

insert into public.ghl_field_map (ghl_field_key, ghl_folder, ghl_label, ghl_data_type, dialer_table, dialer_column, status, notes)
values
  ('contact.call_disposition', '03 Dialer Activity', 'Call Disposition', 'TEXT', 'contacts', 'last_outcome', 'derived', 'Last call outcome. Read-only in the dialer; set by logging a call.'),
  ('contact.meeting_booked_date', '05 Appointments', 'Meeting Booked Date', 'DATE', 'contacts', 'meeting_booked_date', 'mapped', 'Read-only in the dialer; set by booking. Clearing it would put the lead back in the queue.'),
  ('contact.setter_name', '05 Appointments', 'Setter Name', 'TEXT', 'pipeline_items', null, 'derived', 'Booking created_by on the latest booked pipeline_item.'),
  ('contact.assigned_closer', '05 Appointments', 'Assigned Closer', 'TEXT', 'pipeline_items', null, 'derived', 'Booking assigned_user_id on the latest booked pipeline_item (set from the GHL event owner).'),
  ('contact.meeting_source', '05 Appointments', 'Meeting Source', 'TEXT', 'pipeline_items', null, 'derived', 'Dialer call when the latest booking came from a logged call, else GHL calendar.'),
  ('contact.meeting_set_by_role', '05 Appointments', 'Meeting Set By (Role)', 'TEXT', 'pipeline_items', null, 'derived', 'Setter when someone else booked it for the closer, Closer when self-booked.'),
  ('contact.seo_visibility', 'Additional Info', 'SEO Visibility', 'TEXT', 'contacts', 'seo_visibility', 'mapped', null),
  ('contact.lifecycle_reason', '01 Lead Routing', 'Lifecycle Reason', 'TEXT', 'contacts', 'lifecycle_reason', 'mapped', 'Read-only in the dialer; set by dispositions and cleanups.'),
  ('contact.lead_type', '01 Lead Routing', 'Lead Type', 'TEXT', 'contacts', 'lead_type', 'mapped', 'Read-only in the dialer: cold, warm, inbound, outbound.')
on conflict (ghl_field_key) do update set
  ghl_folder = excluded.ghl_folder,
  ghl_label = excluded.ghl_label,
  ghl_data_type = excluded.ghl_data_type,
  dialer_table = excluded.dialer_table,
  dialer_column = excluded.dialer_column,
  status = excluded.status,
  notes = excluded.notes;

update public.ghl_field_map set notes = 'Read-only in the dialer, which owns the stage (new, attempting, connected, booked, won, lost). Map values at sync.'
where ghl_field_key = 'contact.lifecycle_stage';
update public.ghl_field_map set notes = 'Read-only in the dialer. Dialer channel names map through mapLeadSourceChannel in supabase/functions/ghl.'
where ghl_field_key = 'contact.lead_source_channel';
