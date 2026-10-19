-- Two corrections to the GHL -> dialer booking mirror (see 20261013020000), applied to prod 19 Oct 2026.
--
-- 1. A brand-new calendar event created while the dialer twin's OWN event is still live is a
--    second meeting booked on the first call, not a move. Bright Future Electrical, 16 Oct 2026:
--    the Sat 17 Oct session was recorded as a "move" of the Fri 16 Oct one, and both actually sat.
--    The "already represented" window for creating a row also drops from 24 h to 3 h so a next-day
--    second meeting is not swallowed.
-- 2. Cancelling in GHL did not stick on a twin whose outcome was 'rescheduled': validate_pipeline_item
--    forces 'rescheduled' rows back to status open, so the cancel branch now clears that outcome.
--    Whitsunday Power, 16 Oct 2026, sat open after GHL had cancelled it.

CREATE OR REPLACE FUNCTION public.mirror_ghl_appointment_to_pipeline()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_contact contacts%rowtype;
  v_twin pipeline_items%rowtype;
  v_prior pipeline_items%rowtype;
  v_anchor timestamptz;
  v_name text;
  v_booker uuid;
  v_assignee uuid;
  v_moved boolean := (tg_op = 'UPDATE' and old.start_time is distinct from new.start_time and new.start_time is not null);
  v_live boolean := coalesce(new.appointment_status,'') not in ('cancelled','invalid');
  v_gap_seconds numeric;
  v_local text;
