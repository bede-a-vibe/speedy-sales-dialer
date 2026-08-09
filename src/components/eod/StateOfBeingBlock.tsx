import { Check, Headphones, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EOD_HIGHEST_LEVERAGE_KEY,
  EOD_RECORDINGS_QUICK_PICKS,
  EOD_STATE_OF_BEING_QUESTIONS,
  hasStateOfBeingAnswers,
  readAnswer,
  type EodStateOfBeingAnswers,
  type EodStateOfBeingQuestion,
} from "@/lib/eodStateOfBeing";

/**
 * State of Being & Discipline.
 *
 * Questions render straight off EOD_STATE_OF_BEING_QUESTIONS, in array order, so
 * the ordering rule lives in one place: the four discipline questions first, the
 * two state-of-being questions last. Matt's reasoning — if energy and headspace
 * are at the top they frame the whole report emotionally and the discipline
 * answers get rationalised. Discipline first, feelings second.
 *
 * Every input here is a tap. No free-text: the whole block has to cost a rep
 * under two minutes at the end of a shift or it won't get filled in honestly.
 */

export const emptyStateOfBeing: EodStateOfBeingAnswers = {
  precall_checklist_done: null,
  script_reviewed_morning: null,
  script_reviewed_tonight: null,
  recordings_reviewed: null,
  energy_rating: null,
  right_headspace: null,
};

/** Pulls the six answers off a report row, tolerating columns that don't exist yet. */
export function stateOfBeingFromReport(
  report: Partial<EodStateOfBeingAnswers> | null | undefined,
): EodStateOfBeingAnswers {
  return {
    precall_checklist_done: (readAnswer(report, "precall_checklist_done") as boolean | null) ?? null,
    script_reviewed_morning: (readAnswer(report, "script_reviewed_morning") as boolean | null) ?? null,
    script_reviewed_tonight: (readAnswer(report, "script_reviewed_tonight") as boolean | null) ?? null,
    recordings_reviewed: (readAnswer(report, "recordings_reviewed") as number | null) ?? null,
    energy_rating: (readAnswer(report, "energy_rating") as number | null) ?? null,
    right_headspace: (readAnswer(report, "right_headspace") as boolean | null) ?? null,
  };
}

/** Which questions still have no answer. Used to block submit with a useful message. */
export function unansweredStateOfBeing(
  answers: EodStateOfBeingAnswers,
): EodStateOfBeingQuestion[] {
  return EOD_STATE_OF_BEING_QUESTIONS.filter((q) => answers[q.key] === null || answers[q.key] === undefined);
}

const tapBase =
  "rounded-lg border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1";
const tapIdle = "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground";
const tapOn = "border-primary bg-primary/10 text-primary";

function YesNo({
  value,
  onChange,
  label,
}: {
  value: boolean | null;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      {[true, false].map((option) => (
        <button
          key={String(option)}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(tapBase, "h-9 min-w-[72px] px-4", value === option ? tapOn : tapIdle)}
        >
          {option ? "Yes" : "No"}
        </button>
      ))}
    </div>
  );
}

