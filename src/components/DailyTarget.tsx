import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { Target } from "lucide-react";

const DAILY_TARGET = 50;

export function DailyTarget() {
  const { user } = useAuth();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);

  const pct = Math.min(Math.round((todaysCalls / DAILY_TARGET) * 100), 100);
  const isComplete = todaysCalls >= DAILY_TARGET;

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
