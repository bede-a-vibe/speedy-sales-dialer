-- The closer on a booking is whoever owns the matching GHL calendar event.
--
-- Setters book the meeting in GHL, then log it in the dialer, where the closer
-- picker defaulted to the setter. Since 21 Oct, 53 of 59 dialer bookings with a
-- GHL event named the setter as closer while the event sat on Bede's calendar.
-- These triggers make the calendar the authority in both orders of events.

-- Owner of the nearest GHL event for this lead within 3 hours, mapped to a dialer
-- user. A live event wins over a cancelled one (a rebook sits near its old slot),
-- but a cancelled meeting still had a closer. Null when there is no event, or its
-- owner has no dialer login.
create or replace function public.ghl_event_closer(_contact_id uuid, _scheduled_for timestamptz)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select gu.provisioned_user_id
  from (
    select a.ghl_assigned_user_id
    from ghl_appointments a
    where a.contact_id = _contact_id
      and a.start_time is not null
      and abs(extract(epoch from (a.start_time - _scheduled_for))) < 3 * 3600
    order by (coalesce(a.appointment_status, '') in ('cancelled', 'invalid')),
             abs(extract(epoch from (a.start_time - _scheduled_for))), a.updated_at desc
    limit 1
  ) nearest
  join ghl_users gu on gu.ghl_user_id = nearest.ghl_assigned_user_id
  join profiles p on p.user_id = gu.provisioned_user_id
$$;

-- Dialer booking logged after the GHL event exists.
create or replace function public.set_booking_closer_from_ghl()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_closer uuid;
begin
  if new.pipeline_type <> 'booked' or new.contact_id is null or new.scheduled_for is null then
    return new;
  end if;
  v_closer := ghl_event_closer(new.contact_id, new.scheduled_for);
  if v_closer is not null then
    new.assigned_user_id := v_closer;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_booking_closer_from_ghl on public.pipeline_items;
create trigger trg_set_booking_closer_from_ghl
  before insert on public.pipeline_items
  for each row execute function public.set_booking_closer_from_ghl();

-- GHL event created or reassigned after the dialer booking exists. Runs after
-- the mirror trigger (name order), so a reschedule has already moved the twin.
create or replace function public.sync_closer_from_ghl_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_closer uuid;
begin
  if new.contact_id is null or new.start_time is null
     or coalesce(new.appointment_status, '') in ('cancelled', 'invalid') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.ghl_assigned_user_id is not distinct from new.ghl_assigned_user_id
     and old.start_time is not distinct from new.start_time
     and old.contact_id is not distinct from new.contact_id
     and old.appointment_status is not distinct from new.appointment_status then
    return new;
  end if;
  select gu.provisioned_user_id into v_closer
    from ghl_users gu join profiles p on p.user_id = gu.provisioned_user_id
   where gu.ghl_user_id = new.ghl_assigned_user_id;
  if v_closer is null then
    return new;
  end if;
  update pipeline_items p
     set assigned_user_id = v_closer
   where p.id = (
       select p2.id from pipeline_items p2
        where p2.contact_id = new.contact_id
          and p2.pipeline_type = 'booked'
          and p2.scheduled_for is not null
          and abs(extract(epoch from (p2.scheduled_for - new.start_time))) < 3 * 3600
        order by abs(extract(epoch from (p2.scheduled_for - new.start_time))), p2.created_at desc
        limit 1)
     and p.assigned_user_id is distinct from v_closer;
  return new;
end;
$$;

drop trigger if exists trg_ghl_appointments_set_closer on public.ghl_appointments;
create trigger trg_ghl_appointments_set_closer
  after insert or update on public.ghl_appointments
  for each row execute function public.sync_closer_from_ghl_event();
