import { useState } from "react";
import { Settings2, X, ArrowDown, ArrowUp, LayoutGrid, Rows3, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { MetricPickerDialog } from "./MetricPickerDialog";
import { computeDelta, STAT_CATALOG_BY_ID, STAT_CATEGORY_LABEL } from "@/lib/funnelStatsCatalog";
import type { ReportMetrics } from "@/lib/reportMetrics";
import { BENCHMARK_DIMENSIONS, BENCHMARK_NONE } from "@/lib/benchmarkDimensions";

export interface BenchmarkRow {
  label: string;
  metrics: ReportMetrics;
}

interface Props {
  metrics: ReportMetrics;
  previousMetrics?: ReportMetrics;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onSetAll: (ids: string[]) => void;
  onReset: () => void;
  compareMode: boolean;
  /** Compare-by dimension id, or "none" to disable. */
  benchmarkDimensionId: string;
  onBenchmarkDimensionChange: (id: string) => void;
  /** Available category values for the chosen dimension (sorted, top first). */
  benchmarkAvailableValues: string[];
  /** Currently selected category values (capped at 6). */
  benchmarkSelectedValues: string[];
  onBenchmarkSelectedValuesChange: (values: string[]) => void;
  /** Pre-computed metrics, one row per selected category value. */
  benchmarkRows: BenchmarkRow[];
}

type ViewMode = "table" | "cards";

const VIEW_STORAGE_KEY = "funnel:monitor-view:v1";
const MAX_BENCHMARK_VALUES = 6;

function getInitialView(): ViewMode {
  if (typeof window === "undefined") return "table";
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  return v === "cards" ? "cards" : "table";
}

export function CustomStatGrid({
  metrics,
  previousMetrics,
  selectedIds,
  onRemove,
  onSetAll,
  onReset,
  compareMode,
  benchmarkDimensionId,
  onBenchmarkDimensionChange,
  benchmarkAvailableValues,
  benchmarkSelectedValues,
  onBenchmarkSelectedValuesChange,
  benchmarkRows,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<ViewMode>(getInitialView);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleViewChange = (next: ViewMode) => {
    setView(next);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  };

  const visibleStats = selectedIds
    .map((id) => STAT_CATALOG_BY_ID.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const handleApply = (ids: string[]) => onSetAll(ids);

  const handleSort = (id: string) => {
    if (sortBy === id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(id);
      setSortDir("desc");
    }
  };

  const compareByActive = benchmarkDimensionId !== BENCHMARK_NONE;
  const dimensionLabel =
    BENCHMARK_DIMENSIONS.find((d) => d.id === benchmarkDimensionId)?.label ?? "Category";

  const handleValuesChange = (next: string[]) => {
    if (next.length > MAX_BENCHMARK_VALUES) {
      onBenchmarkSelectedValuesChange(next.slice(0, MAX_BENCHMARK_VALUES));
    } else {
      onBenchmarkSelectedValuesChange(next);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar — Meta Ads style */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Your Monitor</h3>
          <p className="text-xs text-muted-foreground">
            {visibleStats.length} {visibleStats.length === 1 ? "metric" : "metrics"} selected
            {compareByActive
              ? ` • benchmarking by ${dimensionLabel}`
              : compareMode && previousMetrics
                ? " • comparing to previous period"
                : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Compare-by dimension */}
          <Select value={benchmarkDimensionId} onValueChange={onBenchmarkDimensionChange}>
            <SelectTrigger className="h-8 w-[180px] border-border bg-card text-xs">
              <SelectValue placeholder="Compare by…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BENCHMARK_NONE}>Compare by: None</SelectItem>
              {BENCHMARK_DIMENSIONS.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  Compare by: {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Values multi-select (only when comparing) */}
          {compareByActive ? (
            <div className="w-[260px]">
              <MultiSelect
                options={benchmarkAvailableValues}
                selected={benchmarkSelectedValues}
                onChange={handleValuesChange}
                placeholder={`Pick up to ${MAX_BENCHMARK_VALUES} ${dimensionLabel.toLowerCase()}…`}
                emptyMessage="No values in this date range"
                maxDisplayed={2}
              />
            </div>
          ) : null}

          {/* View toggle */}
          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
            <button
              type="button"
              onClick={() => handleViewChange("table")}
              className={cn(
                "px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors",
                view === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Table view"
            >
              <Rows3 className="h-3.5 w-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => handleViewChange("cards")}
              className={cn(
                "px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors",
                view === "cards" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Card view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            Customize columns
          </Button>
        </div>
      </div>

      {compareByActive && benchmarkSelectedValues.length > MAX_BENCHMARK_VALUES - 1 ? (
        <p className="text-[10px] text-muted-foreground">Maximum {MAX_BENCHMARK_VALUES} categories.</p>
      ) : null}

      {visibleStats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No metrics selected yet. Click <span className="font-medium text-foreground">"Customize columns"</span>{" "}
            to build your monitor.
          </p>
        </div>
      ) : view === "table" ? (
        compareByActive ? (
          <BenchmarkTableView
            stats={visibleStats}
            rows={benchmarkRows}
            dimensionLabel={dimensionLabel}
            onRemove={onRemove}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
          />
        ) : (
          <TableView
            stats={visibleStats}
            metrics={metrics}
            previousMetrics={previousMetrics}
            compareMode={compareMode}
            onRemove={onRemove}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )
      ) : (
        <CardView
          stats={visibleStats}
          metrics={metrics}
          previousMetrics={previousMetrics}
          compareMode={compareMode && !compareByActive}
          onRemove={onRemove}
        />
      )}

      <MetricPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={selectedIds}
        onApply={handleApply}
        onReset={onReset}
      />
    </div>
  );
}

// ============ Table View (Meta Ads-style) ============

interface ViewProps {
  stats: NonNullable<ReturnType<typeof STAT_CATALOG_BY_ID.get>>[];
  metrics: ReportMetrics;
  previousMetrics?: ReportMetrics;
  compareMode: boolean;
  onRemove: (id: string) => void;
}

function TableView({
  stats,
  metrics,
  previousMetrics,
  compareMode,
  onRemove,
  sortBy,
  sortDir,
  onSort,
}: ViewProps & {
  sortBy: string | null;
  sortDir: "asc" | "desc";
  onSort: (id: string) => void;
}) {
  // Single-row "Total" view — but make columns sortable headers like an Ads Manager table.
  // Each metric is a column. We render one "All time / range" row + optional "Previous period" row.
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="sticky left-0 bg-muted/40 z-10 min-w-[160px] text-xs uppercase tracking-wider">
                Period
              </TableHead>
              {stats.map((stat) => {
                const isSorted = sortBy === stat.id;
                return (
                  <TableHead
                    key={stat.id}
                    className="text-right whitespace-nowrap group min-w-[120px]"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onSort(stat.id)}
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider hover:text-foreground",
                          isSorted ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {stat.label}
                        <ArrowUpDown className={cn("h-3 w-3", isSorted ? "opacity-100" : "opacity-30")} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(stat.id)}
                        className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive transition-opacity"
                        aria-label={`Remove ${stat.label}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-[9px] font-normal text-muted-foreground/70 mt-0.5">
                      {STAT_CATEGORY_LABEL[stat.category]}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="sticky left-0 bg-card z-10 font-medium text-sm">
                Selected period
              </TableCell>
              {stats.map((stat) => (
                <TableCell key={stat.id} className="text-right font-mono text-sm">
                  {stat.format(metrics)}
                </TableCell>
              ))}
            </TableRow>
            {compareMode && previousMetrics && (
              <>
                <TableRow className="bg-muted/20">
                  <TableCell className="sticky left-0 bg-muted/20 z-10 text-sm text-muted-foreground">
                    Previous period
                  </TableCell>
                  {stats.map((stat) => (
                    <TableCell key={stat.id} className="text-right font-mono text-sm text-muted-foreground">
                      {stat.format(previousMetrics)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="sticky left-0 bg-card z-10 text-sm text-muted-foreground">
                    Δ Change
                  </TableCell>
                  {stats.map((stat) => {
                    const delta = computeDelta(stat, metrics, previousMetrics);
                    if (!delta) {
                      return (
                        <TableCell key={stat.id} className="text-right font-mono text-xs text-muted-foreground">
                          —
                        </TableCell>
                      );
                    }
                    const positive = delta.absolute > 0;
                    const negative = delta.absolute < 0;
                    return (
                      <TableCell
                        key={stat.id}
                        className={cn(
                          "text-right font-mono text-xs",
                          positive && "text-[hsl(var(--outcome-booked))]",
                          negative && "text-destructive",
                          !positive && !negative && "text-muted-foreground",
                        )}
                      >
                        <span className="inline-flex items-center gap-0.5 justify-end">
                          {positive && <ArrowUp className="h-2.5 w-2.5" />}
                          {negative && <ArrowDown className="h-2.5 w-2.5" />}
                          {stat.isPercent
                            ? `${Math.abs(delta.absolute)}pp`
                            : "percent" in delta && delta.percent != null
                              ? `${Math.abs(delta.percent)}%`
                              : Math.abs(delta.absolute).toLocaleString()}
                        </span>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============ Card View (compact grid) ============

function CardView({ stats, metrics, previousMetrics, compareMode, onRemove }: ViewProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {stats.map((stat) => {
        const value = stat.format(metrics);
        const delta = compareMode ? computeDelta(stat, metrics, previousMetrics) : null;
        const positive = delta && delta.absolute > 0;
        const negative = delta && delta.absolute < 0;

        return (
          <div
            key={stat.id}
            className="group relative flex flex-col justify-center rounded-md border border-border bg-card px-3 py-2 transition-all hover:border-primary/40"
          >
            <button
              type="button"
              onClick={() => onRemove(stat.id)}
              className="absolute right-1 top-1 rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
              aria-label={`Remove ${stat.label}`}
            >
              <X className="h-3 w-3" />
            </button>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground pr-4">{stat.label}</p>
            <p className="font-mono text-lg font-bold leading-tight text-foreground">{value}</p>
            <div className="mt-0.5 flex items-center justify-between gap-1">
              {stat.subtext ? (
                <p className="text-[10px] text-muted-foreground truncate">{stat.subtext}</p>
              ) : (
                <span />
              )}
              {delta && (positive || negative) && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 font-mono text-[10px]",
                    positive ? "text-[hsl(var(--outcome-booked))]" : "text-destructive",
                  )}
                >
                  {positive ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                  {stat.isPercent
                    ? `${Math.abs(delta.absolute)}pp`
                    : "percent" in delta && delta.percent != null
                      ? `${Math.abs(delta.percent)}%`
                      : Math.abs(delta.absolute).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
