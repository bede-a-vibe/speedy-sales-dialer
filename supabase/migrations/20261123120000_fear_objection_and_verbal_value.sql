-- 23 Nov 2026 (applied live first).
-- 1) "fear" joins the no-close objections (Bede's objection matrix: logistical, fear, smokescreen).
alter table public.pipeline_items drop constraint if exists pipeline_items_outcome_reason_vocab;
alter table public.pipeline_items add constraint pipeline_items_outcome_reason_vocab CHECK (((outcome_reason IS NULL) OR (outcome_reason = ANY (ARRAY['price_budget'::text, 'think_partner'::text, 'timing'::text, 'agency_trust'::text, 'fear'::text, 'other'::text, 'dq_too_small'::text, 'dq_wrong_fit'::text, 'dq_not_dm'::text, 'dq_no_capacity'::text, 'ns_forgot'::text, 'ns_ghosted'::text, 'ns_emergency'::text, 'ns_wrong_time'::text, 'ns_other'::text, 'ns_missed_by_us'::text, 'cx_not_interested'::text, 'cx_competitor'::text, 'cx_timing'::text, 'cx_price'::text, 'cx_other'::text, 'rs_prospect'::text, 'rs_us'::text, 'rs_clash'::text, 'rs_phone_no_laptop'::text, 'rs_phone_not_quiet'::text, 'rs_phone_driving'::text, 'rs_phone_other'::text]))));

-- 2) A verbal yes keeps its deal value. validate_pipeline_item wiped deal_value and
-- monthly_recurring_value on every outcome except showed_closed, so the value the
-- outcome card asks for on a verbal (PR #244) was thrown away and the setter's
-- level-up bar never showed it as loaded.
CREATE OR REPLACE FUNCTION public.validate_pipeline_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.pipeline_type IN ('follow_up', 'booked') AND NEW.scheduled_for IS NULL THEN
    RAISE EXCEPTION 'scheduled_for is required for follow_up and booked pipeline items';
  END IF;

  IF NEW.pipeline_type <> 'booked' THEN
    NEW.appointment_outcome := NULL;
    NEW.outcome_recorded_at := NULL;
    NEW.outcome_notes := '';
    NEW.deal_value := NULL;
    NEW.monthly_recurring_value := NULL;
  ELSIF NEW.appointment_outcome = 'rescheduled' THEN
    NEW.status := 'open';
    NEW.completed_at := NULL;
    IF TG_OP = 'UPDATE' AND OLD.appointment_outcome IS DISTINCT FROM NEW.appointment_outcome THEN
      NEW.reschedule_count := COALESCE(OLD.reschedule_count, 0) + 1;
    END IF;
    IF NEW.outcome_recorded_at IS NULL THEN
      NEW.outcome_recorded_at := now();
    END IF;
  ELSIF NEW.appointment_outcome IS NOT NULL THEN
    NEW.status := 'completed';
    IF NEW.outcome_recorded_at IS NULL THEN
      NEW.outcome_recorded_at := now();
    END IF;
    -- A verbal yes keeps the value they said yes to (it shows as loaded on the
    -- setter's level-up bar until signed). Only a close or a verbal carries one.
    IF NEW.appointment_outcome NOT IN ('showed_closed', 'showed_verbal_commitment') THEN
      NEW.deal_value := NULL;
      NEW.monthly_recurring_value := NULL;
    END IF;
  ELSE
    NEW.outcome_recorded_at := NULL;
    NEW.outcome_notes := COALESCE(NEW.outcome_notes, '');
  END IF;

  IF NEW.pipeline_type = 'booked' AND NEW.status = 'completed' AND NEW.appointment_outcome IS NULL THEN
    RAISE EXCEPTION 'appointment_outcome is required for completed booked pipeline items';
  END IF;

  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;
