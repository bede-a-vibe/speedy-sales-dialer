import { useAuth } from "@/hooks/useAuth";
import { useTodayCallCount, useCallLogs } from "@/hooks/useCallLogs";
import { useStreak } from "@/hooks/useStreak";
import { Award, Zap, Target, Trophy, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Achievement {
  id: string;
  label: string;
  description: string;
  Icon: React.ElementType;
  unlocked: boolean;
  color: string;
}

const DAILY_TARGET = 50;

export function AchievementBadges() {
  const { user } = useAuth();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);
  const { data: callLogs = [] } = useCallLogs();
  const { data: streak = 0 } = useStreak(user?.id);

  const myLogs = callLogs.filter((l: any) => l.user_id === user?.id);
  const todaysBookings = callLogs.filter(
    (l: any) =>
      l.user_id === user?.id &&
      l.outcome === "booked" &&
      l.created_at?.slice(0, 10) === new Date().toISOString().slice(0, 10)
  ).length;

  const achievements: Achievement[] = [
    {
      id: "first-blood",
      label: "First Blood",
      description: "Made your first call today",
      Icon: Zap,
      unlocked: todaysCalls >= 1,
      color: "text-primary",
    },
    {
      id: "hot-streak",
      label: "Hot Streak",
      description: `${streak}+ day calling streak`,
      Icon: Award,
      unlocked: streak >= 3,
      color: "text-[hsl(var(--outcome-voicemail))]",
    },
    {
      id: "closer",
      label: "Closer",
      description: "5+ bookings today",
      Icon: Star,
      unlocked: todaysBookings >= 5,
      color: "text-[hsl(var(--outcome-booked))]",
    },
    {
      id: "centurion",
      label: "Centurion",
      description: "100+ total calls",
      Icon: Trophy,
      unlocked: myLogs.length >= 100,
      color: "text-primary",
    },
    {
      id: "perfect-day",
      label: "Perfect Day",
      description: "Hit daily target",
      Icon: Target,
      unlocked: todaysCalls >= DAILY_TARGET,
      color: "text-[hsl(var(--outcome-booked))]",
    },
  ];

  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Achievements
          </h3>
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {unlockedCount}/{achievements.length} unlocked
        </span>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {achievements.map((a) => (
          <div
            key={a.id}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
              a.unlocked
                ? "border-primary/30 bg-primary/5 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.3)]"
                : "border-border bg-muted/30 opacity-40 grayscale"
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full",
                a.unlocked ? "bg-primary/10" : "bg-muted"
              )}
            >
              <a.Icon
                className={cn(
                  "h-4.5 w-4.5",
                  a.unlocked ? a.color : "text-muted-foreground"
                )}
              />
            </div>
            <span
              className={cn(
                "text-[10px] font-semibold leading-tight",
                a.unlocked ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {a.label}
            </span>
            <span className="text-[9px] text-muted-foreground leading-tight">
              {a.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