function RecordingsCount({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (next: number) => void;
  label: string;
}) {
  const beyondQuickPicks = value !== null && value > EOD_RECORDINGS_QUICK_PICKS[EOD_RECORDINGS_QUICK_PICKS.length - 1];
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {EOD_RECORDINGS_QUICK_PICKS.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(tapBase, "h-9 w-9 font-mono", value === n && !beyondQuickPicks ? tapOn : tapIdle)}
        >
          {n}
        </button>
      ))}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-1">
        <button
          type="button"
          aria-label="One fewer recording"
          onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span
          className={cn(
            "min-w-[2ch] text-center font-mono text-sm",
            beyondQuickPicks ? "font-bold text-primary" : "text-muted-foreground",
          )}
        >
          {value ?? "–"}
        </span>
        <button
          type="button"
          aria-label="One more recording"
          onClick={() => onChange(Math.min(99, (value ?? 0) + 1))}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function EnergyScale({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (next: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(tapBase, "h-9 w-9 font-mono", value === n ? tapOn : tapIdle)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function PatternDivider() {
  return (
    <div className="border-t border-dashed border-border pt-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">State of being</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Tracked for coaching context only — never performance-managed.
      </p>
    </div>
  );
}

export function StateOfBeingForm({
  value,
  onChange,
}: {
  value: EodStateOfBeingAnswers;
  onChange: (patch: Partial<EodStateOfBeingAnswers>) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">State of being &amp; discipline</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Six taps. No typing. Answer them straight.
      </p>

      <div className="mt-4 space-y-4">
        {EOD_STATE_OF_BEING_QUESTIONS.map((q, index) => {
          const previous = EOD_STATE_OF_BEING_QUESTIONS[index - 1];
          const startsPatternSection = q.category === "pattern" && previous?.category !== "pattern";
          return (
            <div key={q.key} className={startsPatternSection ? "space-y-4" : undefined}>
              {startsPatternSection ? <PatternDivider /> : null}
              <div>
                <p className="text-sm text-foreground">{q.question}</p>
                <div className="mt-2">
                  {q.kind === "yes_no" ? (
                    <YesNo
                      label={q.question}
                      value={value[q.key] as boolean | null}
                      onChange={(next) => onChange({ [q.key]: next } as Partial<EodStateOfBeingAnswers>)}
                    />
                  ) : null}
                  {q.kind === "count" ? (
                    <RecordingsCount
                      label={q.question}
                      value={value[q.key] as number | null}
                      onChange={(next) => onChange({ [q.key]: next } as Partial<EodStateOfBeingAnswers>)}
                    />
                  ) : null}
                  {q.kind === "scale_1_10" ? (
                    <EnergyScale
                      label={q.question}
                      value={value[q.key] as number | null}
                      onChange={(next) => onChange({ [q.key]: next } as Partial<EodStateOfBeingAnswers>)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YesNoPill({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        value
          ? "bg-primary/15 text-primary"
          : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      )}
    >
      {value ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {value ? "Yes" : "No"}
    </span>
  );
}

/**
 * The one number a manager should never have to hunt for: how many of their own
 * recordings the rep actually listened to. Zero is the signal, so it's called out.
 */
function RecordingsTile({ count }: { count: number | null }) {
  const zero = count === 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-2",
        zero ? "border-amber-500/40 bg-amber-500/10" : "border-primary/30 bg-primary/5",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          zero ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/15 text-primary",
        )}
      >
        <Headphones className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="font-mono text-xl font-bold leading-tight text-foreground">{count ?? "—"}</p>
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          Own recordings reviewed
        </p>
        {zero ? (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">Listened to none of their own calls.</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Read-only view of the six answers. `variant="manager"` leads with the
 * recordings-reviewed count, which is the highest-leverage number in the block.
 */
export function StateOfBeingSummary({
  report,
  variant = "rep",
}: {
  report: Partial<EodStateOfBeingAnswers> | null | undefined;
  variant?: "rep" | "manager";
}) {
  if (!hasStateOfBeingAnswers(report)) {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
          State of being &amp; discipline
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Not captured on this report.
        </p>
      </div>
    );
  }

  const answers = stateOfBeingFromReport(report);
  const accountability = EOD_STATE_OF_BEING_QUESTIONS.filter(
    (q) => q.category === "accountability" && q.key !== EOD_HIGHEST_LEVERAGE_KEY,
  );
  const patterns = EOD_STATE_OF_BEING_QUESTIONS.filter((q) => q.category === "pattern");

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        State of being &amp; discipline
      </p>

      <div className={cn("mt-2 grid gap-3", variant === "manager" ? "sm:grid-cols-[minmax(0,200px)_1fr]" : "")}>
        <RecordingsTile count={answers.recordings_reviewed} />

        <div className="space-y-1.5">
          {accountability.map((q) => (
            <div key={q.key} className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">{q.shortLabel}</span>
              <YesNoPill value={answers[q.key] as boolean | null} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-dashed border-border pt-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {patterns.map((q) => (
            <div key={q.key} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{q.shortLabel}</span>
              {q.kind === "scale_1_10" ? (
                <span className="font-mono text-xs font-semibold text-foreground">
                  {answers[q.key] === null ? "—" : `${answers[q.key]}/10`}
                </span>
              ) : (
                <YesNoPill value={answers[q.key] as boolean | null} />
              )}
            </div>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Pattern trackers — coaching context only, not a performance metric.
        </p>
      </div>
    </div>
  );
}
