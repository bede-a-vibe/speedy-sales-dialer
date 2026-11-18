import { useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { DashboardTargetsOverview } from "@/components/targets/DashboardTargetsOverview";
import { LiveActivityFeed } from "@/components/LiveActivityFeed";
import { TeamLeaderboard } from "@/components/TeamLeaderboard";
import { DashboardGreeting } from "@/components/dashboard/DashboardGreeting";
import { DashboardQuickStats } from "@/components/dashboard/DashboardQuickStats";
import { DashboardPerformancePanel } from "@/components/dashboard/DashboardPerformancePanel";
import { MyNumbers } from "@/components/dashboard/MyNumbers";
import { PayThisMonthCard } from "@/components/dashboard/PayThisMonthCard";
import { DashboardFold } from "@/components/dashboard/DashboardFold";
import { MySalesPanel } from "@/components/dashboard/MySalesPanel";
import { DailyAchievements, LongTermAchievements } from "@/components/dashboard/AchievementBadges";
import { DailyProgressRing } from "@/components/dashboard/DailyProgressRing";
import { MilestonePopup } from "@/components/dashboard/MilestonePopup";
import { EodReportCard } from "@/components/dashboard/EodReportCard";
import { useTodayCallCount } from "@/hooks/useCallLogs";
import { useAchievementData } from "@/hooks/useAchievementData";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { deriveAllTargets } from "@/lib/performanceTargets";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: todaysCalls = 0 } = useTodayCallCount(user?.id);
  const { data: targets = [] } = usePerformanceTargets();
  // Fetched ONCE here and shared by both achievement panels — each used to run
  // its own full-history aggregation over every call log.
  const achievementData = useAchievementData(user?.id);

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
        {/* Row 0: End of day — slim bar, pinned top. Deliberately one line:
            it sits above everything a rep reads all day, so it earns the space
            by being thin rather than loud. */}
        <EodReportCard />

        {/* Row 1: Greeting */}
        <DashboardGreeting />

        {/* Row 2: Quick Stats */}
        <DashboardQuickStats />

        {/* Row 3: Today: progress ring + today's numbers */}
        <div className="grid grid-cols-1 xl:grid-cols-[220px_1fr] gap-6">
          <DailyProgressRing />
          <DashboardPerformancePanel />
        </div>

        {/* Row 3.5: Today's achievements: the game stays front and centre */}
        <DailyAchievements data={achievementData} />

        {/* Row 4: Pay this month (own for setters on a plan; every setter for admins) */}
        <PayThisMonthCard />

        {/* Row 5: Leaderboard + Activity Feed */}
        <div className="grid grid-cols-1 items-start lg:grid-cols-2 gap-6">
          <TeamLeaderboard />
          <LiveActivityFeed />
        </div>

        {/* Row 6: everything else, one line each until opened */}
        <div className="space-y-3">
          <DashboardFold id="my-numbers" title="My numbers" summary="Your setting and closing, day by day">
            <MyNumbers embedded />
          </DashboardFold>
          <DashboardFold id="my-goals" title="My goals" summary="Today's setter and closer targets">
            <DashboardTargetsOverview />
          </DashboardFold>
          <DashboardFold id="my-sales" title="My sales" summary="Closes you've booked, all time">
            <MySalesPanel />
          </DashboardFold>
          <DashboardFold id="achievements" title="Weekly and lifetime badges" summary="Streaks, big weeks and all-time milestones">
            <LongTermAchievements data={achievementData} />
          </DashboardFold>
        </div>
      </div>
    </AppLayout>
  );
}
