import { AppLayout } from "@/components/AppLayout";
import { DashboardTargetsOverview } from "@/components/targets/DashboardTargetsOverview";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import { TeamLeaderboard } from "@/components/TeamLeaderboard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { AchievementBadges } from "@/components/dashboard/AchievementBadges";
import { DailyProgressRing } from "@/components/dashboard/DailyProgressRing";
import { useCallLogs } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: callLogs = [] } = useCallLogs();

  const today = new Date().toISOString().slice(0, 10);
  const todaysLogs = callLogs.filter(
    (l: any) => l.user_id === user?.id && l.created_at?.slice(0, 10) === today,
  );

  const outcomeCounts = todaysLogs.reduce<Partial<Record<string, number>>>((acc, log) => {
    acc[log.outcome] = (acc[log.outcome] || 0) + 1;
    return acc;
  }, {});

  return (
    <AppLayout title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Row 1: Greeting */}
        <DashboardGreeting />

        {/* Row 2: Compact achievement pills */}
        <AchievementBadges />

        {/* Row 3: Progress ring + today's outcomes side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4">
          <DailyProgressRing />

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">
              Today's Outcomes
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {(Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((outcome) => {
                const config = OUTCOME_CONFIG[outcome];
                const count = outcomeCounts[outcome] || 0;
                return (
                  <div
                    key={outcome}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 transition-all",
                      count > 0
                        ? "border-primary/20 bg-primary/5"
                        : "border-border bg-muted/20",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xl font-black font-mono leading-none",
                        count > 0 ? "text-foreground" : "text-muted-foreground/40",
                      )}
                    >
                      {count}
                    </span>
                    <span className="text-[8px] font-medium text-muted-foreground uppercase tracking-wider leading-tight text-center">
                      {config.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Row 4: My daily targets (weekly/team collapsed) */}
        <DashboardTargetsOverview />

        {/* Row 5: Leaderboard + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TeamLeaderboard />
          <LiveActivityFeed />
        </div>
      </div>
    </AppLayout>
  );
}
