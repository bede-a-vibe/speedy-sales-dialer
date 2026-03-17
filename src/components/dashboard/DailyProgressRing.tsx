import { useAuth } from "@/hooks/useAuth";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import { Target } from "lucide-react";

const DAILY_TARGET = 50;
const RADIUS = 54;
const STROKE = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DailyProgressRing() {
  const { user } = useAuth();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);
  const animatedCalls = useAnimatedCounter(todaysCalls);

  const pct = Math.min(todaysCalls / DAILY_TARGET, 1);
  const offset = CIRCUMFERENCE * (1 - pct);
  const isComplete = todaysCalls >= DAILY_TARGET;

  const ringColor = isComplete
    ? "hsl(var(--outcome-booked))"
    : pct > 0.66
    ? "hsl(var(--primary))"
    : pct > 0.33
    ? "hsl(var(--outcome-voicemail))"
    : "hsl(var(--outcome-not-interested))";

  return (
    <div className="rounded-lg border border-border bg-card p-5 flex flex-col items-center">
      <div className="flex items-center gap-2 mb-4 self-start">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Daily Target
        </h3>
      </div>

      <div className="relative w-[140px] h-[140px]">
        <svg
          className="w-full h-full -rotate-90"
          viewBox={`0 0 ${(RADIUS + STROKE) * 2} ${(RADIUS + STROKE) * 2}`}
        >
          <circle
            cx={RADIUS + STROKE}
            cy={RADIUS + STROKE}
            r={RADIUS}
            fill="none"
            stroke="hsl(var(--secondary))"
            strokeWidth={STROKE}
          />
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
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-mono text-foreground">
            {animatedCalls}
          </span>
          <span className="text-[10px] text-muted-foreground">
            / {DAILY_TARGET} calls
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground text-center">
        {isComplete
          ? "🎉 Target reached! Keep going!"
          : `${DAILY_TARGET - todaysCalls} more to hit today's goal`}
      </p>
    </div>
  );
}
