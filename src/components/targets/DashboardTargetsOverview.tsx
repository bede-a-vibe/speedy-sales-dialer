import { useMemo } from "react";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange } from "@/hooks/usePipelineItems";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { TargetSection } from "@/components/targets/TargetSection";
import { buildTargetProgressItems, getPerformanceActualMetrics } from "@/lib/performanceTargets";
import { getReportMetrics } from "@/lib/reportMetrics";

export function DashboardTargetsOverview() {
  const { user } = useAuth();
  const { data: targets = [], isLoading: targetsLoading } = usePerformanceTargets();

  const today = format(new Date(), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  const { data: dailyCallLogs = [], isLoading: dailyCallsLoading } = useCallLogsByDateRange(today, today);
  const { data: weeklyCallLogs = [], isLoading: weeklyCallsLoading } = useCallLogsByDateRange(weekStart, weekEnd);
  const { data: dailyBookedAppointments = [], isLoading: dailyBookingsLoading } = useBookedAppointmentsByDateRange(today, today);
  const { data: weeklyBookedAppointments = [], isLoading: weeklyBookingsLoading } = useBookedAppointmentsByDateRange(weekStart, weekEnd);

  const myDailyMetrics = useMemo(
    () => getReportMetrics({ callLogs: dailyCallLogs, bookedItems: dailyBookedAppointments, from: today, to: today, repUserId: user?.id }),
    [dailyBookedAppointments, dailyCallLogs, today, user?.id],
  );
  const myWeeklyMetrics = useMemo(
    () => getReportMetrics({ callLogs: weeklyCallLogs, bookedItems: weeklyBookedAppointments, from: weekStart, to: weekEnd, repUserId: user?.id }),
    [user?.id, weekEnd, weekStart, weeklyBookedAppointments, weeklyCallLogs],
  );
  const teamDailyMetrics = useMemo(
    () => getReportMetrics({ callLogs: dailyCallLogs, bookedItems: dailyBookedAppointments, from: today, to: today }),
    [dailyBookedAppointments, dailyCallLogs, today],
  );
  const teamWeeklyMetrics = useMemo(
    () => getReportMetrics({ callLogs: weeklyCallLogs, bookedItems: weeklyBookedAppointments, from: weekStart, to: weekEnd }),
    [weekEnd, weekStart, weeklyBookedAppointments, weeklyCallLogs],
  );

  const myDailyTargets = targets.filter(
    (target) => target.scope_type === "individual" && target.period_type === "daily" && target.user_id === user?.id,
  );
  const myWeeklyTargets = targets.filter(
    (target) => target.scope_type === "individual" && target.period_type === "weekly" && target.user_id === user?.id,
  );
  const teamDailyTargets = targets.filter(
    (target) => target.scope_type === "team" && target.period_type === "daily",
  );
  const teamWeeklyTargets = targets.filter(
    (target) => target.scope_type === "team" && target.period_type === "weekly",
  );

  const isLoading =
    targetsLoading ||
    dailyCallsLoading ||
    weeklyCallsLoading ||
    dailyBookingsLoading ||
    weeklyBookingsLoading;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground animate-pulse">Loading targets…</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
      <TargetSection
        title="My Daily Goals"
        description="Your progress for today across bookings, show-up rate, and closed deals."
        items={buildTargetProgressItems(myDailyTargets, getPerformanceActualMetrics(myDailyMetrics))}
      />
      <TargetSection
        title="My Weekly Goals"
        description="Your progress for the current week, reset every Monday."
        items={buildTargetProgressItems(myWeeklyTargets, getPerformanceActualMetrics(myWeeklyMetrics))}
      />
      <TargetSection
        title="Team Daily Goals"
        description="Manual team targets for today across the full floor."
        items={buildTargetProgressItems(teamDailyTargets, getPerformanceActualMetrics(teamDailyMetrics))}
      />
      <TargetSection
        title="Team Weekly Goals"
        description="Manual team targets for the current week."
        items={buildTargetProgressItems(teamWeeklyTargets, getPerformanceActualMetrics(teamWeeklyMetrics))}
      />
    </div>
  );
}
