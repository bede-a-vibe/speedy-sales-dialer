import { useMemo } from "react";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_DAILY_TARGET = 50;

interface DailyTargetProps {
  /** Slim single-line progress bar for in-session strips. */
  compact?: boolean;
  className?: string;
}

export function DailyTarget({ compact = false, className }: DailyTargetProps = {}) {
  const { user } = useAuth();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);
  const { data: targets = [] } = usePerformanceTargets();
  const dailyTarget = useMemo(() => {
    if (!user?.id) return DEFAULT_DAILY_TARGET;
    const derived = deriveAllTargets(targets);
    const dialTarget = derived.individualDaily.find(
      (t) => t.user_id === user.id && t.metric_key === "dials"
    );
    return dialTarget?.target_value && dialTarget.target_value > 0
      ? Math.round(dialTarget.target_value)
      : DEFAULT_DAILY_TARGET;
  }, [targets, user?.id]);

  const pct = Math.min(Math.round((todaysCalls / dailyTarget) * 100), 100);
  const isComplete = todaysCalls >= dailyTarget;

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2.5", className)} title={`Daily target: ${todaysCalls}/${dailyTarget}`}>
        <Target className="h-3 w-3 text-primary shrink-0" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium whitespace-nowrap">Daily</span>
        <span className="font-mono text-[11px] font-bold text-foreground tabular-nums whitespace-nowrap">
          {todaysCalls}/{dailyTarget}
        </span>
        <div className="min-w-[80px] flex-1 h-1 rounded-full bg-secondary overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isComplete ? "bg-[hsl(var(--outcome-booked))]" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("bg-card border border-border rounded-lg p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Daily Target
          </span>
        </div>
        <span className="text-sm font-bold font-mono text-foreground">
          {todaysCalls}/{dailyTarget}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isComplete ? "bg-[hsl(var(--outcome-booked))]" : "bg-primary"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        {isComplete
          ? "🎉 Target reached! Keep going!"
          : `${dailyTarget - todaysCalls} more calls to hit today's target`}
      </p>
    </div>
  );
}
