import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTodayCallCount, useCallLogs } from "@/hooks/useCallLogs";
import { useStreak } from "@/hooks/useStreak";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";
import { Award, Zap, Target, Trophy, Star, Phone, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfettiBurst, useConfettiTrigger } from "@/components/dashboard/ConfettiBurst";

interface Achievement {
  id: string;
  label: string;
  description: string;
  Icon: React.ElementType;
  unlocked: boolean;
  progress: number;
  color: string;
  glowColor: string;
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
  const todaysAnswered = callLogs.filter(
    (l: any) =>
      l.user_id === user?.id &&
      l.created_at?.slice(0, 10) === today &&
      ["not_interested", "dnc", "follow_up", "booked"].includes(l.outcome),
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
      glowColor: "--primary",
    },
    {
      id: "warm-up",
      label: "Warmed Up",
      description: "10 calls today",
      Icon: Phone,
      unlocked: todaysCalls >= 10,
      progress: Math.min((todaysCalls / 10) * 100, 100),
      color: "text-[hsl(var(--outcome-follow-up))]",
      glowColor: "--outcome-follow-up",
    },
    {
      id: "on-fire",
      label: "On Fire",
      description: "25 calls today",
      Icon: TrendingUp,
      unlocked: todaysCalls >= 25,
      progress: Math.min((todaysCalls / 25) * 100, 100),
      color: "text-[hsl(var(--outcome-voicemail))]",
      glowColor: "--outcome-voicemail",
    },
    {
      id: "perfect-day",
      label: "Target Hit",
      description: `${DAILY_TARGET} calls today`,
      Icon: Target,
      unlocked: todaysCalls >= DAILY_TARGET,
      progress: Math.min((todaysCalls / DAILY_TARGET) * 100, 100),
      color: "text-[hsl(var(--outcome-booked))]",
      glowColor: "--outcome-booked",
    },
    {
      id: "closer",
      label: "Closer",
      description: "Book an appointment",
      Icon: Star,
      unlocked: todaysBookings >= 1,
      progress: Math.min(todaysBookings >= 1 ? 100 : 0, 100),
      color: "text-[hsl(var(--outcome-booked))]",
      glowColor: "--outcome-booked",
    },
    {
      id: "hot-streak",
      label: "Hot Streak",
      description: "3+ day streak",
      Icon: Award,
      unlocked: streak >= 3,
      progress: Math.min((streak / 3) * 100, 100),
      color: "text-[hsl(var(--outcome-voicemail))]",
      glowColor: "--outcome-voicemail",
    },
    {
      id: "centurion",
      label: "Centurion",
      description: "100+ total calls",
      Icon: Trophy,
      unlocked: myLogs.length >= 100,
      progress: Math.min((myLogs.length / 100) * 100, 100),
      color: "text-primary",
      glowColor: "--primary",
    },
  ];

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const confettiActive = useConfettiTrigger(unlockedCount > 0);

  return (
    <div className="relative rounded-xl border border-border bg-card p-5 overflow-hidden">
      <ConfettiBurst active={confettiActive} />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Today's Achievements
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-bold text-primary">{unlockedCount}</span>
          <span className="text-xs text-muted-foreground">/ {achievements.length}</span>
        </div>
      </div>

      {/* Progress bar showing overall unlock progress */}
      <div className="h-1.5 w-full rounded-full bg-secondary mb-5 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
          style={{ width: `${(unlockedCount / achievements.length) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-7 gap-2">
        {achievements.map((a) => (
          <AchievementBadge key={a.id} achievement={a} />
        ))}
      </div>
    </div>
  );
}

function AchievementBadge({ achievement: a }: { achievement: Achievement }) {
  return (
    <div
      className={cn(
        "group relative flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all duration-500",
        a.unlocked
          ? `border-[hsl(var(${a.glowColor})]/30 bg-[hsl(var(${a.glowColor})]/5 shadow-[0_0_16px_-4px_hsl(var(${a.glowColor})/0.35)]`
          : "border-border bg-muted/20",
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-500",
          a.unlocked ? `bg-[hsl(var(${a.glowColor})]/15` : "bg-muted",
        )}
      >
        <a.Icon
          className={cn(
            "h-5 w-5 transition-all",
            a.unlocked ? `${a.color} drop-shadow-sm` : "text-muted-foreground/40",
          )}
        />
      </div>

      {/* Label */}
      <span
        className={cn(
          "text-[10px] font-bold leading-tight tracking-wide uppercase",
          a.unlocked ? "text-foreground" : "text-muted-foreground/50",
        )}
      >
        {a.label}
      </span>

      {/* Mini progress ring under each badge */}
      {!a.unlocked && (
        <div className="h-1 w-full max-w-[40px] rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full bg-muted-foreground/30 transition-all duration-500"
            style={{ width: `${a.progress}%` }}
          />
        </div>
      )}

      {a.unlocked && (
        <span className="text-[9px] text-muted-foreground">✓ Unlocked</span>
      )}
    </div>
  );
}
