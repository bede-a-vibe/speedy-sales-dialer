import { cn } from "@/lib/utils";
import { CheckCircle } from "lucide-react";
import { ConfettiBurst, useConfettiTrigger } from "@/components/dashboard/ConfettiBurst";
import type { TargetProgressItem } from "@/lib/performanceTargets";

interface TargetMetricCardProps {
  item: TargetProgressItem;
  className?: string;
}

function getProgressColor(pct: number) {
  if (pct >= 100) return "bg-[hsl(var(--outcome-booked))]";
  if (pct >= 66) return "bg-primary";
  if (pct >= 33) return "bg-[hsl(var(--outcome-voicemail))]";
  return "bg-[hsl(var(--outcome-not-interested))]";
}

export function TargetMetricCard({ item, className }: TargetMetricCardProps) {
  const remainingValue = Math.max((item.targetValue ?? 0) - item.actualValue, 0);
  const isComplete = item.hasTarget && item.actualValue >= (item.targetValue ?? 0);
  const confettiActive = useConfettiTrigger(isComplete);

  const progressLabel = item.hasTarget
    ? isComplete
      ? "🎉 Target smashed!"
      : `${item.isRate ? `${Math.round(remainingValue)}%` : Math.round(remainingValue).toLocaleString()} left to goal`
    : "No target configured";

  return (
    <div
      className={cn(
        "relative rounded-lg border p-4 transition-all duration-500",
        isComplete
          ? "border-[hsl(var(--outcome-booked))]/40 bg-[hsl(var(--outcome-booked))]/5 shadow-[0_0_20px_-6px_hsl(var(--outcome-booked)/0.3)]"
          : "border-border bg-card",
        className
      )}
    >
      <ConfettiBurst active={confettiActive} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {isComplete && <CheckCircle className="h-4 w-4 text-[hsl(var(--outcome-booked))]" />}
          <p className="text-xs font-mono text-muted-foreground">
            {item.hasTarget ? `${item.formattedActual} / ${item.formattedTarget}` : item.formattedActual}
          </p>
        </div>
      </div>

      <p className="mt-4 text-3xl font-bold font-mono text-foreground">{item.formattedActual}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {item.hasTarget ? `Target ${item.formattedTarget}` : "Set a target from Targets settings"}
      </p>

      <div className="mt-4 relative">
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700 ease-out", getProgressColor(item.progress))}
            style={{ width: `${Math.min(item.progress, 100)}%` }}
          />
        </div>
        {item.hasTarget && (
          <div className="absolute top-0 left-0 w-full h-2 pointer-events-none">
            {[25, 50, 75].map((mark) => (
              <div
                key={mark}
                className="absolute top-0 h-2 w-px bg-foreground/15"
                style={{ left: `${mark}%` }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className={cn("text-muted-foreground", isComplete && "font-semibold text-[hsl(var(--outcome-booked))]")}>
          {progressLabel}
        </span>
        <span className="font-mono text-foreground">{Math.round(item.progress)}%</span>
      </div>
    </div>
  );
}
