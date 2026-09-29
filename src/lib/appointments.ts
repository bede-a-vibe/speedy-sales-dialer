export const BOOKED_APPOINTMENT_DEFAULT_TIME = "09:00";

export const APPOINTMENT_OUTCOME_OPTIONS = [
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "showed_verbal_commitment", label: "Showed - Verbal Commitment" },
  { value: "second_meeting_booked", label: "Second Meeting Booked" },
  { value: "no_close_follow_up", label: "No Close Follow-up" },
  { value: "showed_closed", label: "Close" },
  { value: "showed_no_close", label: "No Close" },
  { value: "disqualified", label: "Disqualified (DQ)" },
] as const;

export type AppointmentOutcomeValue = (typeof APPOINTMENT_OUTCOME_OPTIONS)[number]["value"];

export const APPOINTMENT_OUTCOME_LABELS: Record<AppointmentOutcomeValue, string> = {
  no_show: "No Show",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  showed_verbal_commitment: "Showed - Verbal Commitment",
  second_meeting_booked: "Second Meeting Booked",
  no_close_follow_up: "No Close Follow-up",
  showed_closed: "Close",
  showed_no_close: "No Close",
  disqualified: "Disqualified (DQ)",
};

/** Why a showed meeting didn't close. Required on No Close and No Close Follow-up. */
export const NO_CLOSE_REASONS = [
  { value: "price_budget", label: "Price / budget" },
  { value: "think_partner", label: "Needs to think / partner" },
  { value: "timing", label: "Timing" },
  { value: "agency_trust", label: "Has an agency / trust" },
  { value: "other", label: "Other" },
] as const;

/** Why a meeting was disqualified. Required on DQ. */
export const DQ_REASONS = [
  { value: "dq_too_small", label: "Too small / low revenue" },
  { value: "dq_wrong_fit", label: "Wrong fit / industry" },
  { value: "dq_not_dm", label: "Not decision maker" },
  { value: "dq_no_capacity", label: "No capacity for more work" },
] as const;

/** Why a meeting didn't happen. Required on No Show. */
export const NO_SHOW_REASONS = [
  { value: "ns_forgot", label: "Forgot" },
  { value: "ns_ghosted", label: "Ghosted / no reply" },
  { value: "ns_emergency", label: "Job or emergency came up" },
  { value: "ns_wrong_time", label: "Wrong number / time" },
  { value: "ns_other", label: "Other" },
] as const;

/** Why a prospect cancelled. Required on Cancelled. */
export const CANCEL_REASONS = [
  { value: "cx_not_interested", label: "No longer interested" },
  { value: "cx_competitor", label: "Went with someone else" },
  { value: "cx_timing", label: "Timing" },
  { value: "cx_price", label: "Price" },
  { value: "cx_other", label: "Other" },
] as const;

/** Why a meeting moved. Required on Rescheduled. */
export const RESCHEDULE_REASONS = [
  { value: "rs_prospect", label: "Prospect asked" },
  { value: "rs_us", label: "We asked" },
  { value: "rs_clash", label: "Clash / double-booked" },
] as const;

const REASON_LABELS = new Map<string, string>(
  [...NO_CLOSE_REASONS, ...DQ_REASONS, ...NO_SHOW_REASONS, ...CANCEL_REASONS, ...RESCHEDULE_REASONS].map((r) => [r.value, r.label]),
);

export function getOutcomeReasonLabel(value: string | null | undefined) {
  if (!value) return null;
  return REASON_LABELS.get(value) ?? value;
}

/** Outcomes that need a reason before they can be saved. */
export function reasonsForOutcome(outcome: AppointmentOutcomeValue) {
  if (outcome === "disqualified") return DQ_REASONS;
  if (outcome === "no_show") return NO_SHOW_REASONS;
  if (outcome === "cancelled") return CANCEL_REASONS;
  if (outcome === "rescheduled") return RESCHEDULE_REASONS;
  if (outcome === "showed_no_close" || outcome === "no_close_follow_up") return NO_CLOSE_REASONS;
  return null;
}

export function getAppointmentOutcomeLabel(outcome: AppointmentOutcomeValue | null | undefined) {
  if (!outcome) return "—";
  return APPOINTMENT_OUTCOME_LABELS[outcome] ?? outcome;
}
