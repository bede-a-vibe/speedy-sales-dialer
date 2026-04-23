import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, PhoneCall, Clock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { StatCard } from "@/components/StatCard";
import { ReportSection } from "@/components/reports/ReportSection";
import { DailyVolumeChart } from "@/components/reports/DailyVolumeChart";
import { MetricBarList } from "@/components/reports/MetricBarList";
import { TargetComparisonPanel } from "@/components/reports/TargetComparisonPanel";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { formatDurationSeconds } from "@/lib/duration";
import { getReportMetrics } from "@/lib/reportMetrics";
import { getHourlyMetrics, getBookingHeatMapData, getPickupHeatMapData } from "@/lib/hourlyMetrics";
import { HourlyBreakdownTable } from "@/components/reports/HourlyBreakdownTable";
import { BookingHeatMap } from "@/components/reports/BookingHeatMap";
import { PickupHeatMap } from "@/components/reports/PickupHeatMap";
import { OutboundDiagnosticPanel } from "@/components/reports/OutboundDiagnosticPanel";
import { ConversationFunnelPanel } from "@/components/reports/ConversationFunnelPanel";
import { RepCoachingPanel } from "@/components/reports/RepCoachingPanel";
import {
  computeAllRepScorecards,
  computeRepCoachingScorecard,
  computeRepComparisonExtras,
} from "@/lib/repCoachingMetrics";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { HeadlineKpiStrip } from "@/components/reports/HeadlineKpiStrip";
import { ReportTabGroup, type TabGroupDef } from "@/components/reports/ReportTabGroup";

const ALL_REPS_VALUE = "all";

const TAB_GROUPS: TabGroupDef[] = [
  {
    id: "performance",
    label: "Performance",
    tabs: [
      { value: "sop-diagnostic", label: "SOP Diagnostic" },
      { value: "bookings-made", label: "Bookings Made" },
    ],
  },
  {
    id: "coaching",
    label: "Coaching",
    tabs: [
      { value: "conversation-funnel", label: "Conversation Funnel" },
      { value: "rep-coaching", label: "Rep Coaching" },
    ],
  },
  {
    id: "team-timing",
    label: "Team & Timing",
    tabs: [
      { value: "rep-comparison", label: "Rep Comparison" },
      { value: "hourly-activity", label: "Hourly / Heat Map" },
    ],
  },
];

