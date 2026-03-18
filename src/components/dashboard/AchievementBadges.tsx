import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTodayCallCount, useCallLogs } from "@/hooks/useCallLogs";
import { useStreak } from "@/hooks/useStreak";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";
import { Award, Zap, Target, Trophy, Star, Phone, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Achievement {
  id: string;
  label: string;
  description: string;
  Icon: React.ElementType;
  unlocked: boolean;
  progress: number;
  color: string;
}

const DEFAULT_DAILY_TARGET = 50;

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

export function AchievementBadges() {
  const { user } = useAuth();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);
  const { data: callLogs = [] } = useCallLogs();
  const { data: streak = 0 } = useStreak(user?.id);
  const dailyTarget = useIndividualDialTarget(user?.id);

  const myLogs = callLogs.filter((l: any) => l.user_id === user?.id);
  const today = new Date().toISOString().slice(0, 10);
  const todaysBookings = callLogs.filter(
    (l: any) => l.user_id === user?.id && l.outcome === "booked" && l.created_at?.slice(0, 10) === today,
  ).length;

  const achievements: Achievement[] = [
    {
      id: "first-blood",
      label: "First Blood",
      description: "Make your first call today",
      Icon: Zap,
      unlocked: todaysCalls >= 1,
      progress: Math.min(todaysCalls >= 1 ? 100 : 0, 100),
      color: "text-primary",
    },
    {
      id: "warm-up",
      label: "Warmed Up",
      description: "10 calls today",
      Icon: Phone,
      unlocked: todaysCalls >= 10,
      progress: Math.min((todaysCalls / 10) * 100, 100),
      color: "text-[hsl(var(--outcome-follow-up))]",
    },
    {
      id: "on-fire",
      label: "On Fire",
      description: "25 calls today",
      Icon: TrendingUp,
      unlocked: todaysCalls >= 25,
      progress: Math.min((todaysCalls / 25) * 100, 100),
      color: "text-[hsl(var(--outcome-voicemail))]",
    },
    {
      id: "perfect-day",
      label: "Target Hit",
      description: `${dailyTarget} calls today`,
      Icon: Target,
      unlocked: todaysCalls >= dailyTarget,
      progress: Math.min((todaysCalls / dailyTarget) * 100, 100),
      color: "text-[hsl(var(--outcome-booked))]",
    },
    {
      id: "closer",
      label: "Closer",
      description: "Book an appointment",
      Icon: Star,
      unlocked: todaysBookings >= 1,
      progress: Math.min(todaysBookings >= 1 ? 100 : 0, 100),
      color: "text-[hsl(var(--outcome-booked))]",
    },
    {
      id: "hot-streak",
      label: "Hot Streak",
      description: "3+ day streak",
      Icon: Award,
      unlocked: streak >= 3,
      progress: Math.min((streak / 3) * 100, 100),
      color: "text-[hsl(var(--outcome-voicemail))]",
    },
    {
      id: "centurion",
      label: "Centurion",
      description: "100+ total calls",
      Icon: Trophy,
      unlocked: myLogs.length >= 100,
      progress: Math.min((myLogs.length / 100) * 100, 100),
      color: "text-primary",
    },
  ];

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground mr-1">
          {unlockedCount}/{achievements.length}
        </span>
        {achievements.map((a) => (
          <Tooltip key={a.id}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all text-xs",
                  a.unlocked
                    ? "border-primary/25 bg-primary/5"
                    : "border-border bg-muted/30 opacity-50",
                )}
              >
                <a.Icon
                  className={cn(
                    "h-3.5 w-3.5",
                    a.unlocked ? a.color : "text-muted-foreground/50",
                  )}
                />
                <span
                  className={cn(
                    "font-medium",
                    a.unlocked ? "text-foreground" : "text-muted-foreground/60",
                  )}
                >
                  {a.label}
                </span>
                {a.unlocked && <span className="text-[10px]">✓</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {a.description}
              {!a.unlocked && ` (${Math.round(a.progress)}%)`}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
