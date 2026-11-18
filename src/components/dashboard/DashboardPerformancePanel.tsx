import { useMemo } from "react";
import { format } from "date-fns";
import { BarChart3, Clock3 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useRescheduleSlotsByDateRange } from "@/hooks/usePipelineItems";
import { formatDurationSeconds } from "@/lib/duration";
import { getReportMetrics } from "@/lib/reportMetrics";
import { PerformancePanelSkeleton } from "@/components/skeletons/PageSkeletons";

function StatTile({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
    </div>
  );
}

export function DashboardPerformancePanel() {
  const { user } = useAuth();
  // Local date, not UTC: toISOString() gave yesterday's date before 11am in
  // Melbourne, so "Today" showed yesterday's numbers every morning.
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(today, today);
  const { data: bookedItems = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(today, today);
  const { data: rescheduleSlots = [] } = useRescheduleSlotsByDateRange(today, today);

  const metrics = useMemo(
    () =>
      getReportMetrics({
        callLogs,
        bookedItems,
        rescheduleSlots,
        from: today,
        to: today,
        repUserId: user?.id,
      }),
    [bookedItems, callLogs, rescheduleSlots, today, user?.id],
  );

  const setter = metrics.appointmentPerformance.setter;
  const isLoading = callsLoading || bookingsLoading;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Today</h3>
      </div>

      {isLoading ? (
        <PerformancePanelSkeleton />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatTile
              label="Dials"
              value={metrics.dialer.dials}
              subtext={`${metrics.dialer.pickUps} pick ups, ${metrics.dialer.pickUpRate}% connect rate`}
            />
            <StatTile
              label="Bookings Made"
              value={metrics.bookingsMade.totalBookingsMade}
              subtext={`${metrics.bookingsMade.sameDayNextDayBookings} same or next day`}
            />
            <StatTile
              label="Show-Up Rate"
              value={`${setter.showUpRate}%`}
              subtext={`${setter.showed} showed from ${setter.appointmentsScheduled} set`}
            />
            <StatTile
              label="Talk Time"
              value={formatDurationSeconds(metrics.dialer.totalTalkTimeSeconds)}
              subtext={`${formatDurationSeconds(metrics.dialer.averageTalkTimePerPickupSeconds)} avg per pick up`}
            />
          </div>

          <p className="mt-3 flex items-start gap-2 text-sm text-foreground">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {metrics.dialer.pickUps === 0
                ? "No pick-ups yet. Stay on volume and get the first live conversation."
                : setter.pendingOutcome > 0
                  ? `${setter.pendingOutcome} past ${setter.pendingOutcome === 1 ? "meeting needs" : "meetings need"} an outcome recorded.`
                  : metrics.bookingsMade.totalBookingsMade === 0
                    ? "You're getting conversations. Push for the first booking."
                    : "Good momentum. Keep stacking qualified conversations."}
            </span>
          </p>
        </>
      )}
    </section>
  );
}
