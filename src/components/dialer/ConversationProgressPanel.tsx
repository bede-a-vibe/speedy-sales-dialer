import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCallOpeners } from "@/hooks/useCallOpeners";
import { DROP_OFF_REASONS, DROP_OFF_LABELS, type DropOffReason } from "@/lib/funnelMetrics";
import { TrendingUp } from "lucide-react";

const NONE = "__none__";

export interface ConversationProgressState {
  openerId: string | null;
  reachedConnection: boolean;
  reachedProblem: boolean;
  reachedSolution: boolean;
  reachedCommitment: boolean;
  dropOffReason: DropOffReason | null;
}

export const EMPTY_CONVERSATION_PROGRESS: ConversationProgressState = {
  openerId: null,
  reachedConnection: false,
  reachedProblem: false,
  reachedSolution: false,
  reachedCommitment: false,
  dropOffReason: null,
};

interface Props {
  value: ConversationProgressState;
  onChange: (next: ConversationProgressState) => void;
}

export function ConversationProgressPanel({ value, onChange }: Props) {
  const { data: openers = [] } = useCallOpeners();

  // Cascading: ticking a later stage auto-ticks earlier ones.
  const setStage = (
    stage: "reachedConnection" | "reachedProblem" | "reachedSolution" | "reachedCommitment",
    checked: boolean,
  ) => {
    const next = { ...value };
    if (checked) {
      // Cascade earlier on
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
      // Untick this and any later stages
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
    onChange(next);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Conversation Progress</h3>
      </div>

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
        <div className="space-y-1.5">
          <StageRow label="Connected (>15s real conversation)" checked={value.reachedConnection} onChange={(c) => setStage("reachedConnection", c)} />
          <StageRow label="Problem Awareness" checked={value.reachedProblem} onChange={(c) => setStage("reachedProblem", c)} />
          <StageRow label="Solution Awareness" checked={value.reachedSolution} onChange={(c) => setStage("reachedSolution", c)} />
          <StageRow label="Verbal Commitment" checked={value.reachedCommitment} onChange={(c) => setStage("reachedCommitment", c)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Drop-off reason (if lost)</Label>
        <Select
          value={value.dropOffReason ?? NONE}
          onValueChange={(v) => onChange({ ...value, dropOffReason: v === NONE ? null : (v as DropOffReason) })}
        >
          <SelectTrigger className="h-9 border-border bg-background text-sm">
            <SelectValue placeholder="Select reason (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>None / N/A</SelectItem>
            {DROP_OFF_REASONS.map((r) => (
              <SelectItem key={r} value={r}>{DROP_OFF_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
