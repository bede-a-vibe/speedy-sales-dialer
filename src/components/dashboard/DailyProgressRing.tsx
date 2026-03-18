import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfettiBurst, useConfettiTrigger } from "@/components/dashboard/ConfettiBurst";

const DEFAULT_DAILY_TARGET = 50;
const RADIUS = 58;
const STROKE = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function useIndividualDialTarget(userId?: string): number {
  const { data: targets = [] } = usePerformanceTargets();
  return useMemo(() => {
    if (!userId) return DEFAULT_DAILY_TARGET;
    const derived = deriveAllTargets(targets);
    const dialTarget = derived.individualDaily.find(
      (t) => t.user_id === userId && t.metric_key === "dials"
    );
    return dialTarget?.target_value && dialTarget.target_value > 0
      ? Math.round(dialTarget.target_value)
      : DEFAULT_DAILY_TARGET;
  }, [targets, userId]);
}

export function DailyProgressRing() {
  const { user } = useAuth();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);
  const dailyTarget = useIndividualDialTarget(user?.id);
  const animatedCalls = useAnimatedCounter(todaysCalls);

  const pct = Math.min(todaysCalls / dailyTarget, 1);
  const offset = CIRCUMFERENCE * (1 - pct);
  const isComplete = todaysCalls >= dailyTarget;
  const remaining = Math.max(dailyTarget - todaysCalls, 0);

  const confettiActive = useConfettiTrigger(isComplete);

  const ringColor = isComplete
    ? "hsl(var(--outcome-booked))"
    : pct > 0.66
      ? "hsl(var(--primary))"
      : pct > 0.33
        ? "hsl(var(--outcome-voicemail))"
        : "hsl(var(--muted-foreground))";

  return (
    <div
      className={cn(
        "relative rounded-xl border p-6 flex flex-col items-center justify-center transition-all duration-700",
        isComplete
          ? "border-[hsl(var(--outcome-booked))]/40 bg-[hsl(var(--outcome-booked))]/5 shadow-[0_0_30px_-8px_hsl(var(--outcome-booked)/0.3)]"
          : "border-border bg-card",
      )}
    >
      <ConfettiBurst active={confettiActive} />

      <div className="relative w-[150px] h-[150px]">
        <svg
          className="w-full h-full -rotate-90"
          viewBox={`0 0 ${(RADIUS + STROKE) * 2} ${(RADIUS + STROKE) * 2}`}
        >
          {/* Track */}
          <circle
            cx={RADIUS + STROKE}
            cy={RADIUS + STROKE}
            r={RADIUS}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth={STROKE}
          />
          {/* Progress */}
          <circle
            cx={RADIUS + STROKE}
            cy={RADIUS + STROKE}
            r={RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
            style={{
              filter: isComplete ? `drop-shadow(0 0 6px ${ringColor})` : undefined,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn(
            "text-4xl font-black font-mono",
            isComplete ? "text-[hsl(var(--outcome-booked))]" : "text-foreground",
          )}>
            {animatedCalls}
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">
            / {DAILY_TARGET} calls
          </span>
        </div>
      </div>

      <div className="mt-3 text-center">
        {isComplete ? (
          <div className="flex items-center gap-1 text-xs font-bold text-[hsl(var(--outcome-booked))]">
            <ChevronUp className="h-3.5 w-3.5" />
            Target smashed! Keep going!
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            <span className="font-bold font-mono text-foreground">{remaining}</span> more to hit today's goal
          </p>
        )}
      </div>
    </div>
  );
}
