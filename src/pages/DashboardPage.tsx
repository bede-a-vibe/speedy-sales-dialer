import { useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { DashboardTargetsOverview } from "@/components/targets/DashboardTargetsOverview";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import { TeamLeaderboard } from "@/components/TeamLeaderboard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { AchievementBadges } from "@/components/dashboard/AchievementBadges";
import { DailyProgressRing } from "@/components/dashboard/DailyProgressRing";
import { MilestonePopup } from "@/components/dashboard/MilestonePopup";
import { useCallLogs, useTodayCallCount } from "@/hooks/useCallLogs";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";
import { useAuth } from "@/hooks/useAuth";
import { OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: callLogs = [] } = useCallLogs();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);
  const { data: targets = [] } = usePerformanceTargets();

  const dailyTarget = useMemo(() => {
    if (!user?.id) return 50;
    const derived = deriveAllTargets(targets);
    const dt = derived.individualDaily.find(
      (t) => t.user_id === user.id && t.metric_key === "dials"
    );
    return dt?.target_value && dt.target_value > 0 ? Math.round(dt.target_value) : 50;
  }, [targets, user?.id]);

  const today = new Date().toISOString().slice(0, 10);
  const todaysLogs = callLogs.filter(
    (l: any) => l.user_id === user?.id && l.created_at?.slice(0, 10) === today,
  );

  const outcomeCounts = todaysLogs.reduce<Partial<Record<string, number>>>((acc, log) => {
    acc[log.outcome] = (acc[log.outcome] || 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <MilestonePopup todaysCalls={todaysCalls} dailyTarget={dailyTarget} />
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Row 1: Greeting */}
        <DashboardGreeting />

        {/* Row 2: Achievements with confetti & gamification */}
        <AchievementBadges />

        {/* Row 3: Progress ring + today's outcomes */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          <DailyProgressRing />

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">
              Today's Outcomes
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {(Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((outcome) => {
                const config = OUTCOME_CONFIG[outcome];
                const count = outcomeCounts[outcome] || 0;
                return (
                  <div
                    key={outcome}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all",
                      count > 0
                        ? "border-primary/20 bg-primary/5"
                        : "border-border bg-muted/20",
                    )}
                  >
                    <span
                      className={cn(
                        "text-2xl font-black font-mono",
                        count > 0 ? "text-foreground" : "text-muted-foreground/40",
                      )}
                    >
                      {count}
                    </span>
                    <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                      {config.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 4: Targets (daily visible, weekly/team collapsed) */}
        <DashboardTargetsOverview />

        {/* Row 5: Leaderboard + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TeamLeaderboard />
          <LiveActivityFeed />
        </div>
      </div>
    </AppLayout>
  );
}
