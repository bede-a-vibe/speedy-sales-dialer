import { useEffect, useState } from "react";
import { OutcomeButton } from "@/components/OutcomeButton";
import { CallOutcome } from "@/data/mockData";
import { DQ_REASONS, DNC_REASONS, OUTCOME_CONFIG, type DqReason, type DncReason } from "@/data/constants";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
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
  dqReason?: DqReason | null;
  onDqReasonChange?: (reason: DqReason | null) => void;
  dqNotes?: string;
  onDqNotesChange?: (notes: string) => void;
  dncReason?: DncReason | null;
  onDncReasonChange?: (reason: DncReason | null) => void;
  /** Call controls (status + Dialpad + Hang Up) rendered at the top, above the outcome buttons. */
  callControls?: React.ReactNode;
  /** When provided (mobile leads), shows a toggle to flag the mobile as reaching a gatekeeper. */
  mobileGatekeeper?: boolean;
  onMobileGatekeeperChange?: (v: boolean) => void;
  /** Current contact id — resets the gatekeeper toggle's local state when the lead changes. */
  contactId?: string;
}

const QUICK_OUTCOMES: CallOutcome[] = ["no_answer", "voicemail", "gatekeeper"];
const OTHER_OUTCOMES: CallOutcome[] = ["not_interested", "dnc", "disqualified", "follow_up", "booked"];

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
  dqReason = null,
  onDqReasonChange,
  dqNotes = "",
  onDqNotesChange,
  dncReason = null,
  onDncReasonChange,
  callControls,
  mobileGatekeeper = false,
  onMobileGatekeeperChange,
  contactId,
}: LogCallPanelProps) {
  // Local optimistic state so the toggle flips instantly on click. The persisted
  // value lives on session.currentContact, which doesn't refresh mid-call, so we
  // seed from the prop and reset whenever the lead changes.
  const [gatekeeperChecked, setGatekeeperChecked] = useState(mobileGatekeeper);
  useEffect(() => {
    setGatekeeperChecked(mobileGatekeeper);
    // Reset when the contact changes (seeded from that contact's stored value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

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

      {/* Call controls — status + Dialpad + Hang Up, right where the rep works the call */}
      {callControls && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
          {callControls}
        </div>
      )}

      {/* Quick outcomes — most common, top of panel */}
      <div className="space-y-2">{QUICK_OUTCOMES.map(renderOutcome)}</div>

      <SectionDivider label="Conversation" />

      <ConversationProgressPanel
        embedded
        value={conversationProgress}
        onChange={onConversationProgressChange}
        outcomeIsBooked={selectedOutcome === "booked"}
      />

      {onMobileGatekeeperChange && (
        <button
          type="button"
          onClick={() => {
            const next = !gatekeeperChecked;
            setGatekeeperChecked(next);
            onMobileGatekeeperChange(next);
          }}
          className={
            "flex w-full items-center gap-2 rounded border px-3 py-2 text-left text-xs transition-colors " +
            (gatekeeperChecked
              ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100"
              : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50")
          }
        >
          <span
            className={
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border " +
              (gatekeeperChecked ? "border-amber-500 bg-amber-500 text-white" : "border-muted-foreground/40")
            }
          >
            {gatekeeperChecked ? "✓" : ""}
          </span>
          Mobile reaches a gatekeeper (not the owner)
        </button>
      )}

      <SectionDivider label="Other Outcomes" />

      <div className="space-y-2">{OTHER_OUTCOMES.map(renderOutcome)}</div>

      {selectedOutcome === "disqualified" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-3">
          <div className="flex items-start gap-2 text-xs text-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Disqualify only if one of these is true:</p>
              <p className="text-muted-foreground">
                {OUTCOME_CONFIG.disqualified.description}
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              DQ Reason (required)
            </label>
            {DQ_REASONS.map((r) => (
              <label key={r.value} className="flex items-start gap-2 rounded border border-border bg-card/50 p-2 text-xs cursor-pointer hover:border-primary/50">
                <input
                  type="radio"
                  name="dq-reason"
                  className="mt-0.5"
                  checked={dqReason === r.value}
                  onChange={() => onDqReasonChange?.(r.value)}
                />
                <div>
                  <div className="font-medium text-foreground">{r.label}</div>
                  <div className="text-muted-foreground">{r.description}</div>
                </div>
              </label>
            ))}
          </div>
          <Textarea
            placeholder="Optional note (context for the DQ)"
            value={dqNotes}
            onChange={(e) => onDqNotesChange?.(e.target.value)}
            className="min-h-[60px] text-xs"
          />
        </div>
      )}

      {selectedOutcome === "dnc" && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            DNC Reason (optional)
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {DNC_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => onDncReasonChange?.(dncReason === r.value ? null : r.value)}
                className={
                  "rounded border px-2 py-1.5 text-left text-xs transition-colors " +
                  (dncReason === r.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50")
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default LogCallPanel;