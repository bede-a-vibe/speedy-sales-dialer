import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCallOpeners } from "@/hooks/useCallOpeners";
import { STAGE_EXIT_REASONS, EXIT_STAGE_LABELS, type ExitStageKey } from "@/lib/funnelMetrics";
import { Check, PhoneMissed, PhoneOff, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export interface ConversationProgressState {
  openerId: string | null;
  reachedConnection: boolean;
  reachedProblem: boolean;
  reachedSolution: boolean;
  reachedPitched: boolean;
  reachedCommitment: boolean;
  exitReasonConnection: string | null;
  exitReasonProblem: string | null;
  exitReasonSolution: string | null;
  exitReasonCommitment: string | null;
  exitReasonBooking: string | null;
  exitReasonNotes: string | null;
}

export const EMPTY_CONVERSATION_PROGRESS: ConversationProgressState = {
  openerId: null,
  reachedConnection: false,
  reachedProblem: false,
  reachedSolution: false,
  reachedPitched: false,
  reachedCommitment: false,
  exitReasonConnection: null,
  exitReasonProblem: null,
  exitReasonSolution: null,
  exitReasonCommitment: null,
  exitReasonBooking: null,
  exitReasonNotes: null,
};

interface Props {
  value: ConversationProgressState;
  onChange: (next: ConversationProgressState) => void;
  /** When the rep has selected "booked" outcome we hide the exit picker entirely. */
  outcomeIsBooked?: boolean;
  /** When true, render without the outer card chrome / heading (for embedding inside another card). */
  embedded?: boolean;
  /** One-tap "the line dropped" — fills progress + schedules an immediate ring-back. */
  onCallDropped?: () => void;
}

type ReachedStage = "reachedConnection" | "reachedProblem" | "reachedSolution" | "reachedPitched" | "reachedCommitment";
const REACHED_STAGES: ReachedStage[] = ["reachedConnection", "reachedProblem", "reachedSolution", "reachedPitched", "reachedCommitment"];
const STAGE_PILLS: { key: ReachedStage; label: string }[] = [
  { key: "reachedConnection", label: "Connected" },
  { key: "reachedProblem", label: "Problem" },
  { key: "reachedSolution", label: "Solution" },
  { key: "reachedPitched", label: "Pitched" },
  { key: "reachedCommitment", label: "Commitment" },
];

export function updateReachedStage(value: ConversationProgressState, stage: ReachedStage, checked: boolean): ConversationProgressState {
  const next = { ...value };
  const index = REACHED_STAGES.indexOf(stage);
  REACHED_STAGES.forEach((key, i) => {
    if ((checked && i <= index) || (!checked && i >= index)) next[key] = checked;
  });
  return next;
}

/** Keep the explicit pitch checkpoint in the existing call notes, independently of solution awareness. */
export function withPitchedStageNote(notes: string, pitched: boolean): string | undefined {
  return [notes.trim(), pitched ? "Stage reached: Pitched" : ""].filter(Boolean).join("\n") || undefined;
}

/**
 * Compute which stage the call exited at based on the furthest stage reached.
 * Returns null if reps haven't started tagging or the call was booked.
 */
function getExitStage(state: ConversationProgressState, outcomeIsBooked?: boolean): ExitStageKey | null {
  if (outcomeIsBooked) return null;
  if (state.reachedCommitment) return "booking";
  if (state.reachedSolution) return "commitment";
  if (state.reachedProblem) return "solution";
  if (state.reachedConnection) return "problem";
  // Nothing reached — assume connection failed
  return "connection";
}

const STAGE_TO_FIELD: Record<ExitStageKey, keyof ConversationProgressState> = {
  connection: "exitReasonConnection",
  problem: "exitReasonProblem",
  solution: "exitReasonSolution",
  commitment: "exitReasonCommitment",
  booking: "exitReasonBooking",
};

/** Clear any exit reasons that no longer apply to the current furthest stage. */
function clearStaleExitReasons(state: ConversationProgressState, activeStage: ExitStageKey | null): ConversationProgressState {
  const cleared: ConversationProgressState = {
    ...state,
    exitReasonConnection: null,
    exitReasonProblem: null,
    exitReasonSolution: null,
    exitReasonCommitment: null,
    exitReasonBooking: null,
  };
  if (activeStage) {
    const field = STAGE_TO_FIELD[activeStage];
    return { ...cleared, [field]: state[field] };
  }
  return cleared;
}

/**
 * The conversation block of Log This Call, laid out to fit beside the
 * outcomes on one screen (Bede, 29 Oct 2026): stages as one pill row, the
 * two one-tap tags side by side, opener and exit reason side by side, and a
 * single-line context box. The state model and the cascading stage rule are
 * unchanged.
 */
export function ConversationProgressPanel({ value, onChange, outcomeIsBooked, embedded, onCallDropped }: Props) {
  const { data: openers = [] } = useCallOpeners();

  const exitStage = useMemo(() => getExitStage(value, outcomeIsBooked), [value, outcomeIsBooked]);

  // Cascading: ticking a later stage auto-ticks earlier ones.
  const setStage = (stage: ReachedStage, checked: boolean) => {
    const next = updateReachedStage(value, stage, checked);
    const newExitStage = getExitStage(next, outcomeIsBooked);
    onChange(clearStaleExitReasons(next, newExitStage));
  };

  const currentExitValue = exitStage ? (value[STAGE_TO_FIELD[exitStage]] as string | null) : null;

  const setExitReason = (v: string) => {
    if (!exitStage) return;
    const field = STAGE_TO_FIELD[exitStage];
    onChange({ ...value, [field]: v === NONE ? null : v });
  };

  const isImmediateHangUp =
    !value.reachedConnection &&
    !value.reachedProblem &&
    !value.reachedSolution &&
    !value.reachedPitched &&
    !value.reachedCommitment &&
    value.exitReasonConnection === "hung_up_immediately";

  const tagImmediateHangUp = () => {
    if (isImmediateHangUp) {
      onChange({ ...value, exitReasonConnection: null });
      return;
    }
    onChange({
      ...value,
      reachedConnection: false,
      reachedProblem: false,
      reachedSolution: false,
      reachedPitched: false,
      reachedCommitment: false,
      exitReasonConnection: "hung_up_immediately",
      exitReasonProblem: null,
      exitReasonSolution: null,
      exitReasonCommitment: null,
      exitReasonBooking: null,
    });
  };

  const inner = (
    <>
      {/* Stages reached: one row of pills. Ticking a later one ticks the ones before it. */}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Stages reached</Label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Stages reached">
          {STAGE_PILLS.map(({ key, label }) => {
            const on = Boolean(value[key]);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setStage(key, !on)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  on
                    ? "border-primary/60 bg-primary/15 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
                )}
              >
                {on ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-current opacity-40" />}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {!outcomeIsBooked && (
        <div className={cn("grid gap-1.5", onCallDropped ? "grid-cols-2" : "grid-cols-1")}>
          <Button
            type="button"
            variant={isImmediateHangUp ? "destructive" : "outline"}
            size="sm"
            onClick={tagImmediateHangUp}
            aria-pressed={isImmediateHangUp}
            className={cn(
              "h-8 justify-start gap-1.5 px-2.5 text-xs",
              !isImmediateHangUp && "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
            title="They hung up during or straight after the opener"
          >
            <PhoneOff className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{isImmediateHangUp ? "Hung up at opener ✓" : "Hung up at opener"}</span>
          </Button>
          {onCallDropped && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCallDropped}
              className="h-8 justify-start gap-1.5 border-amber-500/40 px-2.5 text-xs text-amber-700 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-300"
              title="The line dropped: tag it and ring them straight back"
            >
              <PhoneMissed className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Dropped, ring back</span>
            </Button>
          )}
        </div>
      )}

      <div className={cn("grid gap-1.5", exitStage ? "grid-cols-2" : "grid-cols-1")}>
        <div className="min-w-0 space-y-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">Opener</Label>
          <Select
            value={value.openerId ?? NONE}
            onValueChange={(v) => onChange({ ...value, openerId: v === NONE ? null : v })}
          >
            <SelectTrigger className="h-8 border-border bg-background text-xs" aria-label="Opener used">
              <SelectValue placeholder="Opener (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not tracked</SelectItem>
              {openers.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {exitStage && (
          <div className="min-w-0 space-y-1">
            <Label className="truncate text-[10px] uppercase tracking-widest text-muted-foreground" title={`Why did the call end at ${EXIT_STAGE_LABELS[exitStage]}?`}>
              Ended at {EXIT_STAGE_LABELS[exitStage]}
            </Label>
            <Select value={currentExitValue ?? NONE} onValueChange={setExitReason}>
              <SelectTrigger className="h-8 border-border bg-background text-xs" aria-label={`Why did the call end at ${EXIT_STAGE_LABELS[exitStage]}?`}>
                <SelectValue placeholder="Why? (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not tracked</SelectItem>
                {STAGE_EXIT_REASONS[exitStage].map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-[10px] text-muted-foreground">{opt.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {exitStage && (
        <Textarea
          value={value.exitReasonNotes ?? ""}
          onChange={(e) => onChange({ ...value, exitReasonNotes: e.target.value || null })}
          placeholder="Context (optional): their words, the objection, the colour"
          rows={1}
          className="min-h-[36px] resize-y py-2 text-xs"
          aria-label="Context for how the call ended"
        />
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-2.5">{inner}</div>;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Conversation Progress</h3>
      </div>
      {inner}
    </div>
  );
}