begin
  if new.contact_id is null or new.start_time is null then return new; end if;
  select * into v_contact from contacts where id = new.contact_id;
  if not found then return new; end if;

  -- The calendar title carries the prospect's first name ("... // Alan  and Bede").
  v_name := btrim(substring(coalesce(new.title,'') from '//\s*(.+?)\s+and\s'));
  if v_name is not null and v_name <> '' and v_name !~ '@' and length(v_name) <= 40
     and coalesce(btrim(v_contact.contact_person),'') = '' then
    update contacts set contact_person = v_name, updated_at = now() where id = new.contact_id;
  end if;

  -- Only sales meetings for cold-call contacts have a dialer twin.
  if coalesce(new.calendar_name,'') ~* 'onboard' or coalesce(new.title,'') ~* 'onboard' then return new; end if;
  if contact_channel(v_contact.lead_channel, v_contact.lead_type) <> 'Cold Call' then return new; end if;

  v_anchor := case when v_moved then old.start_time else new.start_time end;
  v_local  := to_char(new.start_time at time zone 'Australia/Melbourne', 'DD Mon HH24:MI');

  -- Twin = an UNRESOLVED dialer booking (no outcome yet, or merely moved) within 3 days of the anchor.
  -- A no-show, cancellation or showed row is already resolved for its day and is never moved:
  -- Bede's rule is that a rebooked no-show is a new slot, not a reschedule.
  select p.* into v_twin from pipeline_items p
   where p.contact_id = new.contact_id and p.pipeline_type = 'booked' and p.scheduled_for is not null
     and p.status <> 'canceled'
     and (p.appointment_outcome is null or p.appointment_outcome = 'rescheduled')
     and abs(extract(epoch from (p.scheduled_for - v_anchor))) <= 3 * 86400
   order by abs(extract(epoch from (p.scheduled_for - v_anchor))) asc, p.created_at desc
   limit 1;

  -- A brand-new event while the twin's own calendar event is still live is a SECOND meeting
  -- (booked on the first call), not a move. Bright Future, 16 Oct 2026: both sessions sat.
  if tg_op = 'INSERT' and v_twin.id is not null and exists (
       select 1 from ghl_appointments a2
        where a2.contact_id = new.contact_id and a2.id <> new.id
          and a2.start_time = v_twin.scheduled_for
          and coalesce(a2.appointment_status,'') not in ('cancelled','invalid')
          and coalesce(a2.calendar_name,'') !~* 'onboard') then
    v_twin := null;
  end if;

  if v_twin.id is null then
    -- Nothing unresolved to move. A live event here is a GHL booking with no dialer row at all
    -- (the Infuse case), a rebook after a no-show / cancellation, or a second meeting: create the row.
    if (tg_op = 'INSERT' or v_moved) and v_live and new.start_time >= now() - interval '14 days' then
      -- Already represented: a non-missed booking within 3 hours of this time (e.g. typed 10:00 vs 10:30).
      if exists (select 1 from pipeline_items p
                  where p.contact_id = new.contact_id and p.pipeline_type = 'booked'
                    and abs(extract(epoch from (p.scheduled_for - new.start_time))) < 3 * 3600
                    and p.status <> 'canceled'
                    and coalesce(p.appointment_outcome::text,'') not in ('no_show','cancelled')) then
        return new;
      end if;
      select p.* into v_prior from pipeline_items p
       where p.contact_id = new.contact_id and p.pipeline_type = 'booked' and p.scheduled_for < new.start_time
         and (coalesce(p.appointment_outcome::text,'') in ('no_show','cancelled') or p.status = 'canceled')
       order by p.scheduled_for desc limit 1;
      select cl.user_id into v_booker from call_logs cl
       where cl.contact_id = new.contact_id and cl.created_at <= coalesce(new.booked_at, new.start_time) + interval '1 hour'
       order by cl.created_at desc limit 1;
      select gu.provisioned_user_id into v_assignee from ghl_users gu where gu.ghl_user_id = new.ghl_assigned_user_id;
      v_assignee := coalesce(v_assignee, v_prior.assigned_user_id, v_booker, v_contact.owner_id);
      v_booker := coalesce(v_booker, v_prior.created_by, v_assignee);
      if v_booker is null or v_assignee is null then return new; end if;
      perform set_config('app.skip_ghl_sync', '1', true);
      insert into pipeline_items (contact_id, pipeline_type, assigned_user_id, created_by, created_at, scheduled_for, notes, status, reschedule_count, is_qualified)
      values (new.contact_id, 'booked', v_assignee, v_booker, coalesce(new.booked_at, now()), new.start_time,
              case when v_prior.id is not null
                   then 'Rebooked in GHL for ' || v_local || ' after '
                        || case when v_prior.status = 'canceled' or v_prior.appointment_outcome::text = 'cancelled' then 'cancellation' else 'no-show' end
                        || ' on ' || to_char(v_prior.scheduled_for at time zone 'Australia/Melbourne', 'DD Mon')
                   else 'Mirrored from GHL calendar: ' || coalesce(new.title, '') end,
              'open', 0, v_prior.is_qualified);
      perform set_config('app.skip_ghl_sync', '0', true);
    end if;
    return new;
  end if;

  v_gap_seconds := abs(extract(epoch from (v_twin.scheduled_for - new.start_time)));

  -- A brand-new event within an hour of the dialer booking is the same booking typed slightly
  -- differently: align the time, do not count a reschedule.
  if tg_op = 'INSERT' and v_gap_seconds > 0 and v_gap_seconds < 3600 and v_live then
    update pipeline_items set scheduled_for = new.start_time, updated_at = now() where id = v_twin.id;
    return new;
  end if;

  -- Moved in GHL (same event, new time) or rebooked as a new event near an unresolved booking:
  -- record it exactly as the app's own Reschedule action does.
  if (v_moved or tg_op = 'INSERT') and v_gap_seconds > 0 and v_live then
    update pipeline_items set
      scheduled_for       = new.start_time,
      reschedule_count    = coalesce(reschedule_count, 0) + 1,
      appointment_outcome = 'rescheduled',
      outcome_recorded_at = now(),
      status              = 'open',
      completed_at        = null,
      outcome_notes       = concat_ws(' | ', nullif(btrim(outcome_notes), ''),
                              'Moved in GHL to ' || v_local
                              || case when v_moved then ' (was ' || to_char(old.start_time at time zone 'Australia/Melbourne', 'DD Mon HH24:MI') || ')' else '' end),
      updated_at          = now()
    where id = v_twin.id;
    return new;
  end if;

  -- Cancelled in GHL: cancel the dialer booking (its lead stays live; the rebook queue picks it up).
  -- A 'rescheduled' outcome must be cleared or validate_pipeline_item forces the row back to open.
  if tg_op = 'UPDATE' and new.appointment_status = 'cancelled' and old.appointment_status is distinct from 'cancelled' then
    update pipeline_items set status = 'canceled',
      appointment_outcome = case when appointment_outcome = 'rescheduled' then null else appointment_outcome end,
      outcome_recorded_at = case when appointment_outcome = 'rescheduled' then null else outcome_recorded_at end,
      outcome_notes = concat_ws(' | ', nullif(btrim(outcome_notes), ''), 'Cancelled in GHL'), updated_at = now()
    where id = v_twin.id;
    return new;
  end if;

  -- Marked no-show in GHL: mirror it when the dialer has nothing yet.
  if tg_op = 'UPDATE' and new.appointment_status = 'noshow' and old.appointment_status is distinct from 'noshow'
     and v_twin.appointment_outcome is null then
    update pipeline_items set appointment_outcome = 'no_show',
      outcome_notes = concat_ws(' | ', nullif(btrim(outcome_notes), ''), 'Marked no-show in GHL'), updated_at = now()
    where id = v_twin.id;
  end if;
  return new;
end;
$function$;
