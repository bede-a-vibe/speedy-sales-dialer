/**
 * Meeting outcome vocabulary.
 *
 * The distinction that matters for reporting: only `showed` and `noshow` belong
 * in the show-rate calculation. A rescheduled meeting moved, a cancelled one was
 * called off, and an undispositioned one is simply unknown — none of those are
 * evidence that the prospect failed to turn up, and folding them into no-shows
 * is how a show rate ends up understating the team.
 */
export type MeetingOutcome =
  | "showed"
  | "noshow"
  | "cancelled"
  | "rescheduled"
  | "invalid"
  | "upcoming"
  | "pending";

/** Outcomes a rep can record. `upcoming` and `pending` are derived, never chosen. */
export type RecordableOutcome = "showed" | "noshow" | "cancelled" | "rescheduled";

export const RECORDABLE_OUTCOMES: {
  value: RecordableOutcome;
  label: string;
  /** A reason is mandatory where the "why" is the entire point of the record. */
  requiresReason: boolean;
}[] = [
  { value: "showed", label: "Showed", requiresReason: false },
  { value: "noshow", label: "No-show", requiresReason: true },
  { value: "cancelled", label: "Cancelled", requiresReason: true },
  { value: "rescheduled", label: "Rescheduled", requiresReason: false },
];

export const OUTCOME_REASONS: Record<RecordableOutcome, { value: string; label: string }[]> = {
  showed: [
    { value: "showed_closed", label: "Closed on the call" },
    { value: "showed_verbal", label: "Verbal commitment" },
    { value: "showed_proposal", label: "Proposal to send" },
    { value: "showed_follow_up", label: "Follow-up booked" },
    { value: "showed_no_close", label: "No close" },
  ],
  noshow: [
    { value: "no_answer", label: "No answer, no contact" },
    { value: "forgot", label: "Forgot / lost track of time" },
    { value: "ghosted", label: "Ghosted after confirming" },
    { value: "wrong_timezone", label: "Timezone mix-up" },
    { value: "tech_issue", label: "Tech issue on their end" },
    { value: "other", label: "Other" },
  ],
  cancelled: [
    { value: "prospect_cancelled", label: "Prospect cancelled" },
    { value: "rep_cancelled", label: "We cancelled" },
    { value: "not_qualified", label: "Not qualified" },
    { value: "no_longer_interested", label: "No longer interested" },
    { value: "went_elsewhere", label: "Went with someone else" },
    { value: "budget", label: "No budget" },
    { value: "duplicate", label: "Duplicate booking" },
    { value: "spam", label: "Spam / fake booking" },
    { value: "other", label: "Other" },
  ],
  rescheduled: [
    { value: "prospect_requested", label: "Prospect requested" },
    { value: "rep_requested", label: "We requested" },
    { value: "conflict", label: "Diary conflict" },
    { value: "illness", label: "Illness" },
    { value: "other", label: "Other" },
  ],
};

const ALL_REASONS = new Map(
  Object.values(OUTCOME_REASONS)
    .flat()
    .map((reason) => [reason.value, reason.label]),
);

export function reasonLabel(value: string | null | undefined) {
  if (!value) return null;
  return ALL_REASONS.get(value) ?? value;
}

export const OUTCOME_LABELS: Record<MeetingOutcome, string> = {
  showed: "Showed",
  noshow: "No-show",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
  invalid: "Invalid",
  upcoming: "Upcoming",
  pending: "Needs outcome",
};

export function outcomeTone(outcome: MeetingOutcome): string {
  switch (outcome) {
    case "showed":
      return "bg-emerald-600 text-white hover:bg-emerald-600";
    case "noshow":
      return "bg-red-600 text-white hover:bg-red-600";
    case "cancelled":
      return "bg-muted text-muted-foreground";
    case "rescheduled":
      return "bg-amber-500 text-white hover:bg-amber-500";
    case "pending":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-400";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}