export default function ReportsPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedRepId, setSelectedRepId] = useState(ALL_REPS_VALUE);
  const [hourlyDate, setHourlyDate] = useState(today);
  const [activeGroup, setActiveGroup] = useState("performance");
  const [activeTab, setActiveTab] = useState("sop-diagnostic");

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
    () => getBookingHeatMapData(bookedAppointments, activeRepId),
    [bookedAppointments, activeRepId],
  );

  const pickupHeatMapCells = useMemo(
    () => getPickupHeatMapData(callLogs, activeRepId),
    [callLogs, activeRepId],
  );

  const repScorecards = useMemo(() => {
    if (activeRepId) {
      return [computeRepCoachingScorecard(activeRepId, callLogs as never, bookedAppointments)];
    }
    const repIds = Array.from(
      new Set([
        ...callLogs.map((l) => l.user_id).filter(Boolean),
        ...bookedAppointments.map((b) => b.created_by).filter(Boolean),
      ]),
    );
    return computeAllRepScorecards(repIds, callLogs as never, bookedAppointments);
  }, [activeRepId, callLogs, bookedAppointments]);

  const repComparisonExtras = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeRepComparisonExtras>>();
    for (const row of metrics.repComparison) {
      map.set(row.repUserId, computeRepComparisonExtras(row.repUserId, callLogs as never));
    }
    return map;
  }, [metrics.repComparison, callLogs]);

  return (
    <AppLayout title="Reports">
      <ReportsToolbar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        selectedRepId={selectedRepId}
        onSelectedRepIdChange={setSelectedRepId}
        reps={reps}
        allRepsValue={ALL_REPS_VALUE}
        isLoading={callsLoading || bookingsLoading || repsLoading}
      />

      <div className="mx-auto max-w-6xl space-y-5 pt-5">
        <HeadlineKpiStrip metrics={metrics} />

        <ReportTabGroup
          groups={TAB_GROUPS}
          activeGroup={activeGroup}
          onActiveGroupChange={setActiveGroup}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
        />

        {activeTab === "sop-diagnostic" && (
          <div className="space-y-5">
            <TargetComparisonPanel
              activeRepId={activeRepId}
              selectedRepLabel={selectedRepLabel}
              dateFrom={dateFrom}
              dateTo={dateTo}
              metrics={metrics}
              teamMetrics={teamMetrics}
            />

            <ReportSection
              title="Supporting Dialer Metrics"
              description="Secondary outbound counters that complement the headline KPI strip above."
              collapsible
              defaultOpen={false}
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard compact label="Unique Leads Dialed" value={metrics.dialer.uniqueLeadsDialed} />
                <StatCard compact label="# of Call Backs" value={metrics.dialer.callBacks} />
                <StatCard compact label="Pick Up to FU %" value={`${metrics.dialer.pickUpToFollowUpRate}%`} subtext="follow ups / pick ups" />
                <StatCard compact label="Avg Talk / Dial" value={formatDurationSeconds(metrics.dialer.averageTalkTimePerDialSeconds)} />
              </div>
            </ReportSection>

            <ReportSection
              title="Outbound Data Review (SOP)"
              description="Pickup → contact → dial efficiency → lead penetration → duration → rep flags."
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
              collapsible
            >
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-4 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Dials per Day</h3>
                </div>
                <DailyVolumeChart data={metrics.dailyVolume} />
              </div>
            </ReportSection>
          </div>
        )}

        {activeTab === "bookings-made" && (
          <ReportSection
            title="Bookings Made"
            description={`Bookings created from outbound activity${activeRepId ? ` (${selectedRepLabel})` : ""} in the selected date range. Show-up / close metrics live in the CRM.`}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <StatCard compact label="Total Bookings Made" value={metrics.bookingsMade.totalBookingsMade} />
              <StatCard compact label="Rebooked" value={metrics.bookingsMade.rebooked} />
              <StatCard compact label="New Bookings" value={metrics.bookingsMade.newBookings} />
              <StatCard compact label="Pick Ups to Booking %" value={`${metrics.bookingsMade.pickUpsToBookingRate}%`} subtext="bookings / pick ups" />
              <StatCard compact label="Same Day / Next Day %" value={`${metrics.bookingsMade.sameDayNextDayRate}%`} subtext="same/next day / bookings" />
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
        )}

        {activeTab === "conversation-funnel" && (
          <ReportSection
            title="Conversation Funnel"
            description={`Manual cold-call funnel tagged by reps. Shows where conversations break down${activeRepId ? ` for ${selectedRepLabel}` : " across the team"}.`}
          >
            <ConversationFunnelPanel
              callLogs={callLogs as never}
              from={dateFrom}
              to={dateTo}
              repUserId={activeRepId}
              repLabel={activeRepId ? selectedRepLabel : undefined}
              repNameMap={repNameMap}
            />
          </ReportSection>
        )}

        {activeTab === "rep-coaching" && (
          <ReportSection
            title="Per-Rep Coaching Scorecards"
            description={
              activeRepId
                ? `Where ${selectedRepLabel}'s calls fall apart, plus best pick-up and booking windows.`
                : "One scorecard per rep showing biggest funnel leak, top exit reason, and timing intelligence. Sorted by dial volume."
            }
          >
            <RepCoachingPanel
              scorecards={repScorecards}
              repNameMap={repNameMap}
              expanded={!!activeRepId}
            />
          </ReportSection>
        )}

        {activeTab === "rep-comparison" && (
          <ReportSection
            title="Rep Comparison"
            description="Outbound dialer activity per rep in the selected date range."
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-[180px] bg-card">Rep</TableHead>
                    <TableHead className="text-right">Dials</TableHead>
                    <TableHead className="text-right">Pick-ups</TableHead>
                    <TableHead className="text-right">Pick-up %</TableHead>
                    <TableHead className="text-right">Talk Time</TableHead>
                    <TableHead className="text-right">Avg Talk / Pickup</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Best Pick-Up Hour</TableHead>
                    <TableHead className="text-right">Worst Stage</TableHead>
                    <TableHead className="text-right">Top Exit Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.repComparison.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                        No rep comparison data in this date range.
                      </TableCell>
                    </TableRow>
                  ) : (
                    metrics.repComparison.map((row) => {
                      const extras = repComparisonExtras.get(row.repUserId);
                      return (
                        <TableRow key={row.repUserId}>
                          <TableCell className="sticky left-0 z-10 bg-card font-medium text-foreground">{repNameMap.get(row.repUserId) || "Unnamed rep"}</TableCell>
                          <TableCell className="text-right font-mono text-foreground font-semibold">{row.dialer.dials}</TableCell>
                          <TableCell className="text-right font-mono text-foreground">{row.dialer.pickUps}</TableCell>
                          <TableCell className="text-right font-mono text-foreground">{row.dialer.dials > 0 ? Math.round((row.dialer.pickUps / row.dialer.dials) * 100) : 0}%</TableCell>
                          <TableCell className="text-right font-mono text-foreground">{formatDurationSeconds(row.dialer.totalTalkTimeSeconds)}</TableCell>
                          <TableCell className="text-right font-mono text-foreground">{formatDurationSeconds(row.dialer.averageTalkTimePerPickupSeconds)}</TableCell>
                          <TableCell className="text-right font-mono text-foreground">{row.setter.appointmentsScheduled}</TableCell>
                          <TableCell className="text-right font-mono text-foreground">
                            {extras?.bestPickupHourLabel ? (
                              <>
                                {extras.bestPickupHourLabel}{" "}
                                <span className="text-xs text-muted-foreground">({extras.bestPickupHourRate}%)</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {extras?.worstStageLabel ? (
                              <span className={extras.worstStageDropPct >= 50 ? "text-destructive font-medium" : "text-foreground"}>
                                {extras.worstStageLabel} <span className="text-xs">−{extras.worstStageDropPct}%</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {extras?.topExitReasonLabel ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </ReportSection>
        )}

        {activeTab === "hourly-activity" && (
          <div className="space-y-5">
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

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <ReportSection
                title="Booking Heat Map"
                description="Booking density by day of week and hour."
              >
                <BookingHeatMap cells={heatMapCells} repLabel={activeRepId ? selectedRepLabel : undefined} />
              </ReportSection>

              <ReportSection
                title="Pick-Up Rate Heat Map"
                description={`Pickup % intensity by day of week and hour${activeRepId ? ` for ${selectedRepLabel}` : ""}.`}
              >
                <PickupHeatMap cells={pickupHeatMapCells} />
              </ReportSection>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
