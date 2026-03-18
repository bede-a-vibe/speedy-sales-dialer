import { useMemo } from "react";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";
import { Target } from "lucide-react";

const DEFAULT_DAILY_TARGET = 50;

export function DailyTarget() {
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

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Daily Target
          </span>
        </div>
        <span className="text-sm font-bold font-mono text-foreground">
          {todaysCalls}/{DAILY_TARGET}
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
          : `${DAILY_TARGET - todaysCalls} more calls to hit today's target`}
      </p>
    </div>
  );
}
