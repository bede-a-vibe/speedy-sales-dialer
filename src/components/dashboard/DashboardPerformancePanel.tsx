import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BarChart3, CalendarCheck2, Clock3, PhoneCall, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange } from "@/hooks/usePipelineItems";
import { formatDurationSeconds } from "@/lib/duration";
import { getReportMetrics } from "@/lib/reportMetrics";

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
  const today = new Date().toISOString().split("T")[0];
  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(today, today);
  const { data: bookedItems = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(today, today);

  const metrics = useMemo(
    () =>
      getReportMetrics({
        callLogs,
        bookedItems,
        from: today,
        to: today,
        repUserId: user?.id,
      }),
    [bookedItems, callLogs, today, user?.id],
  );

  const setter = metrics.appointmentPerformance.setter;
  const isLoading = callsLoading || bookingsLoading;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Today's Performance Snapshot</h3>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Quick reporting view for your dialer, booking, and show-up progress today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/targets">
              <Target className="h-4 w-4" />
              Targets
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/reports">Open reports</Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground animate-pulse">
          Loading today&apos;s performance…
        </div>
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

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <PhoneCall className="h-4 w-4" />
                <p className="text-[10px] uppercase tracking-widest">Dialer quality</p>
              </div>
              <p className="mt-2 text-sm text-foreground">
                {metrics.dialer.pickUpToFollowUpRate}% of answered calls became follow ups, with {metrics.bookingsMade.pickUpsToBookingRate}% converting into bookings.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarCheck2 className="h-4 w-4" />
                <p className="text-[10px] uppercase tracking-widest">Setter outcomes</p>
              </div>
              <p className="mt-2 text-sm text-foreground">
                {setter.pendingOutcome} past appointments still need outcomes, and {setter.rescheduled} were rescheduled today.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                <p className="text-[10px] uppercase tracking-widest">Focus next</p>
              </div>
              <p className="mt-2 text-sm text-foreground">
                {metrics.dialer.pickUps === 0
                  ? "No pick ups yet. Stay on volume and try to generate the first live conversations."
                  : setter.pendingOutcome > 0
                    ? "Record missing appointment outcomes so reporting stays trustworthy."
                    : metrics.bookingsMade.totalBookingsMade === 0
                      ? "You&apos;re getting conversations. Push for the first booking next."
                      : "Good momentum. Keep stacking qualified conversations and protect show quality."}
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
