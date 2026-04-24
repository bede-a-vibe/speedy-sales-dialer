import { OutcomeButton } from "@/components/OutcomeButton";
import { CallOutcome } from "@/data/mockData";
import {
  ConversationProgressPanel,
  type ConversationProgressState,
} from "./ConversationProgressPanel";

interface LogCallPanelProps {
  selectedOutcome: CallOutcome | null;
  onOutcomeClick: (outcome: CallOutcome) => void;
  isFastLogOutcome: (outcome: CallOutcome) => boolean;
  canSubmit: boolean;
  conversationProgress: ConversationProgressState;
  onConversationProgressChange: (next: ConversationProgressState) => void;
}

const QUICK_OUTCOMES: CallOutcome[] = ["no_answer", "voicemail"];
const OTHER_OUTCOMES: CallOutcome[] = ["not_interested", "dnc", "follow_up", "booked"];

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function LogCallPanel({
  selectedOutcome,
  onOutcomeClick,
  isFastLogOutcome,
  canSubmit,
  conversationProgress,
  onConversationProgressChange,
}: LogCallPanelProps) {
  const renderOutcome = (outcome: CallOutcome) => {
    const isSelected = selectedOutcome === outcome;
    const canFastLogThisOutcome = canSubmit && isFastLogOutcome(outcome);
    return (
      <OutcomeButton
        key={outcome}
        outcome={outcome}
        label={outcome === "booked" ? "Book" : undefined}
        selected={isSelected}
        hint={isSelected && canFastLogThisOutcome ? "Click again to save" : undefined}
        onClick={onOutcomeClick}
      />
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Log This Call
        </span>
        <span className="text-[10px] uppercase tracking-widest text-primary">Required</span>
      </div>

      {/* Quick outcomes — most common, top of panel */}
      <div className="space-y-2">{QUICK_OUTCOMES.map(renderOutcome)}</div>

      <SectionDivider label="Conversation" />

      <ConversationProgressPanel
        embedded
        value={conversationProgress}
        onChange={onConversationProgressChange}
        outcomeIsBooked={selectedOutcome === "booked"}
      />

      <SectionDivider label="Other Outcomes" />

      <div className="space-y-2">{OTHER_OUTCOMES.map(renderOutcome)}</div>
    </div>
  );
}

export default LogCallPanel;