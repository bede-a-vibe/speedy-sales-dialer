import { useMemo } from "react";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange } from "@/hooks/usePipelineItems";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { TargetSection } from "@/components/targets/TargetSection";
import { buildTargetProgressItems, deriveAllTargets, getPerformanceActualMetrics } from "@/lib/performanceTargets";
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

  // Derive all target sets from stored individual daily targets
  const derived = useMemo(() => deriveAllTargets(targets), [targets]);

  const myDailyTargets = derived.individualDaily.filter((t) => t.user_id === user?.id);
  const myWeeklyTargets = derived.individualWeekly.filter((t) => t.user_id === user?.id);

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
        description="Your progress for today across all metrics."
        items={buildTargetProgressItems(myDailyTargets, getPerformanceActualMetrics(myDailyMetrics))}
      />
      <TargetSection
        title="My Weekly Goals"
        description="Your weekly progress (daily × 5 for counts, same for rates)."
        items={buildTargetProgressItems(myWeeklyTargets, getPerformanceActualMetrics(myWeeklyMetrics))}
      />
      <TargetSection
        title="Team Daily Goals"
        description="Sum of all rep daily targets (rates averaged)."
        items={buildTargetProgressItems(derived.teamDaily, getPerformanceActualMetrics(teamDailyMetrics))}
      />
      <TargetSection
        title="Team Weekly Goals"
        description="Sum of all rep weekly targets (rates averaged)."
        items={buildTargetProgressItems(derived.teamWeekly, getPerformanceActualMetrics(teamWeeklyMetrics))}
      />
    </div>
  );
}
