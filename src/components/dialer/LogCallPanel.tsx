import { useEffect, useState } from "react";
import { OutcomeButton } from "@/components/OutcomeButton";
import { CallOutcome } from "@/data/mockData";
import { DQ_REASONS, DNC_REASONS, OUTCOME_CONFIG, type DqReason, type DncReason } from "@/data/constants";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Mail, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
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
  /** One-tap dropped-call recovery: fills progress + schedules an immediate ring-back. */
  onCallDropped?: () => void;
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
  /** Flag this lead for the end-of-day email round; persisted when the call is logged. */
  emailFlag?: boolean;
  onEmailFlagChange?: (v: boolean) => void;
}

/**
 * Every outcome in one two-column grid, most frequent first, the two
 * bookings together, the two hard stops last. The number key on each button
 * is the shortcut (1 to 8), unchanged from before the grid.
 */
const OUTCOME_ORDER: CallOutcome[] = [
  "no_answer", "voicemail",
  "gatekeeper", "not_interested",
  "follow_up", "booked",
  "dnc", "disqualified",
];

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function FlagChip({
  checked,
  onClick,
  icon,
  label,
  hint,
  tone = "primary",
}: {
  checked: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  tone?: "primary" | "amber";
}) {
  const onClasses = tone === "amber"
    ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100"
    : "border-primary/50 bg-primary/10 text-foreground";
  const boxOn = tone === "amber" ? "border-amber-500 bg-amber-500 text-white" : "border-primary bg-primary text-primary-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      title={hint}
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded border px-2 py-1.5 text-left text-xs transition-colors",
        checked ? onClasses : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
      )}
    >
      <span className={cn("flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px]", checked ? boxOn : "border-muted-foreground/40")}>
        {checked ? "✓" : ""}
      </span>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Log This Call, condensed to one screen (Bede, 29 Oct 2026): call strip,
 * all eight outcomes in a grid, the conversation block, the two flags as
 * chips, then the DQ or DNC reasons only when that outcome is picked.
 */
export function LogCallPanel({
  selectedOutcome,
  onOutcomeClick,
  isFastLogOutcome,
  canSubmit,
  conversationProgress,
  onConversationProgressChange,
  onCallDropped,
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
  emailFlag = false,
  onEmailFlagChange,
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
        compact
        label={outcome === "booked" ? "Book" : undefined}
        selected={isSelected}
        hint={isSelected && canFastLogThisOutcome ? "again = save" : undefined}
        onClick={onOutcomeClick}
      />
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
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

      {/* Every outcome, one grid. Number keys 1 to 8 still select them. */}
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Call outcome">
        {OUTCOME_ORDER.map(renderOutcome)}
      </div>

      {selectedOutcome === "disqualified" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 space-y-2">
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              <span className="font-medium text-foreground">DQ reason, required.</span> {OUTCOME_CONFIG.disqualified.description}
            </span>
          </p>
          {/* A real radio group: arrow keys move between reasons, one tab stop. */}
          <RadioGroupPrimitive.Root
            value={dqReason ?? ""}
            onValueChange={(v) => onDqReasonChange?.(v as DqReason)}
            aria-label="DQ reason"
            className="grid grid-cols-2 gap-1.5"
          >
            {DQ_REASONS.map((r) => (
              <label key={r.value} title={r.description} className="relative block">
                <RadioGroupPrimitive.Item value={r.value} className="peer sr-only" />
                <span
                  className={cn(
                    "block cursor-pointer rounded border px-2 py-1.5 text-left text-xs transition-colors",
                    "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
                    "peer-data-[state=checked]:border-destructive peer-data-[state=checked]:bg-destructive/10 peer-data-[state=checked]:text-foreground",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1",
                  )}
                >
                  {r.label}
                </span>
              </label>
            ))}
          </RadioGroupPrimitive.Root>
          <Textarea
            placeholder="Optional note (context for the DQ)"
            value={dqNotes}
            onChange={(e) => onDqNotesChange?.(e.target.value)}
            rows={1}
            className="min-h-[36px] py-2 text-xs"
          />
        </div>
      )}

      {selectedOutcome === "dnc" && (
        <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            DNC reason (optional)
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {DNC_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                aria-pressed={dncReason === r.value}
                onClick={() => onDncReasonChange?.(dncReason === r.value ? null : r.value)}
                className={cn(
                  "rounded border px-2 py-1.5 text-left text-xs transition-colors",
                  dncReason === r.value
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <SectionDivider label="Conversation" />

      <ConversationProgressPanel
        embedded
        value={conversationProgress}
        onChange={onConversationProgressChange}
        outcomeIsBooked={selectedOutcome === "booked"}
        onCallDropped={onCallDropped}
      />

      {(onMobileGatekeeperChange || onEmailFlagChange) && (
        <div className="flex flex-wrap gap-1.5">
          {onMobileGatekeeperChange && (
            <FlagChip
              checked={gatekeeperChecked}
              tone="amber"
              icon={<Shield className="h-3.5 w-3.5 shrink-0" />}
              label="Mobile reaches a gatekeeper"
              onClick={() => {
                const next = !gatekeeperChecked;
                setGatekeeperChecked(next);
                onMobileGatekeeperChange(next);
              }}
            />
          )}
          {onEmailFlagChange && (
            <FlagChip
              checked={emailFlag}
              icon={<Mail className="h-3.5 w-3.5 shrink-0" />}
              label="Worth an email tonight"
              hint="Flagged leads get a draft on the End of Day page"
              onClick={() => onEmailFlagChange(!emailFlag)}
            />
          )}
        </div>
      )}

    </div>
  );
}
