import { useMemo, useState } from "react";
import { CalendarIcon, BarChart3, PhoneCall, CalendarCheck2, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { ReportSection } from "@/components/reports/ReportSection";
import { DailyVolumeChart } from "@/components/reports/DailyVolumeChart";
import { MetricBarList } from "@/components/reports/MetricBarList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { APPOINTMENT_OUTCOME_LABELS } from "@/lib/appointments";
import { formatDurationSeconds } from "@/lib/duration";
import { getReportMetrics, type AppointmentPerformanceMetrics, type AppointmentOutcomeCounts } from "@/lib/reportMetrics";

const ALL_REPS_VALUE = "all";

function buildAppointmentOutcomeItems(
  outcomeCounts: AppointmentOutcomeCounts,
  metrics: AppointmentPerformanceMetrics,
) {
  return Object.entries(APPOINTMENT_OUTCOME_LABELS).map(([key, label]) => ({
    label,
    count: outcomeCounts[key as keyof typeof APPOINTMENT_OUTCOME_LABELS] ?? 0,
    pct:
      metrics.resolvedAppointments > 0
        ? Math.round(((outcomeCounts[key as keyof typeof APPOINTMENT_OUTCOME_LABELS] ?? 0) / metrics.resolvedAppointments) * 100)
        : 0,
  }));
}

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedRepId, setSelectedRepId] = useState(ALL_REPS_VALUE);

  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookedAppointments = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();

  const activeRepId = selectedRepId === ALL_REPS_VALUE ? undefined : selectedRepId;
  const selectedRepLabel =
    reps.find((rep) => rep.user_id === activeRepId)?.display_name ||
    reps.find((rep) => rep.user_id === activeRepId)?.email ||
    "Selected rep";

  const repNameMap = useMemo(
    () =>
      new Map(
        reps.map((rep) => [rep.user_id, rep.display_name || rep.email || "Unnamed rep"]),
      ),
    [reps],
  );

  const metrics = useMemo(
    () => getReportMetrics({ callLogs, bookedItems: bookedAppointments, from: dateFrom, to: dateTo, repUserId: activeRepId }),
    [activeRepId, bookedAppointments, callLogs, dateFrom, dateTo],
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

  const setterOutcomeItems = useMemo(
    () => buildAppointmentOutcomeItems(metrics.appointmentOutcomeCounts.setter, metrics.appointmentPerformance.setter),
    [metrics],
  );

  const closerOutcomeItems = useMemo(
    () => buildAppointmentOutcomeItems(metrics.appointmentOutcomeCounts.closer, metrics.appointmentPerformance.closer),
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
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Rep</span>
            <Select value={selectedRepId} onValueChange={setSelectedRepId}>
              <SelectTrigger className="w-[220px] border-border bg-card">
                <SelectValue placeholder="All reps" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_REPS_VALUE}>All reps</SelectItem>
                {reps.map((rep) => (
                  <SelectItem key={rep.user_id} value={rep.user_id}>
                    {rep.display_name || rep.email || "Unnamed rep"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(callsLoading || bookingsLoading || repsLoading) && <span className="ml-2 animate-pulse text-xs text-muted-foreground">Loading...</span>}
        </div>

        <ReportSection
          title="Dialer KPI Snapshot"
          description={`Core outbound metrics based on calls created in the selected date range${activeRepId ? ` for ${selectedRepLabel}` : " across all reps"}.`}
        >
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
            <TabsTrigger value="setter-performance" className="rounded-md">Setter Performance</TabsTrigger>
            <TabsTrigger value="closer-performance" className="rounded-md">Closer Performance</TabsTrigger>
            <TabsTrigger value="rep-comparison" className="rounded-md">Rep Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="bookings-made" className="space-y-6">
            <ReportSection
              title="Bookings Made"
              description={`Activity view based on who created the booking${activeRepId ? ` (${selectedRepLabel})` : ""} in the selected date range.`}
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

          <TabsContent value="setter-performance" className="space-y-6">
            <ReportSection
              title="Setter Performance"
              description={`Performance view based on who created the booking${activeRepId ? ` (${selectedRepLabel})` : ""} and whether those meetings showed.`}
            >
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Appointments Set" value={metrics.appointmentPerformance.setter.appointmentsScheduled} />
                <StatCard label="No Shows" value={metrics.appointmentPerformance.setter.noShows} />
                <StatCard label="Showed" value={metrics.appointmentPerformance.setter.showed} />
                <StatCard label="Show-Up Rate" value={`${metrics.appointmentPerformance.setter.showUpRate}%`} subtext="showed / appointments set" />
                <StatCard label="Showed Closed" value={metrics.appointmentPerformance.setter.showedClosed} />
                <StatCard label="Close Rate" value={`${metrics.appointmentPerformance.setter.closeRate}%`} subtext="closed / showed" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarCheck2 className="h-4 w-4 text-primary" />
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Setter Appointment Outcomes</h3>
                  </div>
                  <MetricBarList items={setterOutcomeItems} emptyLabel="No resolved setter appointments in this date range." />
                  <p className="mt-4 text-xs text-muted-foreground">Resolved appointments: {metrics.appointmentPerformance.setter.resolvedAppointments} · Rescheduled: {metrics.appointmentPerformance.setter.rescheduled}</p>
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

          <TabsContent value="closer-performance" className="space-y-6">
            <ReportSection
              title="Closer Performance"
              description={`Performance view based on who was assigned to close the meeting${activeRepId ? ` (${selectedRepLabel})` : ""} for appointments in the selected date range.`}
            >
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Appointments Closed" value={metrics.appointmentPerformance.closer.appointmentsScheduled} />
                <StatCard label="No Shows" value={metrics.appointmentPerformance.closer.noShows} />
                <StatCard label="Showed" value={metrics.appointmentPerformance.closer.showed} />
                <StatCard label="Show-Up Rate" value={`${metrics.appointmentPerformance.closer.showUpRate}%`} subtext="showed / assigned appointments" />
                <StatCard label="Showed Closed" value={metrics.appointmentPerformance.closer.showedClosed} />
                <StatCard label="Close Rate" value={`${metrics.appointmentPerformance.closer.closeRate}%`} subtext="closed / showed" />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <CalendarCheck2 className="h-4 w-4 text-primary" />
                    <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Closer Appointment Outcomes</h3>
                  </div>
                  <MetricBarList items={closerOutcomeItems} emptyLabel="No resolved closer appointments in this date range." />
                  <p className="mt-4 text-xs text-muted-foreground">Resolved appointments: {metrics.appointmentPerformance.closer.resolvedAppointments} · Rescheduled: {metrics.appointmentPerformance.closer.rescheduled}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Compare Roles</p>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <StatCard label="Setter Show-Up Rate" value={`${metrics.appointmentPerformance.setter.showUpRate}%`} subtext="creator attribution" className="bg-card" />
                    <StatCard label="Closer Close Rate" value={`${metrics.appointmentPerformance.closer.closeRate}%`} subtext="assigned closer attribution" className="bg-card" />
                  </div>
                </div>
              </div>
            </ReportSection>
          </TabsContent>

          <TabsContent value="rep-comparison" className="space-y-6">
            <ReportSection
              title="Rep Comparison"
              description="One table comparing setter and closer outcomes side by side for every rep in the selected date range."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={2} className="min-w-[180px] align-bottom">Rep</TableHead>
                    <TableHead colSpan={4} className="text-center">Setter</TableHead>
                    <TableHead colSpan={4} className="text-center">Closer</TableHead>
                  </TableRow>
                  <TableRow>
                    <TableHead>Set</TableHead>
                    <TableHead>Showed</TableHead>
                    <TableHead>Show %</TableHead>
                    <TableHead>Close %</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Showed</TableHead>
                    <TableHead>Show %</TableHead>
                    <TableHead>Close %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.repComparison.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                        No rep comparison data in this date range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    metrics.repComparison.map((row) => (
                      <TableRow key={row.repUserId}>
                        <TableCell className="font-medium text-foreground">{repNameMap.get(row.repUserId) || "Unnamed rep"}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{row.setter.appointmentsScheduled}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{row.setter.showed}</TableCell>
                        <TableCell className="font-mono text-foreground">{row.setter.showUpRate}%</TableCell>
                        <TableCell className="font-mono text-foreground">{row.setter.closeRate}%</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{row.closer.appointmentsScheduled}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{row.closer.showed}</TableCell>
                        <TableCell className="font-mono text-foreground">{row.closer.showUpRate}%</TableCell>
                        <TableCell className="font-mono text-foreground">{row.closer.closeRate}%</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ReportSection>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
