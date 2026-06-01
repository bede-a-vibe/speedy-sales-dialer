export const BOOKED_APPOINTMENT_DEFAULT_TIME = "09:00";

export const APPOINTMENT_OUTCOME_OPTIONS = [
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "showed_verbal_commitment", label: "Showed - Verbal Commitment" },
  { value: "second_meeting_booked", label: "Second Meeting Booked" },
  { value: "no_close_follow_up", label: "No Close Follow-up" },
  { value: "showed_closed", label: "Close" },
  { value: "showed_no_close", label: "No Close" },
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
};

export function getAppointmentOutcomeLabel(outcome: AppointmentOutcomeValue | null | undefined) {
  if (!outcome) return "—";
  return APPOINTMENT_OUTCOME_LABELS[outcome] ?? outcome;
}
