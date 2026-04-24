import { useEffect, useMemo, useState } from "react";
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
import { CustomStatGrid, type BenchmarkRow } from "@/components/funnel/CustomStatGrid";
import { MetricTrendChart } from "@/components/funnel/MetricTrendChart";
import { useFunnelMetricSelection } from "@/hooks/useFunnelMetricSelection";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BREAKDOWN_DIMENSIONS,
  buildBreakdownGroups,
  type BreakdownDimensionId,
} from "@/lib/funnelBreakdown";
import { BreakdownTable } from "@/components/funnel/BreakdownTable";
import {
  BENCHMARK_DIMENSIONS_BY_ID,
  BENCHMARK_NONE,
  listDimensionValues,
} from "@/lib/benchmarkDimensions";
import { cn } from "@/lib/utils";

const ALL_REPS_VALUE = "all";
const MAX_BENCHMARK_VALUES = 6;
const BENCHMARK_DIM_KEY = "funnel:benchmark-dim:v1";
const BENCHMARK_VALUES_KEY = "funnel:benchmark-values:v1";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

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
  const [breakdown, setBreakdown] = useState<BreakdownDimensionId>("none");
  const [activeGroupLabel, setActiveGroupLabel] = useState<string | null>(null);

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

  const repNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of reps) m.set(r.user_id, r.display_name || r.email || "Unnamed rep");
    return m;
  }, [reps]);

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

  // ===== Benchmark / Compare-by state =====
  const [benchmarkDim, setBenchmarkDim] = useState<string>(() =>
    readJSON<string>(BENCHMARK_DIM_KEY, BENCHMARK_NONE),
  );
  const [benchmarkValuesByDim, setBenchmarkValuesByDim] = useState<Record<string, string[]>>(() =>
    readJSON<Record<string, string[]>>(BENCHMARK_VALUES_KEY, {}),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BENCHMARK_DIM_KEY, JSON.stringify(benchmarkDim));
  }, [benchmarkDim]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BENCHMARK_VALUES_KEY, JSON.stringify(benchmarkValuesByDim));
  }, [benchmarkValuesByDim]);

  // Pre-filter call logs by rep so the benchmark uses the same scope as the headline metrics.
  const repFilteredCallLogs = useMemo(
    () => (activeRepId ? callLogs.filter((l: any) => l.user_id === activeRepId) : callLogs),
    [callLogs, activeRepId],
  );

  // Available values (sorted by activity) for the chosen dimension.
  const benchmarkAvailableValues = useMemo(() => {
    if (benchmarkDim === BENCHMARK_NONE) return [];
    return listDimensionValues(benchmarkDim, repFilteredCallLogs as any).map((v) => v.value);
  }, [benchmarkDim, repFilteredCallLogs]);

  const benchmarkSelectedValues = useMemo(() => {
    if (benchmarkDim === BENCHMARK_NONE) return [];
    const stored = benchmarkValuesByDim[benchmarkDim] ?? [];
    // Only keep values that still exist in the data; if empty, default to top 3.
    const present = stored.filter((v) => benchmarkAvailableValues.includes(v));
    if (present.length > 0) return present.slice(0, MAX_BENCHMARK_VALUES);
    return benchmarkAvailableValues.slice(0, 3);
  }, [benchmarkDim, benchmarkValuesByDim, benchmarkAvailableValues]);

  const handleBenchmarkDimChange = (id: string) => {
    setBenchmarkDim(id);
  };
  const handleBenchmarkValuesChange = (values: string[]) => {
    if (benchmarkDim === BENCHMARK_NONE) return;
    setBenchmarkValuesByDim((prev) => ({ ...prev, [benchmarkDim]: values }));
  };

  // Compute one ReportMetrics per selected category value.
  const benchmarkRows: BenchmarkRow[] = useMemo(() => {
    if (benchmarkDim === BENCHMARK_NONE || benchmarkSelectedValues.length === 0) return [];
    const dim = BENCHMARK_DIMENSIONS_BY_ID.get(benchmarkDim);
    if (!dim) return [];
    return benchmarkSelectedValues.map((value) => {
      const filteredLogs = (callLogs as any[]).filter((l) => dim.getValue(l) === value);
      const filteredBookings = (bookedAppointments as any[]).filter((b) => dim.getValue(b) === value);
      const m = getReportMetrics({
        callLogs: filteredLogs,
        bookedItems: filteredBookings,
        from: dateFrom,
        to: dateTo,
        repUserId: activeRepId,
        contacts: contactAttempts,
      });
      return { label: value, metrics: m };
    });
  }, [benchmarkDim, benchmarkSelectedValues, callLogs, bookedAppointments, dateFrom, dateTo, activeRepId, contactAttempts]);

  const breakdownGroups = useMemo(() => {
    if (breakdown === "none") return [];
    return buildBreakdownGroups({
      dimension: breakdown,
      callLogs: callLogs as never,
      bookings: bookedAppointments as never,
      contacts: contactAttempts,
      from: dateFrom,
      to: dateTo,
      repUserId: activeRepId,
      repNameMap,
      topN: 10,
    });
  }, [breakdown, callLogs, bookedAppointments, contactAttempts, dateFrom, dateTo, activeRepId, repNameMap]);

  const filteredBreakdownGroups = useMemo(() => {
    if (!activeGroupLabel) return breakdownGroups;
    return breakdownGroups.filter((g) => g.label === activeGroupLabel);
  }, [breakdownGroups, activeGroupLabel]);

  const breakdownLabel =
    BREAKDOWN_DIMENSIONS.find((d) => d.id === breakdown)?.label ?? "Breakdown";

  const compareByActive = benchmarkDim !== BENCHMARK_NONE;

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
        breakdown={breakdown}
        onBreakdownChange={(v) => {
          setBreakdown(v as BreakdownDimensionId);
          setActiveGroupLabel(null);
        }}
        breakdownOptions={BREAKDOWN_DIMENSIONS}
      />

      <div className="mx-auto max-w-6xl space-y-5 pt-5">
        <div className="flex items-center justify-end gap-2">
          <Label
            htmlFor="compare-toggle"
            className={cn(
              "cursor-pointer text-xs",
              compareByActive ? "text-muted-foreground/50" : "text-muted-foreground",
            )}
            title={compareByActive ? "Switch off Compare-by to enable previous-period comparison" : undefined}
          >
            Compare to previous period
          </Label>
          <Switch
            id="compare-toggle"
            checked={compareMode && !compareByActive}
            onCheckedChange={setCompareMode}
            disabled={compareByActive}
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
            compareMode={compareMode && !compareByActive}
            benchmarkDimensionId={benchmarkDim}
            onBenchmarkDimensionChange={handleBenchmarkDimChange}
            benchmarkAvailableValues={benchmarkAvailableValues}
            benchmarkSelectedValues={benchmarkSelectedValues}
            onBenchmarkSelectedValuesChange={handleBenchmarkValuesChange}
            benchmarkRows={benchmarkRows}
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
            breakdownGroups={breakdown !== "none" ? filteredBreakdownGroups : undefined}
          />
        </ReportSection>

        {breakdown !== "none" ? (
          <ReportSection
            title={`Breakdown by ${breakdownLabel}`}
            description="Compare your selected metrics across categories. Click a row to filter the trend chart to just that group."
          >
            <BreakdownTable
              groups={breakdownGroups}
              selectedIds={selectedIds}
              dimensionLabel={breakdownLabel}
              activeGroupKey={activeGroupLabel}
              onClearActive={() => setActiveGroupLabel(null)}
              onRowClick={(g) => setActiveGroupLabel((cur) => (cur === g.label ? null : g.label))}
            />
          </ReportSection>
        ) : null}

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