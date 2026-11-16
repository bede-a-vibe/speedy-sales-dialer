-- How a booked meeting runs, 16 Nov 2026 (Bede). Some sessions are in person
-- at Wilson St, some only end up as a phone call. Null = not recorded, read as
-- Google Meet. Applied live via Lovable query_database.
alter table public.pipeline_items add column if not exists meeting_format text
  check (meeting_format in ('video','in_person','phone'));
comment on column public.pipeline_items.meeting_format is
  'How the meeting runs: video (Google Meet), in_person, or phone. Null = not recorded (treated as video).';

-- Backfill: bookings on the GHL in-person calendar or noted as in person.
update public.pipeline_items p set meeting_format = 'in_person'
 where p.pipeline_type = 'booked' and p.meeting_format is null and (
   exists (select 1 from public.ghl_appointments a
            where a.contact_id = p.contact_id
              and abs(extract(epoch from (a.start_time - p.scheduled_for))) < 3 * 3600
              and (a.calendar_name ilike '%in person%' or a.meeting_link ilike '%wilson st%'))
   or p.notes ilike '%in person%' or p.outcome_notes ilike '%in person at%');
-- Applied by hand on 16 Nov: Lit Electrical 11 Nov = video (its note mentions a
-- future in-person session); SRR Electrical 13 Nov = in_person.

-- "Phone call only" reschedule reasons (rs_phone_no_laptop, rs_phone_not_quiet,
-- rs_phone_driving, rs_phone_other) need no schema change: outcome_reason is
-- text and meeting_reschedules.reason carries them onto the missed slot.
