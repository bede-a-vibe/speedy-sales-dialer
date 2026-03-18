import { useMemo, useState } from "react";
import { endOfWeek, format, startOfWeek } from "date-fns";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange } from "@/hooks/usePipelineItems";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import { TargetSection } from "@/components/targets/TargetSection";
import { buildTargetProgressItems, deriveAllTargets, getPerformanceActualMetrics } from "@/lib/performanceTargets";
import { getReportMetrics } from "@/lib/reportMetrics";
import { cn } from "@/lib/utils";

export function DashboardTargetsOverview() {
  const { user } = useAuth();
  const { data: targets = [], isLoading: targetsLoading } = usePerformanceTargets();
  const [showMore, setShowMore] = useState(false);

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

  const derived = useMemo(() => deriveAllTargets(targets), [targets]);

  const myDailyTargets = derived.individualDaily.filter((t) => t.user_id === user?.id);
  const myWeeklyTargets = derived.individualWeekly.filter((t) => t.user_id === user?.id);

  const isLoading =
    targetsLoading || dailyCallsLoading || weeklyCallsLoading || dailyBookingsLoading || weeklyBookingsLoading;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground animate-pulse">Loading targets…</p>
      </div>
    );
  }

  const myDailyActuals = getPerformanceActualMetrics(myDailyMetrics);
  const myWeeklyActuals = getPerformanceActualMetrics(myWeeklyMetrics);
  const teamDailyActuals = getPerformanceActualMetrics(teamDailyMetrics);
  const teamWeeklyActuals = getPerformanceActualMetrics(teamWeeklyMetrics);

  return (
    <div className="space-y-4">
      {/* Always visible: My Daily */}
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <TargetSection
          title="My Daily Goals — Setter"
          description="Your setter progress for today."
          items={buildTargetProgressItems(myDailyTargets, myDailyActuals, "setter")}
        />
        <TargetSection
          title="My Daily Goals — Closer"
          description="Your closer progress for today."
          items={buildTargetProgressItems(myDailyTargets, myDailyActuals, "closer")}
        />
      </div>

      {/* Toggle for more */}
      <button
        onClick={() => setShowMore((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")} />
        {showMore ? "Show less" : "Weekly & team targets"}
      </button>

      {showMore && (
        <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <TargetSection
              title="My Weekly Goals — Setter"
              description="Your setter progress this week (daily × 5)."
              items={buildTargetProgressItems(myWeeklyTargets, myWeeklyActuals, "setter")}
            />
            <TargetSection
              title="My Weekly Goals — Closer"
              description="Your closer progress this week (daily × 5)."
              items={buildTargetProgressItems(myWeeklyTargets, myWeeklyActuals, "closer")}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <TargetSection
              title="Team Daily — Setter"
              description="Sum of all rep setter targets (rates averaged)."
              items={buildTargetProgressItems(derived.teamDaily, teamDailyActuals, "setter")}
            />
            <TargetSection
              title="Team Daily — Closer"
              description="Sum of all rep closer targets (rates averaged)."
              items={buildTargetProgressItems(derived.teamDaily, teamDailyActuals, "closer")}
            />
            <TargetSection
              title="Team Weekly — Setter"
              description="Sum of all rep weekly setter targets."
              items={buildTargetProgressItems(derived.teamWeekly, teamWeeklyActuals, "setter")}
            />
            <TargetSection
              title="Team Weekly — Closer"
              description="Sum of all rep weekly closer targets."
              items={buildTargetProgressItems(derived.teamWeekly, teamWeeklyActuals, "closer")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
