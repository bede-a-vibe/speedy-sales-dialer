import * as React from "react";
import { cn } from "@/lib/utils";
import { CallOutcome, OUTCOME_CONFIG } from "@/data/mockData";
import {
  PhoneMissed, Voicemail, ThumbsDown, PhoneOff,
  CalendarClock, CalendarCheck, CircleX, UserX,
} from "lucide-react";

const ICONS: Record<string, React.ElementType> = {
  PhoneMissed, Voicemail, ThumbsDown, PhoneOff,
  CalendarClock, CalendarCheck, CircleX, UserX,
};

interface OutcomeButtonProps {
  outcome: CallOutcome;
  selected?: boolean;
  label?: string;
  hint?: string;
  /** Tighter padding and type for a two-column grid (the Log This Call panel). */
  compact?: boolean;
  onClick: (outcome: CallOutcome) => void;
}

export const OutcomeButton = React.forwardRef<HTMLButtonElement, OutcomeButtonProps>(
  ({ outcome, selected, label, hint, compact, onClick }, ref) => {
    const config = OUTCOME_CONFIG[outcome];
    const Icon = ICONS[config.icon];

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onClick(outcome)}
        title={config.description}
        aria-pressed={selected}
        className={cn(
          "flex min-w-0 items-center rounded-md border font-medium transition-all",
          compact ? "gap-1.5 px-2.5 py-1.5 text-xs" : "gap-2 px-3 py-2 text-sm",
          "hover:scale-[1.02] active:scale-[0.98]",
          selected
            ? `${config.color} border-transparent text-foreground`
            : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
        )}
      >
        {Icon && <Icon className={cn("shrink-0", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />}
        <span className="truncate">{label || config.label}</span>
        <div className={cn("ml-auto flex shrink-0 items-center", compact ? "gap-1" : "gap-2")}>
          {hint && (
            <span className={cn("font-medium uppercase tracking-widest text-primary/80", compact ? "text-[9px]" : "text-[10px]")}>
              {hint}
            </span>
          )}
          <kbd className={cn("rounded bg-background/30 font-mono opacity-50", compact ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]")}>
            {config.shortcut}
          </kbd>
        </div>
      </button>
    );
  },
);

OutcomeButton.displayName = "OutcomeButton";
