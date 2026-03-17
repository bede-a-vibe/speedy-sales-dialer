export const BOOKED_APPOINTMENT_DEFAULT_TIME = "09:00";

export const APPOINTMENT_OUTCOME_OPTIONS = [
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "showed_closed", label: "Showed - Closed" },
  { value: "showed_no_close", label: "Showed - No Close" },
] as const;

export type AppointmentOutcomeValue = (typeof APPOINTMENT_OUTCOME_OPTIONS)[number]["value"];

export const APPOINTMENT_OUTCOME_LABELS: Record<AppointmentOutcomeValue, string> = {
  no_show: "No Show",
  rescheduled: "Rescheduled",
  showed_closed: "Showed - Closed",
  showed_no_close: "Showed - No Close",
};

export function getAppointmentOutcomeLabel(outcome: AppointmentOutcomeValue | null | undefined) {
  if (!outcome) return "—";
  return APPOINTMENT_OUTCOME_LABELS[outcome] ?? outcome;
}
