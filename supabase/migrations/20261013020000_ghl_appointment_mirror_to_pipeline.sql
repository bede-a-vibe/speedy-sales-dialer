-- GHL calendar changes were not reaching the dialer's appointments pipeline: a prospect
-- rescheduled or rebooked in GHL stayed on the old slot (or missing) in the dialer, so the
-- board, the Completed tab and the rebook queue were wrong. This mirrors GHL -> dialer.
--
-- 1. sync_booking_to_ghl learns a skip flag so a dialer row created FROM a GHL event is not
--    echoed back to GHL as a new opportunity + note.
-- 2. mirror_ghl_appointment_to_pipeline (AFTER INSERT OR UPDATE on ghl_appointments):
--    - backfills contacts.contact_person from the calendar title ("... // Alan  and Bede")
--    - only cold-call, non-onboarding sales meetings are mirrored
--    - twin = the UNRESOLVED dialer booking (no outcome, or merely moved) within 3 days
--    - moved in GHL / rebooked near an unresolved booking -> recorded like the app's own
--      Reschedule action (outcome rescheduled, status open, reschedule_count + 1)
--    - no unresolved twin -> create the dialer row (new GHL booking, or a rebook after a
--      no-show / cancellation; a no-show is never "moved": Bede's rule is that a rebooked
--      no-show is a new slot)
--    - cancelled / noshow in GHL -> mirrored onto the twin when the dialer has nothing yet
-- Applied to prod 13 Oct 2026.

CREATE OR REPLACE FUNCTION public.sync_booking_to_ghl()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ghl_contact_id text;
  _contact_name text;
  _contact_phone text;
  _contact_business text;
  _supabase_url text;
  _service_role_key text;
  _request_body jsonb;
BEGIN
  IF NEW.pipeline_type <> 'booked' THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- Rows mirrored FROM a GHL calendar event already exist in GHL. Echoing them back
  -- would create a duplicate opportunity and note, so the mirror trigger sets this flag.
  IF current_setting('app.skip_ghl_sync', true) = '1' THEN
    RAISE LOG '[sync_booking_to_ghl] skip flag set (mirrored from GHL), not syncing pipeline_item=%', NEW.id;
    RETURN NEW;
  END IF;

  SELECT ghl_contact_id,
         COALESCE(contact_person, business_name, 'Contact'),
         phone,
         business_name
  INTO _ghl_contact_id, _contact_name, _contact_phone, _contact_business
  FROM public.contacts
  WHERE id = NEW.contact_id;

  _supabase_url := current_setting('app.settings.supabase_url', true);
  _service_role_key := current_setting('app.settings.service_role_key', true);

  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := 'https://xhcvwhcpaeetmmzkuwyw.supabase.co';
  END IF;

  IF _service_role_key IS NULL OR _service_role_key = '' THEN
    RAISE LOG '[sync_booking_to_ghl] service_role_key not available, skipping GHL sync';
    RETURN NEW;
  END IF;

  IF _ghl_contact_id IS NULL OR _ghl_contact_id = '' THEN
    IF _contact_phone IS NOT NULL AND _contact_phone <> '' THEN
      RAISE LOG '[sync_booking_to_ghl] No ghl_contact_id for contact_id=%, attempting auto-link via upsert', NEW.contact_id;

      PERFORM extensions.http_post(
        url := _supabase_url || '/functions/v1/ghl',
        body := jsonb_build_object(
          'action', 'upsert_contact',
          'supabaseContactId', NEW.contact_id,
          'payload', jsonb_build_object(
            'phone', _contact_phone,
            'companyName', COALESCE(_contact_business, ''),
            'name', _contact_name
          )
        )::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || _service_role_key
        )
      );

      RAISE LOG '[sync_booking_to_ghl] Queued GHL upsert for contact_id=% phone=%', NEW.contact_id, _contact_phone;
    ELSE
      RAISE LOG '[sync_booking_to_ghl] No ghl_contact_id and no phone for contact_id=%, skipping', NEW.contact_id;
    END IF;

    RETURN NEW;
  END IF;

  _request_body := jsonb_build_object(
    'action', 'create_opportunity',
    'payload', jsonb_build_object(
      'pipelineId', 'QuBn7UX5zebPTd4fqW9x',
      'pipelineStageId', 'd7283fa5-7352-4446-80c6-1e567a7c8295',
      'contactId', _ghl_contact_id,
      'name', _contact_name || ' – Booked ' || to_char(NEW.scheduled_for AT TIME ZONE 'Australia/Melbourne', 'DD/MM/YYYY'),
      'status', 'open'
    )
  );

  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/ghl',
    body := _request_body::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    )
  );

  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/ghl',
    body := jsonb_build_object(
      'action', 'add_note',
      'contactId', _ghl_contact_id,
      'payload', jsonb_build_object(
        'body', 'Appointment Booked: ' || to_char(NEW.scheduled_for AT TIME ZONE 'Australia/Melbourne', 'DD/MM/YYYY HH12:MI AM') || E'\n' ||
                'Notes: ' || COALESCE(NEW.notes, 'No notes') || E'\n' ||
                'Logged via Speedy Sales Dialer (server-side sync)'
      )
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role_key
    )
  );

  RAISE LOG '[sync_booking_to_ghl] Queued GHL opportunity + note for contact_id=% ghl_contact_id=%', NEW.contact_id, _ghl_contact_id;

  RETURN NEW;
END;
$function$;

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

  if v_twin.id is null then
    -- Nothing unresolved to move. A live event here is either a GHL booking with no dialer row
    -- at all (the Infuse case) or a rebook after a no-show / cancellation: create the dialer row.
    if (tg_op = 'INSERT' or v_moved) and v_live and new.start_time >= now() - interval '14 days' then
      -- Already represented: any non-missed booking within a day of this time (e.g. it showed).
      if exists (select 1 from pipeline_items p
                  where p.contact_id = new.contact_id and p.pipeline_type = 'booked'
                    and abs(extract(epoch from (p.scheduled_for - new.start_time))) < 86400
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
  if tg_op = 'UPDATE' and new.appointment_status = 'cancelled' and old.appointment_status is distinct from 'cancelled' then
    update pipeline_items set status = 'canceled',
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

DROP TRIGGER IF EXISTS trg_ghl_appointments_mirror_pipeline ON public.ghl_appointments;
CREATE TRIGGER trg_ghl_appointments_mirror_pipeline
  AFTER INSERT OR UPDATE ON public.ghl_appointments
  FOR EACH ROW EXECUTE FUNCTION public.mirror_ghl_appointment_to_pipeline();
