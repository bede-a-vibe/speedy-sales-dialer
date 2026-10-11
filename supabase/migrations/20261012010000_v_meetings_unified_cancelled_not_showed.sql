-- v_meetings_unified mapped a dialer booking whose appointment_outcome was
-- 'cancelled' or 'disqualified' to resolved_outcome 'showed' (any non-null
-- outcome other than no_show / rescheduled counted as a show). That inflated
-- the Meetings page and get_rep_meeting_stats show rates. Applied to prod via
-- query_database on 12 Oct 2026; this file is the record.
create or replace view public.v_meetings_unified as
 SELECT 'ghl'::text AS stream, a.id, a.contact_id, COALESCE(a.calendar_name, 'GHL calendar'::text) AS meeting_type, a.title, a.start_time, a.booked_at, a.original_start_time, a.reschedule_count,
    NULL::uuid AS assigned_user_id, a.ghl_assigned_user_id AS ghl_user_id, COALESCE(gu.name, 'Unassigned'::text) AS rep_name, gu.provisioned_user_id AS rep_user_id, a.meeting_link,
    COALESCE(a.outcome, CASE a.appointment_status WHEN 'showed'::text THEN 'showed'::text WHEN 'noshow'::text THEN 'noshow'::text WHEN 'cancelled'::text THEN 'cancelled'::text WHEN 'invalid'::text THEN 'invalid'::text ELSE NULL::text END,
             CASE WHEN a.start_time >= now() THEN 'upcoming'::text ELSE 'pending'::text END) AS resolved_outcome,
    a.outcome_reason, a.outcome_notes, a.outcome IS NOT NULL AS dialer_dispositioned,
    COALESCE(a.attributed_channel, contact_channel(c.lead_channel, c.lead_type)) AS channel,
    COALESCE(a.attributed_source, NULLIF(btrim(c.lead_source), ''::text), 'Unknown'::text) AS source,
    a.contact_id IS NOT NULL AS is_linked, c.business_name, c.contact_person, c.phone, c.lifecycle_stage, c.owner_id,
    d.first_deal_at, d.total_amount, d.mrr,
    d.first_deal_at IS NOT NULL AND d.first_deal_at >= COALESCE(a.booked_at, a.start_time)::date AS led_to_deal
   FROM ghl_appointments a
     LEFT JOIN contacts c ON c.id = a.contact_id
     LEFT JOIN ghl_users gu ON gu.ghl_user_id = a.ghl_assigned_user_id
     LEFT JOIN LATERAL ( SELECT min(cd.start_date) AS first_deal_at, sum(cd.amount) AS total_amount,
            sum(CASE cd.billing_period WHEN 'monthly'::text THEN cd.amount WHEN 'weekly'::text THEN cd.amount * 52.0 / 12.0 ELSE 0::numeric END) AS mrr
           FROM client_deals cd WHERE cd.contact_id = a.contact_id AND cd.status <> 'churned'::text) d ON true
UNION ALL
 SELECT 'dialer'::text AS stream, pi.id, pi.contact_id, 'Dialer booking'::text AS meeting_type, NULLIF(btrim(pi.notes), ''::text) AS title, pi.scheduled_for AS start_time, pi.created_at AS booked_at,
    NULL::timestamp with time zone AS original_start_time, COALESCE(pi.reschedule_count, 0) AS reschedule_count, pi.assigned_user_id, pr.ghl_user_id,
    COALESCE(pr.display_name, pr.email, 'Unassigned'::text) AS rep_name, pi.assigned_user_id AS rep_user_id, NULL::text AS meeting_link,
    CASE
      WHEN pi.status = 'canceled'::pipeline_status THEN 'cancelled'::text
      WHEN pi.appointment_outcome = 'no_show'::appointment_outcome THEN 'noshow'::text
      WHEN pi.appointment_outcome = 'rescheduled'::appointment_outcome THEN 'rescheduled'::text
      -- A cancelled or disqualified booking never sat; it is not a show.
      WHEN pi.appointment_outcome IN ('cancelled'::appointment_outcome, 'disqualified'::appointment_outcome) THEN 'cancelled'::text
      WHEN pi.appointment_outcome IS NOT NULL THEN 'showed'::text
      WHEN pi.scheduled_for >= now() THEN 'upcoming'::text
      ELSE 'pending'::text
    END AS resolved_outcome,
    pi.appointment_outcome::text AS outcome_reason, NULLIF(btrim(pi.outcome_notes), ''::text) AS outcome_notes, pi.appointment_outcome IS NOT NULL AS dialer_dispositioned,
    contact_channel(c.lead_channel, c.lead_type) AS channel, COALESCE(NULLIF(btrim(c.lead_source), ''::text), 'Unknown'::text) AS source,
    true AS is_linked, c.business_name, c.contact_person, c.phone, c.lifecycle_stage, c.owner_id,
    d.first_deal_at, d.total_amount, d.mrr,
    d.first_deal_at IS NOT NULL AND d.first_deal_at >= COALESCE(pi.created_at, pi.scheduled_for)::date AS led_to_deal
   FROM pipeline_items pi
     JOIN contacts c ON c.id = pi.contact_id
     LEFT JOIN profiles pr ON pr.user_id = pi.assigned_user_id
     LEFT JOIN LATERAL ( SELECT min(cd.start_date) AS first_deal_at, sum(cd.amount) AS total_amount,
            sum(CASE cd.billing_period WHEN 'monthly'::text THEN cd.amount WHEN 'weekly'::text THEN cd.amount * 52.0 / 12.0 ELSE 0::numeric END) AS mrr
           FROM client_deals cd WHERE cd.contact_id = pi.contact_id AND cd.status <> 'churned'::text) d ON true
  WHERE pi.pipeline_type = 'booked'::pipeline_type;
alter view public.v_meetings_unified set (security_invoker = true);
