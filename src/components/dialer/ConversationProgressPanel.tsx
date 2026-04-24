import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCallOpeners } from "@/hooks/useCallOpeners";
import { STAGE_EXIT_REASONS, EXIT_STAGE_LABELS, type ExitStageKey } from "@/lib/funnelMetrics";
import { PhoneOff, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export interface ConversationProgressState {
  openerId: string | null;
  reachedConnection: boolean;
  reachedProblem: boolean;
  reachedSolution: boolean;
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
    (cleared as any)[field] = (state as any)[field];
  }
  return cleared;
}

export function ConversationProgressPanel({ value, onChange, outcomeIsBooked, embedded }: Props) {
  const { data: openers = [] } = useCallOpeners();

  const exitStage = useMemo(() => getExitStage(value, outcomeIsBooked), [value, outcomeIsBooked]);

  // Cascading: ticking a later stage auto-ticks earlier ones.
  const setStage = (
    stage: "reachedConnection" | "reachedProblem" | "reachedSolution" | "reachedCommitment",
    checked: boolean,
  ) => {
    const next = { ...value };
    if (checked) {
      if (stage === "reachedCommitment") {
        next.reachedConnection = true;
        next.reachedProblem = true;
        next.reachedSolution = true;
        next.reachedCommitment = true;
      } else if (stage === "reachedSolution") {
        next.reachedConnection = true;
        next.reachedProblem = true;
        next.reachedSolution = true;
      } else if (stage === "reachedProblem") {
        next.reachedConnection = true;
        next.reachedProblem = true;
      } else {
        next.reachedConnection = true;
      }
    } else {
      if (stage === "reachedConnection") {
        next.reachedConnection = false;
        next.reachedProblem = false;
        next.reachedSolution = false;
        next.reachedCommitment = false;
      } else if (stage === "reachedProblem") {
        next.reachedProblem = false;
        next.reachedSolution = false;
        next.reachedCommitment = false;
      } else if (stage === "reachedSolution") {
        next.reachedSolution = false;
        next.reachedCommitment = false;
      } else {
        next.reachedCommitment = false;
      }
    }
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
    !value.reachedCommitment &&
    value.exitReasonConnection === "hung_up_immediately";

  const tagImmediateHangUp = () => {
    if (isImmediateHangUp) {
      // Toggle off
      onChange({
        ...value,
        exitReasonConnection: null,
      });
      return;
    }
    onChange({
      ...value,
      reachedConnection: false,
      reachedProblem: false,
      reachedSolution: false,
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
      {!outcomeIsBooked && (
        <Button
          type="button"
          variant={isImmediateHangUp ? "destructive" : "outline"}
          size="sm"
          onClick={tagImmediateHangUp}
          className={cn(
            "h-8 w-full justify-start gap-2 text-xs",
            !isImmediateHangUp && "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          <PhoneOff className="h-3.5 w-3.5" />
          {isImmediateHangUp ? "Tagged: hang up during/after opener" : "Hang up during/after opener"}
        </Button>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Opener used</Label>
        <Select
          value={value.openerId ?? NONE}
          onValueChange={(v) => onChange({ ...value, openerId: v === NONE ? null : v })}
        >
          <SelectTrigger className="h-9 border-border bg-background text-sm">
            <SelectValue placeholder="Select opener (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None / not tracked</SelectItem>
            {openers.map((o) => (
              <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Stages reached</Label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <StageRow label="Connected" checked={value.reachedConnection} onChange={(c) => setStage("reachedConnection", c)} />
          <StageRow label="Problem" checked={value.reachedProblem} onChange={(c) => setStage("reachedProblem", c)} />
          <StageRow label="Solution" checked={value.reachedSolution} onChange={(c) => setStage("reachedSolution", c)} />
          <StageRow label="Commitment" checked={value.reachedCommitment} onChange={(c) => setStage("reachedCommitment", c)} />
        </div>
      </div>

      {exitStage && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Why did the call end here? <span className="text-foreground/60">({EXIT_STAGE_LABELS[exitStage]})</span>
          </Label>
          <Select value={currentExitValue ?? NONE} onValueChange={setExitReason}>
            <SelectTrigger className="h-9 border-border bg-background text-sm">
              <SelectValue placeholder="Select NEPQ reason (optional)" />
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
          <Textarea
            value={value.exitReasonNotes ?? ""}
            onChange={(e) => onChange({ ...value, exitReasonNotes: e.target.value || null })}
            placeholder="Optional context (objection wording, colour, etc.)"
            className="min-h-[60px] text-sm"
          />
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-3">{inner}</div>;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Conversation Progress</h3>
      </div>
      {inner}
    </div>
  );
}

function StageRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <span>{label}</span>
    </label>
  );
}
