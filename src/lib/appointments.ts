export const BOOKED_APPOINTMENT_DEFAULT_TIME = "09:00";

export const APPOINTMENT_OUTCOME_OPTIONS = [
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
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

const REASON_LABELS = new Map<string, string>(
  [...NO_CLOSE_REASONS, ...DQ_REASONS].map((r) => [r.value, r.label]),
);

export function getOutcomeReasonLabel(value: string | null | undefined) {
  if (!value) return null;
  return REASON_LABELS.get(value) ?? value;
}

/** Outcomes that need a reason before they can be saved. */
export function reasonsForOutcome(outcome: AppointmentOutcomeValue) {
  if (outcome === "disqualified") return DQ_REASONS;
  if (outcome === "showed_no_close" || outcome === "no_close_follow_up") return NO_CLOSE_REASONS;
  return null;
}

export function getAppointmentOutcomeLabel(outcome: AppointmentOutcomeValue | null | undefined) {
  if (!outcome) return "—";
  return APPOINTMENT_OUTCOME_LABELS[outcome] ?? outcome;
}
