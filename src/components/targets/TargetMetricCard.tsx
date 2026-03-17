import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { TargetProgressItem } from "@/lib/performanceTargets";

interface TargetMetricCardProps {
  item: TargetProgressItem;
  className?: string;
}

export function TargetMetricCard({ item, className }: TargetMetricCardProps) {
  const remainingValue = Math.max((item.targetValue ?? 0) - item.actualValue, 0);
  const progressLabel = item.hasTarget
    ? item.actualValue >= (item.targetValue ?? 0)
      ? "Target reached"
      : `${item.isRate ? `${Math.round(remainingValue)}%` : Math.round(remainingValue).toLocaleString()} left to goal`
    : "No target configured";

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
        </div>
        <p className="text-xs font-mono text-muted-foreground">
          {item.hasTarget ? `${item.formattedActual} / ${item.formattedTarget}` : item.formattedActual}
        </p>
      </div>

      <p className="mt-4 text-3xl font-bold font-mono text-foreground">{item.formattedActual}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {item.hasTarget ? `Target ${item.formattedTarget}` : "Set a target from Targets settings"}
      </p>

      <Progress value={item.progress} className="mt-4 h-2" />

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{progressLabel}</span>
        <span className="font-mono text-foreground">{Math.round(item.progress)}%</span>
      </div>
    </div>
  );
}
