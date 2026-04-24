import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ReportSection } from "@/components/reports/ReportSection";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { getReportMetrics } from "@/lib/reportMetrics";
import { computeFunnel, computeStageExitBreakdowns, filterFunnelLogs } from "@/lib/funnelMetrics";
import { EndToEndFunnel } from "@/components/funnel/EndToEndFunnel";
import { ConversionRateStrip } from "@/components/funnel/ConversionRateStrip";
import { CustomStatGrid } from "@/components/funnel/CustomStatGrid";
import { MetricTrendChart } from "@/components/funnel/MetricTrendChart";
import { useFunnelMetricSelection } from "@/hooks/useFunnelMetricSelection";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL_REPS_VALUE = "all";

function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export default function CallFunnelPage() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedRepId, setSelectedRepId] = useState(ALL_REPS_VALUE);
  const [compareMode, setCompareMode] = useState(false);

  const activeRepId = selectedRepId === ALL_REPS_VALUE ? undefined : selectedRepId;

  // Compute previous period range (same length, immediately before).
  const span = dayDiff(dateFrom, dateTo);
  const previousTo = shiftDate(dateFrom, -1);
  const previousFrom = shiftDate(previousTo, -(span - 1));

  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(
    compareMode ? previousFrom : dateFrom,
    dateTo,
  );
  const { data: bookedAppointments = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(
    compareMode ? previousFrom : dateFrom,
    dateTo,
  );
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

  const metrics = useMemo(
    () => getReportMetrics({ callLogs, bookedItems: bookedAppointments, from: dateFrom, to: dateTo, repUserId: activeRepId, contacts: contactAttempts }),
    [activeRepId, bookedAppointments, callLogs, contactAttempts, dateFrom, dateTo],
  );

  const previousMetrics = useMemo(
    () =>
      compareMode
        ? getReportMetrics({
            callLogs,
            bookedItems: bookedAppointments,
            from: previousFrom,
            to: previousTo,
            repUserId: activeRepId,
            contacts: contactAttempts,
          })
        : undefined,
    [compareMode, callLogs, bookedAppointments, previousFrom, previousTo, activeRepId, contactAttempts],
  );

  const filteredLogs = useMemo(
    () => filterFunnelLogs(callLogs as never, { from: dateFrom, to: dateTo, repUserId: activeRepId }),
    [callLogs, dateFrom, dateTo, activeRepId],
  );

  const funnel = useMemo(() => computeFunnel(filteredLogs), [filteredLogs]);
  const stageBreakdowns = useMemo(() => computeStageExitBreakdowns(filteredLogs), [filteredLogs]);

  const { selectedIds, toggle, remove, setAll, reset } = useFunnelMetricSelection();

  return (
    <AppLayout title="Call Funnel">
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
        <div className="flex items-center justify-end gap-2">
          <Label htmlFor="compare-toggle" className="cursor-pointer text-xs text-muted-foreground">
            Compare to previous period
          </Label>
          <Switch
            id="compare-toggle"
            checked={compareMode}
            onCheckedChange={setCompareMode}
          />
        </div>

        <EndToEndFunnel metrics={metrics} funnel={funnel} />

        <ConversionRateStrip metrics={metrics} />

        <ReportSection
          title="Custom Monitor"
          description="Pick exactly the stats you want to track. Add or remove metrics any time — your selection is saved."
        >
          <CustomStatGrid
            metrics={metrics}
            previousMetrics={previousMetrics}
            selectedIds={selectedIds}
            onToggle={toggle}
            onRemove={remove}
            onSetAll={setAll}
            onReset={reset}
            compareMode={compareMode}
          />
        </ReportSection>

        <ReportSection
          title="Trend"
          description="Track any single metric day by day across the date range."
          collapsible
          defaultOpen
        >
          <MetricTrendChart
            callLogs={callLogs}
            bookedItems={bookedAppointments}
            contacts={contactAttempts}
            from={dateFrom}
            to={dateTo}
            repUserId={activeRepId}
            previousFrom={previousFrom}
            previousTo={previousTo}
            compareMode={compareMode}
          />
        </ReportSection>

        <ReportSection
          title="Stage Drop-Off Reasons"
          description="For each funnel stage, the top NEPQ-tagged reasons calls were lost. Use this to prioritize coaching."
          collapsible
          defaultOpen={false}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {stageBreakdowns.map((b) => {
              const topReasons = b.reasons.filter((r) => r.count > 0).slice(0, 3);
              return (
                <div key={b.stage} className="rounded-lg border border-border bg-background p-4">
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-sm font-semibold text-foreground">{b.stageLabel}</h4>
                    <span className="font-mono text-xs text-muted-foreground">{b.totalLost} tagged</span>
                  </div>
                  <div className="mt-3">
                    {topReasons.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No exit reasons tagged at this stage yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Reason</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {topReasons.map((r) => (
                            <TableRow key={r.value}>
                              <TableCell className="text-sm">{r.label}</TableCell>
                              <TableCell className="text-right font-mono">{r.count}</TableCell>
                              <TableCell className="text-right font-mono">{r.pct}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ReportSection>
      </div>
    </AppLayout>
  );
}