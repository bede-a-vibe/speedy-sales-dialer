import { useMemo, useState } from "react";
import { CalendarIcon, BarChart3, PhoneCall, CalendarCheck2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { ReportSection } from "@/components/reports/ReportSection";
import { DailyVolumeChart } from "@/components/reports/DailyVolumeChart";
import { MetricBarList } from "@/components/reports/MetricBarList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange } from "@/hooks/usePipelineItems";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { APPOINTMENT_OUTCOME_LABELS } from "@/lib/appointments";
import { getReportMetrics } from "@/lib/reportMetrics";

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);

  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookedAppointments = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);

  const metrics = useMemo(
    () => getReportMetrics({ callLogs, bookedItems: bookedAppointments, from: dateFrom, to: dateTo }),
    [bookedAppointments, callLogs, dateFrom, dateTo],
  );

  const callOutcomeItems = useMemo(
    () =>
      (Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((outcome) => ({
        label: OUTCOME_CONFIG[outcome].label,
        count: metrics.outcomeCounts[outcome],
        pct: metrics.dialer.dials > 0 ? Math.round((metrics.outcomeCounts[outcome] / metrics.dialer.dials) * 100) : 0,
        toneClassName: OUTCOME_CONFIG[outcome].bgClass,
      })),
    [metrics],
  );

  const appointmentOutcomeItems = useMemo(
    () =>
      Object.entries(APPOINTMENT_OUTCOME_LABELS).map(([key, label]) => ({
        label,
        count: metrics.appointmentsScheduled[key as keyof typeof APPOINTMENT_OUTCOME_LABELS extends never ? never : never],
        pct:
          metrics.appointmentsScheduled.resolvedAppointments > 0
            ? Math.round(
                ((metrics.appointmentOutcomeCounts[key as keyof typeof APPOINTMENT_OUTCOME_LABELS] ?? 0) /
                  metrics.appointmentsScheduled.resolvedAppointments) *
                  100,
              )
            : 0,
      })),
    [metrics],
  );

  return (
    <AppLayout title="Reports">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">From</span>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px] border-border bg-card text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px] border-border bg-card text-sm" />
          </div>
          {(callsLoading || bookingsLoading) && <span className="ml-2 animate-pulse text-xs text-muted-foreground">Loading...</span>}
        </div>

        <ReportSection title="Dialer KPI Snapshot" description="Core outbound metrics based on calls created in the selected date range.">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Dials" value={metrics.dialer.dials} />
            <StatCard label="Unique Leads Dialed" value={metrics.dialer.uniqueLeadsDialed} />
            <StatCard label="Pick Ups" value={metrics.dialer.pickUps} />
            <StatCard label="Pick Up Rate" value={`${metrics.dialer.pickUpRate}%`} subtext="pick ups / dials" />
            <StatCard label="# of Call Backs" value={metrics.dialer.callBacks} />
            <StatCard label="Pick Up to FU %" value={`${metrics.dialer.pickUpToFollowUpRate}%`} subtext="follow ups / pick ups" />
          </div>
        </ReportSection>

        <Tabs defaultValue="bookings-made" className="space-y-6">
          <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-lg border border-border bg-card p-2">
            <TabsTrigger value="bookings-made" className="rounded-md">Bookings Made</TabsTrigger>
            <TabsTrigger value="appointments-scheduled" className="rounded-md">Appointments Scheduled</TabsTrigger>
          </TabsList>

          <TabsContent value="bookings-made" className="space-y-6">
            <ReportSection
              title="Bookings Made"
              description="Activity view based on when a booking was created by the rep in the selected date range."
            >
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                <StatCard label="Total Bookings Made" value={metrics.bookingsMade.totalBookingsMade} />
                <StatCard label="Rebooked" value={metrics.bookingsMade.rebooked} />
                <StatCard label="New Bookings" value={metrics.bookingsMade.newBookings} />
                <StatCard label="Pick Ups to Booking %" value={`${metrics.bookingsMade.pickUpsToBookingRate}%`} subtext="bookings made / pick ups" />
                <StatCard label="Same Day / Next Day %" value={`${metrics.bookingsMade.sameDayNextDayRate}%`} subtext="same/next day / bookings made" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Same Day / Next Day Bookings</p>
                  <p className="mt-2 font-mono text-3xl font-bold text-foreground">{metrics.bookingsMade.sameDayNextDayBookings}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Bookings scheduled for the same day or next day after they were created.</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <PhoneCall className="h-4 w-4 text-primary" />
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Call Outcome Breakdown</h3>
                  </div>
                  <MetricBarList items={callOutcomeItems} emptyLabel="No call outcomes in this date range." />
                </div>
              </div>
            </ReportSection>
          </TabsContent>

          <TabsContent value="appointments-scheduled" className="space-y-6">
            <ReportSection
              title="Appointments Scheduled"
              description="Calendar view based on the appointment date that falls inside the selected range."
            >
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Appointments Scheduled" value={metrics.appointmentsScheduled.appointmentsScheduled} />
                <StatCard label="No Shows" value={metrics.appointmentsScheduled.noShows} />
                <StatCard label="Rescheduled" value={metrics.appointmentsScheduled.rescheduled} />
                <StatCard label="Showed Closed" value={metrics.appointmentsScheduled.showedClosed} />
                <StatCard label="Showed No Close" value={metrics.appointmentsScheduled.showedNoClose} />
                <StatCard label="Appointment Close Rate" value={`${metrics.appointmentsScheduled.appointmentCloseRate}%`} subtext="closed / resolved" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarCheck2 className="h-4 w-4 text-primary" />
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Appointment Outcomes</h3>
                  </div>
                  <MetricBarList items={appointmentOutcomeItems} emptyLabel="No resolved appointments in this date range." />
                  <p className="mt-4 text-xs text-muted-foreground">Resolved appointments: {metrics.appointmentsScheduled.resolvedAppointments}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Daily Call Volume</h3>
                  </div>
                  <DailyVolumeChart data={metrics.dailyVolume} />
                </div>
              </div>
            </ReportSection>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
