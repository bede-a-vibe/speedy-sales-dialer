import * as React from "react";
import { cn } from "@/lib/utils";
import { CallOutcome, OUTCOME_CONFIG } from "@/data/mockData";
import {
  PhoneMissed, Voicemail, ThumbsDown, PhoneOff,
  CalendarClock, CalendarCheck, CircleX,
} from "lucide-react";

const ICONS: Record<string, React.ElementType> = {
  PhoneMissed, Voicemail, ThumbsDown, PhoneOff,
  CalendarClock, CalendarCheck, CircleX,
};

interface OutcomeButtonProps {
  outcome: CallOutcome;
  selected?: boolean;
  label?: string;
  hint?: string;
  onClick: (outcome: CallOutcome) => void;
}

export const OutcomeButton = React.forwardRef<HTMLButtonElement, OutcomeButtonProps>(
  ({ outcome, selected, label, hint, onClick }, ref) => {
    const config = OUTCOME_CONFIG[outcome];
    const Icon = ICONS[config.icon];

    return (
      <button
        ref={ref}
        type="button"
        onClick={() => onClick(outcome)}
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-all",
          "hover:scale-[1.02] active:scale-[0.98]",
          selected
            ? `${config.color} border-transparent text-foreground`
            : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
        )}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span>{label || config.label}</span>
        <div className="ml-auto flex items-center gap-2">
          {hint && (
            <span className="text-[10px] font-medium uppercase tracking-widest text-primary/80">
              {hint}
            </span>
          )}
          <kbd className="rounded bg-background/30 px-1.5 py-0.5 text-[10px] font-mono opacity-50">
            {config.shortcut}
          </kbd>
        </div>
      </button>
    );
  },
);

OutcomeButton.displayName = "OutcomeButton";
