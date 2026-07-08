import { useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { DashboardTargetsOverview } from "@/components/targets/DashboardTargetsOverview";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import { TeamLeaderboard } from "@/components/TeamLeaderboard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { DashboardQuickStats } from "@/components/dashboard/DashboardQuickStats";
import { DashboardPerformancePanel } from "@/components/dashboard/DashboardPerformancePanel";
import { MySalesPanel } from "@/components/dashboard/MySalesPanel";
import { DailyAchievements, LongTermAchievements } from "@/components/dashboard/AchievementBadges";
import { DailyProgressRing } from "@/components/dashboard/DailyProgressRing";
import { MilestonePopup } from "@/components/dashboard/MilestonePopup";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const { user } = useAuth();
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

  return (
    <AppLayout title="Dashboard">
      <MilestonePopup todaysCalls={todaysCalls} dailyTarget={dailyTarget} />
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Row 1: Greeting */}
        <DashboardGreeting />

        {/* Row 2: Quick Stats */}
        <DashboardQuickStats />

        {/* Row 2.5: My Sales — lifetime dial-to-sale economics */}
        <MySalesPanel />

        {/* Row 3: Achievements with confetti & gamification */}
        <DailyAchievements />

        {/* Row 4: Progress ring + reporting snapshot */}
        <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-6">
          <DailyProgressRing />
          <DashboardPerformancePanel />
        </div>

        {/* Row 5: Targets (daily visible, weekly/team collapsed) */}
        <DashboardTargetsOverview />

        {/* Row 7: Leaderboard + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TeamLeaderboard />
          <LiveActivityFeed />
        </div>

        {/* Row 8: Long-term achievements */}
        <LongTermAchievements />
      </div>
    </AppLayout>
  );
}
