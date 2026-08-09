/**
 * State of Being & Discipline — the six questions Matt Ryder adds to the End of
 * Day report.
 *
 * WORDING IS EXACT. Do not reword, soften or "improve" any `question` string —
 * it is Matt's wording and reps are trained against it verbatim.
 *
 * ORDER IS LOAD-BEARING. Render exactly in the order of this array: the four
 * discipline questions first, the two state-of-being questions last. Matt's
 * reasoning: if energy and headspace are at the top they frame the whole report
 * emotionally and the discipline answers get rationalised. Discipline first,
 * feelings second.
 */

export type EodStateOfBeingKey =
  | "precall_checklist_done"
  | "script_reviewed_morning"
  | "script_reviewed_tonight"
  | "recordings_reviewed"
  | "energy_rating"
  | "right_headspace";

/** How the answer is captured. All tap-only — the block must take under 2 minutes. */
export type EodAnswerKind = "yes_no" | "count" | "scale_1_10";

/**
 * The accountability split, deliberately part of the data model rather than
 * something the UI decides ad hoc.
 *
 * - `accountability` — performance-manageable. A rep can be held to these.
 * - `pattern`        — pattern trackers. Context for coaching conversations
 *                      only; NEVER performance-manage on them.
 */
export type EodAnswerCategory = "accountability" | "pattern";

export type EodStateOfBeingQuestion = {
  key: EodStateOfBeingKey;
  /** Matt Ryder's exact wording. Never edited. */
  question: string;
  kind: EodAnswerKind;
  category: EodAnswerCategory;
  /** Short label for dense manager-facing summaries. */
  shortLabel: string;
};

export const EOD_STATE_OF_BEING_QUESTIONS: readonly EodStateOfBeingQuestion[] = [
  {
    key: "precall_checklist_done",
    question: "Did you complete the pre-call checklist and warm-up before your first dial?",
    kind: "yes_no",
    category: "accountability",
    shortLabel: "Pre-call checklist + warm-up",
  },
  {
    key: "script_reviewed_morning",
    question: "Did you review your script this morning before dialing?",
    kind: "yes_no",
    category: "accountability",
    shortLabel: "Script reviewed (morning)",
  },
  {
    key: "script_reviewed_tonight",
    question: "Did you review your script tonight before submitting this report?",
    kind: "yes_no",
    category: "accountability",
    shortLabel: "Script reviewed (tonight)",
  },
  {
    key: "recordings_reviewed",
    question: "How many of your own call recordings did you listen to today?",
    kind: "count",
    category: "accountability",
    shortLabel: "Recordings reviewed",
  },
  {
    key: "energy_rating",
    question: "Rate your energy going into the shift, 1 to 10.",
    kind: "scale_1_10",
    category: "pattern",
    shortLabel: "Energy going into shift",
  },
  {
    key: "right_headspace",
    question: "Did you feel you were in the right headspace to perform today?",
    kind: "yes_no",
    category: "pattern",
    shortLabel: "Right headspace",
  },
] as const;

/** Performance-manageable answers. */
export const EOD_ACCOUNTABILITY_KEYS: readonly EodStateOfBeingKey[] =
  EOD_STATE_OF_BEING_QUESTIONS.filter((q) => q.category === "accountability").map((q) => q.key);

/** Coaching context only — never performance-manage on these. */
export const EOD_PATTERN_KEYS: readonly EodStateOfBeingKey[] =
  EOD_STATE_OF_BEING_QUESTIONS.filter((q) => q.category === "pattern").map((q) => q.key);

/**
 * The highest-leverage answer in the block: how many of their own recordings the
 * rep actually listened to. Kept as a named constant so the manager view can
 * always surface it without hard-coding the string in a component.
 */
export const EOD_HIGHEST_LEVERAGE_KEY: EodStateOfBeingKey = "recordings_reviewed";

/** The shape of the six answers as stored on `eod_reports`. */
export type EodStateOfBeingAnswers = {
  precall_checklist_done: boolean | null;
  script_reviewed_morning: boolean | null;
  script_reviewed_tonight: boolean | null;
  recordings_reviewed: number | null;
  energy_rating: number | null;
  right_headspace: boolean | null;
};

export const EOD_STATE_OF_BEING_COLUMNS: readonly EodStateOfBeingKey[] =
  EOD_STATE_OF_BEING_QUESTIONS.map((q) => q.key);

/** Highest number offered as a one-tap chip before the rep uses the stepper. */
export const EOD_RECORDINGS_QUICK_PICKS = [0, 1, 2, 3, 4, 5] as const;

/**
 * True when a report carries at least one state-of-being answer. Reports written
 * before the migration lands (or while the columns are missing) have none, and
 * every surface must render "not captured" rather than blank tiles or a crash.
 */
export function hasStateOfBeingAnswers(
  answers: Partial<EodStateOfBeingAnswers> | null | undefined,
): boolean {
  if (!answers) return false;
  return EOD_STATE_OF_BEING_COLUMNS.some((key) => answers[key] !== null && answers[key] !== undefined);
}

/** Reads one answer defensively — the column may not exist on the row at all. */
export function readAnswer(
  answers: Partial<EodStateOfBeingAnswers> | null | undefined,
  key: EodStateOfBeingKey,
): boolean | number | null {
  const value = answers?.[key];
  return value === undefined ? null : value;
}
