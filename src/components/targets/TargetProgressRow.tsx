import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TargetProgressItem } from "@/lib/performanceTargets";

interface TargetProgressRowProps {
  item: TargetProgressItem;
}

function getBarColor(progress: number, hasTarget: boolean) {
  if (!hasTarget) return "bg-muted-foreground/30";
  if (progress >= 100) return "bg-emerald-500";
  if (progress >= 66) return "bg-blue-500";
  if (progress >= 33) return "bg-amber-500";
  return "bg-rose-500";
}

function formatRemaining(item: TargetProgressItem): string {
  if (!item.hasTarget || item.targetValue == null) return "—";
  const remaining = item.targetValue - item.actualValue;
  if (remaining <= 0) return "Goal met";
  if (item.isRate) return `${Math.max(0, Math.round(remaining))}% to go`;
  return `${Math.max(0, Math.round(remaining)).toLocaleString()} to go`;
}

export function TargetProgressRow({ item }: TargetProgressRowProps) {
  const isComplete = item.hasTarget && item.progress >= 100;
  const barColor = getBarColor(item.progress, item.hasTarget);
  const pctLabel = item.hasTarget ? `${Math.round(item.progress)}%` : "—";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/40",
        isComplete && "bg-emerald-500/5",
      )}
    >
      <div className="flex w-44 min-w-0 items-center gap-1.5 shrink-0">
        {isComplete ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        ) : null}
        <span className="truncate text-xs font-medium text-foreground" title={item.label}>
          {item.label}
        </span>
      </div>
      <div className="w-28 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        <span className="text-foreground">{item.formattedActual}</span>
        <span className="mx-1 opacity-50">/</span>
        <span>{item.formattedTarget}</span>
      </div>
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", barColor)}
            style={{ width: `${Math.min(item.progress, 100)}%` }}
          />
        </div>
        <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {pctLabel}
        </span>
      </div>
      <div className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
        {formatRemaining(item)}
      </div>
    </div>
  );
}
