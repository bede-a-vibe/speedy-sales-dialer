import { cn } from "@/lib/utils";
import { CallOutcome, OUTCOME_CONFIG } from "@/data/mockData";
import {
  PhoneMissed, Voicemail, ThumbsDown, PhoneOff,
  CalendarClock, CalendarCheck, CircleX
} from "lucide-react";

const ICONS: Record<string, React.ElementType> = {
  PhoneMissed, Voicemail, ThumbsDown, PhoneOff,
  CalendarClock, CalendarCheck, CircleX,
};

interface OutcomeButtonProps {
  outcome: CallOutcome;
  selected?: boolean;
  onClick: (outcome: CallOutcome) => void;
}

export function OutcomeButton({ outcome, selected, onClick }: OutcomeButtonProps) {
  const config = OUTCOME_CONFIG[outcome];
  const Icon = ICONS[config.icon];

  return (
    <button
      onClick={() => onClick(outcome)}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all",
        "hover:scale-[1.02] active:scale-[0.98]",
        selected
          ? `${config.color} text-foreground border-transparent`
          : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span>{config.label}</span>
      <kbd className="ml-auto text-[10px] font-mono opacity-50 bg-background/30 px-1.5 py-0.5 rounded">
        {config.shortcut}
      </kbd>
    </button>
  );
}
