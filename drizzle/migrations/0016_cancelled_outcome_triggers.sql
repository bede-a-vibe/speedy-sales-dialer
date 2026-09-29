CREATE OR REPLACE FUNCTION public.sync_pipeline_outcome_to_contact()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _new_status text;
  _follow_up_date timestamptz;
  _is_dnc boolean;
BEGIN
  IF NEW.pipeline_type <> 'booked' THEN RETURN NEW; END IF;
  IF NEW.appointment_outcome IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.appointment_outcome IS NOT DISTINCT FROM NEW.appointment_outcome THEN
    RETURN NEW;
  END IF;
  SELECT is_dnc INTO _is_dnc FROM public.contacts WHERE id = NEW.contact_id;
  IF _is_dnc IS TRUE THEN RETURN NEW; END IF;
  CASE NEW.appointment_outcome::text
    WHEN 'showed_closed' THEN _new_status := 'closed';
    WHEN 'no_show' THEN _new_status := 'follow_up';
    WHEN 'showed_verbal_commitment' THEN _new_status := 'follow_up';
    WHEN 'showed_no_close' THEN _new_status := 'not_interested';
    WHEN 'disqualified' THEN _new_status := 'disqualified';
    WHEN 'cancelled' THEN _new_status := 'not_interested';
    WHEN 'rescheduled' THEN _new_status := 'booked';
    ELSE _new_status := 'called';
  END CASE;
  UPDATE public.contacts
  SET status = _new_status,
      latest_appointment_outcome = NEW.appointment_outcome,
      latest_appointment_scheduled_for = COALESCE(NEW.scheduled_for, latest_appointment_scheduled_for),
      latest_appointment_recorded_at = COALESCE(NEW.outcome_recorded_at, now()),
      updated_at = now()
  WHERE id = NEW.contact_id;
  IF NEW.appointment_outcome::text IN ('no_show', 'showed_verbal_commitment') THEN
    _follow_up_date := now() + interval '2 days';
    INSERT INTO public.pipeline_items (contact_id, pipeline_type, assigned_user_id, created_by, scheduled_for, notes, status)
    VALUES (NEW.contact_id, 'follow_up', NEW.assigned_user_id, NEW.created_by, _follow_up_date,
      CASE NEW.appointment_outcome::text
        WHEN 'no_show' THEN 'Auto follow-up: No show on ' || to_char(COALESCE(NEW.scheduled_for, now()), 'Mon DD, YYYY')
        WHEN 'showed_verbal_commitment' THEN 'Auto follow-up: Verbal commitment on ' || to_char(COALESCE(NEW.scheduled_for, now()), 'Mon DD, YYYY')
      END, 'open');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_pipeline_close_fields()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.pipeline_type = 'booked' THEN
    IF NEW.expected_close_date IS NULL THEN
      NEW.expected_close_date := (COALESCE(NEW.scheduled_for, now()) AT TIME ZONE 'Australia/Melbourne')::date + 14;
    END IF;
    IF NEW.closed_at IS NULL AND (NEW.appointment_outcome::text IN ('showed_closed','showed_no_close','disqualified','cancelled') OR NEW.deal_stage IN ('won','lost')) THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $function$;