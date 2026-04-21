import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CalendarIcon, BarChart3, PhoneCall, Users, Clock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { ReportSection } from "@/components/reports/ReportSection";
import { DailyVolumeChart } from "@/components/reports/DailyVolumeChart";
import { MetricBarList } from "@/components/reports/MetricBarList";
import { TargetComparisonPanel } from "@/components/reports/TargetComparisonPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { formatDurationSeconds } from "@/lib/duration";
import { getReportMetrics } from "@/lib/reportMetrics";
import { getHourlyMetrics, getBookingHeatMapData } from "@/lib/hourlyMetrics";
import { HourlyBreakdownTable } from "@/components/reports/HourlyBreakdownTable";
import { BookingHeatMap } from "@/components/reports/BookingHeatMap";
import { OutboundDiagnosticPanel } from "@/components/reports/OutboundDiagnosticPanel";

const ALL_REPS_VALUE = "all";

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedRepId, setSelectedRepId] = useState(ALL_REPS_VALUE);
  const [hourlyDate, setHourlyDate] = useState(today);

  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookedAppointments = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();

  const { data: contactAttempts = [] } = useQuery({
    queryKey: ["contacts-attempt-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, call_attempt_count")
        .gt("call_attempt_count", 0);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

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
    () => getReportMetrics({ callLogs, bookedItems: bookedAppointments, from: dateFrom, to: dateTo, repUserId: activeRepId, contacts: contactAttempts }),
    [activeRepId, bookedAppointments, callLogs, contactAttempts, dateFrom, dateTo],
  );

  const teamMetrics = useMemo(
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

  const hourlyRows = useMemo(
    () => getHourlyMetrics(callLogs, bookedAppointments, hourlyDate, activeRepId),
    [callLogs, bookedAppointments, hourlyDate, activeRepId],
  );

  const heatMapCells = useMemo(
    () => getBookingHeatMapData(bookedAppointments),
    [bookedAppointments],
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

        <TargetComparisonPanel
          activeRepId={activeRepId}
          selectedRepLabel={selectedRepLabel}
          dateFrom={dateFrom}
          dateTo={dateTo}
          metrics={metrics}
          teamMetrics={teamMetrics}
        />

        <ReportSection
          title="Dialer KPI Snapshot"
          description={`Core outbound metrics based on calls created in the selected date range${activeRepId ? ` for ${selectedRepLabel}` : " across all reps"}.`}
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-3">
            <StatCard label="Dials" value={metrics.dialer.dials} />
            <StatCard label="Unique Leads Dialed" value={metrics.dialer.uniqueLeadsDialed} />
            <StatCard label="Pick Ups" value={metrics.dialer.pickUps} />
            <StatCard label="Pick Up Rate" value={`${metrics.dialer.pickUpRate}%`} subtext="pick ups / dials" />
            <StatCard label="# of Call Backs" value={metrics.dialer.callBacks} />
            <StatCard label="Pick Up to FU %" value={`${metrics.dialer.pickUpToFollowUpRate}%`} subtext="follow ups / pick ups" />
            <StatCard label="Total Talk Time" value={formatDurationSeconds(metrics.dialer.totalTalkTimeSeconds)} />
            <StatCard label="Avg Talk / Dial" value={formatDurationSeconds(metrics.dialer.averageTalkTimePerDialSeconds)} />
            <StatCard label="Avg Talk / Pick Up" value={formatDurationSeconds(metrics.dialer.averageTalkTimePerPickupSeconds)} />
          </div>
        </ReportSection>

        <Tabs defaultValue="sop-diagnostic" className="space-y-6">
          <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-lg border border-border bg-card p-2">
            <TabsTrigger value="sop-diagnostic" className="rounded-md">SOP Diagnostic</TabsTrigger>
            <TabsTrigger value="bookings-made" className="rounded-md">Bookings Made</TabsTrigger>
            <TabsTrigger value="rep-comparison" className="rounded-md">Rep Comparison</TabsTrigger>
            <TabsTrigger value="hourly-activity" className="rounded-md">Hourly / Heat Map</TabsTrigger>
          </TabsList>

          <TabsContent value="sop-diagnostic" className="space-y-6">
            <ReportSection
              title="Outbound Data Review (SOP)"
              description="System health metrics aligned to the Outbound Data Review SOP. Read top-to-bottom: pickup -> contact -> dial efficiency -> lead penetration -> duration -> rep flags."
            >
              <OutboundDiagnosticPanel
                diagnostic={metrics.outboundDiagnostic}
                pickUpRate={metrics.dialer.pickUpRate}
                repNameMap={repNameMap}
              />
            </ReportSection>

            <ReportSection
              title="Daily Call Volume"
              description="Total dials per day across the selected range."
            >
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Dials per Day</h3>
                </div>
                <DailyVolumeChart data={metrics.dailyVolume} />
              </div>
            </ReportSection>
          </TabsContent>

          <TabsContent value="bookings-made" className="space-y-6">
            <ReportSection
              title="Bookings Made"
              description={`Bookings created from outbound activity${activeRepId ? ` (${selectedRepLabel})` : ""} in the selected date range. Show-up / close metrics live in the CRM.`}
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

          <TabsContent value="rep-comparison" className="space-y-6">
            <ReportSection
              title="Rep Comparison"
              description="Outbound dialer activity per rep in the selected date range."
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Rep</TableHead>
                    <TableHead className="text-right">Dials</TableHead>
                    <TableHead className="text-right">Pick-ups</TableHead>
                    <TableHead className="text-right">Pick-up %</TableHead>
                    <TableHead className="text-right">Talk Time</TableHead>
                    <TableHead className="text-right">Avg Talk / Pickup</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.repComparison.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        No rep comparison data in this date range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    metrics.repComparison.map((row) => (
                      <TableRow key={row.repUserId}>
                        <TableCell className="font-medium text-foreground">{repNameMap.get(row.repUserId) || "Unnamed rep"}</TableCell>
                        <TableCell className="text-right font-mono text-foreground font-semibold">{row.dialer.dials}</TableCell>
                        <TableCell className="text-right font-mono text-foreground">{row.dialer.pickUps}</TableCell>
                        <TableCell className="text-right font-mono text-foreground">{row.dialer.dials > 0 ? Math.round((row.dialer.pickUps / row.dialer.dials) * 100) : 0}%</TableCell>
                        <TableCell className="text-right font-mono text-foreground">{formatDurationSeconds(row.dialer.totalTalkTimeSeconds)}</TableCell>
                        <TableCell className="text-right font-mono text-foreground">{formatDurationSeconds(row.dialer.averageTalkTimePerPickupSeconds)}</TableCell>
                        <TableCell className="text-right font-mono text-foreground">{row.setter.appointmentsScheduled}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ReportSection>
          </TabsContent>

          <TabsContent value="hourly-activity" className="space-y-6">
            <ReportSection
              title="Hourly Breakdown"
              description={`Hour-by-hour activity for ${hourlyDate}${activeRepId ? ` (${selectedRepLabel})` : " across all reps"}.`}
            >
              <div className="mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Date</span>
                <Input
                  type="date"
                  value={hourlyDate}
                  onChange={(e) => setHourlyDate(e.target.value)}
                  className="w-[160px] border-border bg-card text-sm"
                />
              </div>
              <HourlyBreakdownTable rows={hourlyRows} />
            </ReportSection>

            <ReportSection
              title="Booking Heat Map"
              description="Booking density by day of week and hour across the selected date range."
            >
              <BookingHeatMap cells={heatMapCells} />
            </ReportSection>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
