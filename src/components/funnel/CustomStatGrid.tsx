import { useState } from "react";
import {
  Settings2,
  X,
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  Rows3,
  ArrowUpDown,
  Users,
  User,
  Pencil,
  Plus,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { MetricPickerDialog } from "./MetricPickerDialog";
import { computeDelta, STAT_CATALOG_BY_ID, STAT_CATEGORY_LABEL } from "@/lib/funnelStatsCatalog";
import type { ReportMetrics } from "@/lib/reportMetrics";
import { BENCHMARK_DIMENSIONS, BENCHMARK_NONE } from "@/lib/benchmarkDimensions";
import type { Segment } from "@/lib/benchmarkSegments";
import { summarizeSegmentFilters } from "@/lib/benchmarkSegments";

export interface BenchmarkRow {
  label: string;
  metrics: ReportMetrics;
}

export interface SegmentRow {
  segment: Segment;
  metrics: ReportMetrics;
  matchingContacts?: number | null;
}

export type MonitorMode = "single" | "dimension" | "segments";

interface Props {
  metrics: ReportMetrics;
  previousMetrics?: ReportMetrics;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onSetAll: (ids: string[]) => void;
  onReset: () => void;
  compareMode: boolean;
  /** Current monitor mode. */
  mode: MonitorMode;
  onModeChange: (mode: MonitorMode) => void;
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
  /** Saved segments (team + private), pre-merged. */
  segments: Segment[];
  /** Pre-computed metrics, one row per segment. */
  segmentRows: SegmentRow[];
  /** Open the editor dialog for a new segment. */
  onCreateSegment: () => void;
  /** Open the editor dialog for an existing segment. */
  onEditSegment: (segment: Segment) => void;
  /** Delete a segment. */
  onDeleteSegment: (segment: Segment) => void;
  /** Returns true if the current user can edit/delete a given segment. */
  canEditSegment: (segment: Segment) => boolean;
}

type ViewMode = "table" | "cards" | "bars";

const VIEW_STORAGE_KEY = "funnel:monitor-view:v1";
const MAX_BENCHMARK_VALUES = 6;

function getInitialView(): ViewMode {
  if (typeof window === "undefined") return "table";
  const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (v === "cards") return "cards";
  if (v === "bars") return "bars";
  return "table";
}

export function CustomStatGrid({
  metrics,
  previousMetrics,
  selectedIds,
  onRemove,
  onSetAll,
  onReset,
  compareMode,
  mode,
  onModeChange,
  benchmarkDimensionId,
  onBenchmarkDimensionChange,
  benchmarkAvailableValues,
  benchmarkSelectedValues,
  onBenchmarkSelectedValuesChange,
  benchmarkRows,
  segments,
  segmentRows,
  onCreateSegment,
  onEditSegment,
  onDeleteSegment,
  canEditSegment,
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

  const compareByActive = mode === "dimension" && benchmarkDimensionId !== BENCHMARK_NONE;
  const segmentsActive = mode === "segments";
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
            {segmentsActive
              ? ` • ${segmentRows.length} ${segmentRows.length === 1 ? "segment" : "segments"}`
              : compareByActive
                ? ` • benchmarking by ${dimensionLabel}`
                : compareMode && previousMetrics
                  ? " • comparing to previous period"
                  : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Mode toggle: Single | By Dimension | Segments */}
          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
            {(
              [
                { id: "single", label: "Single" },
                { id: "dimension", label: "By Dimension" },
                { id: "segments", label: "Segments" },
              ] as { id: MonitorMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onModeChange(m.id)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  mode === m.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Dimension picker — only when mode = "dimension" */}
          {mode === "dimension" ? (
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
          ) : null}

          {/* Values multi-select (only when comparing by dimension) */}
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

          {/* New segment button — only in segments mode */}
          {segmentsActive ? (
            <Button variant="outline" size="sm" onClick={onCreateSegment}>
              <Plus className="h-3.5 w-3.5" />
              New Segment
            </Button>
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
            <button
              type="button"
              onClick={() => handleViewChange("bars")}
              className={cn(
                "px-2 py-1 rounded text-xs flex items-center gap-1 transition-colors",
                view === "bars" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-label="Bar comparison view"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Bars
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

      {/* Segment chip strip */}
      {segmentsActive && segments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {segments.map((seg) => {
            const editable = canEditSegment(seg);
            return (
              <div
                key={seg.id}
                className={cn(
                  "group inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-xs",
                  editable && "cursor-pointer hover:border-primary/40",
                )}
                onClick={editable ? () => onEditSegment(seg) : undefined}
                title={editable ? "Click to edit" : "Read-only (created by another user)"}
              >
                {seg.shared ? (
                  <Users className="h-3 w-3 text-primary" />
                ) : (
                  <User className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="font-medium text-foreground">{seg.name}</span>
                {editable ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete segment "${seg.name}"?`)) onDeleteSegment(seg);
                    }}
                    className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
                    aria-label={`Remove ${seg.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {visibleStats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No metrics selected yet. Click <span className="font-medium text-foreground">"Customize columns"</span>{" "}
            to build your monitor.
          </p>
        </div>
      ) : segmentsActive ? (
        segments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No segments yet. A segment is a saved combination of filters (state, industry, business size,
              ads, etc.) that becomes one row in the table — perfect for benchmarking different cohorts side
              by side.
            </p>
            <Button size="sm" className="mt-4" onClick={onCreateSegment}>
              <Plus className="h-3.5 w-3.5" />
              Create your first segment
            </Button>
          </div>
        ) : view === "bars" ? (
          <BarComparisonView
            stats={visibleStats}
            rows={segmentRows.map((r) => ({ label: r.segment.name, metrics: r.metrics }))}
            groupLabel="Segment"
          />
        ) : (
          <SegmentTableView
            stats={visibleStats}
            rows={segmentRows}
            onRemoveStat={onRemove}
            onEditSegment={onEditSegment}
            canEditSegment={canEditSegment}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )
      ) : view === "bars" ? (
        compareByActive ? (
          <BarComparisonView
            stats={visibleStats}
            rows={benchmarkRows}
            groupLabel={dimensionLabel}
          />
        ) : (
          <BarComparisonView
            stats={visibleStats}
            rows={
              compareMode && previousMetrics
                ? [
                    { label: "Selected period", metrics },
                    { label: "Previous period", metrics: previousMetrics },
                  ]
                : [{ label: "Selected period", metrics }]
            }
            groupLabel="Period"
          />
        )
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

// ============ Segment Table View (one row per saved segment) ============

function SegmentTableView({
  stats,
  rows,
  onRemoveStat,
  onEditSegment,
  canEditSegment,
  sortBy,
  sortDir,
  onSort,
}: {
  stats: NonNullable<ReturnType<typeof STAT_CATALOG_BY_ID.get>>[];
  rows: SegmentRow[];
  onRemoveStat: (id: string) => void;
  onEditSegment: (segment: Segment) => void;
  canEditSegment: (segment: Segment) => boolean;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  onSort: (id: string) => void;
}) {
  const sortedRows = (() => {
    if (!sortBy) return rows;
    const stat = STAT_CATALOG_BY_ID.get(sortBy);
    if (!stat) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = stat.raw(a.metrics);
      const bv = stat.raw(b.metrics);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  })();

  // Best/worst per column — only when ≥3 segments have non-zero data.
  const bestWorst = new Map<string, { best: number; worst: number }>();
  for (const stat of stats) {
    const values = rows.map((r) => stat.raw(r.metrics)).filter((v) => v > 0);
    if (values.length < 3) continue;
    bestWorst.set(stat.id, { best: Math.max(...values), worst: Math.min(...values) });
  }

  // Totals row (sum non-percent stats; leave percents blank).
  const totalsMetrics = (() => {
    if (rows.length === 0) return null;
    // Sum aggregable stats by re-summing the raw values per stat. For percent
    // stats we display "—" (averaging % across segments is misleading).
    return rows;
  })();

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="sticky left-0 bg-muted/40 z-10 min-w-[220px] text-xs uppercase tracking-wider">
                Segment
              </TableHead>
              {stats.map((stat) => {
                const isSorted = sortBy === stat.id;
                return (
                  <TableHead key={stat.id} className="text-right whitespace-nowrap group min-w-[120px]">
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
                        onClick={() => onRemoveStat(stat.id)}
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
            {sortedRows.map((row) => {
              const summary = summarizeSegmentFilters(row.segment);
              const editable = canEditSegment(row.segment);
              const dialsRaw = row.metrics.dialer.dials;
              return (
                <TableRow key={row.segment.id} className="group">
                  <TableCell className="sticky left-0 bg-card z-10">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        {row.segment.shared ? (
                          <Users className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground truncate">
                            {row.segment.name}
                          </span>
                          {editable ? (
                            <button
                              type="button"
                              onClick={() => onEditSegment(row.segment)}
                              className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                              aria-label={`Edit ${row.segment.name}`}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{summary}</div>
                        {typeof row.matchingContacts === "number" ? (
                          <div className="text-[10px] text-muted-foreground/70 font-mono">
                            {row.matchingContacts.toLocaleString()} contacts in pool
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  {stats.map((stat) => {
                    const value = stat.raw(row.metrics);
                    const isEmpty = dialsRaw === 0 && value === 0;
                    const bw = bestWorst.get(stat.id);
                    const isBest = bw && value > 0 && value === bw.best && bw.best !== bw.worst;
                    const isWorst = bw && value > 0 && value === bw.worst && bw.best !== bw.worst;
                    return (
                      <TableCell
                        key={stat.id}
                        className={cn(
                          "text-right font-mono text-sm",
                          isEmpty && "text-muted-foreground/40",
                          isBest && "bg-[hsl(var(--outcome-booked))]/10 text-[hsl(var(--outcome-booked))]",
                          isWorst && "bg-destructive/10 text-destructive",
                        )}
                      >
                        {isEmpty ? "—" : stat.format(row.metrics)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}

            {/* Totals row — sums numeric stats, blanks percents */}
            {totalsMetrics && totalsMetrics.length > 0 ? (
              <TableRow className="bg-muted/30 font-medium">
                <TableCell className="sticky left-0 bg-muted/30 z-10 text-sm">Total</TableCell>
                {stats.map((stat) => {
                  if (stat.isPercent) {
                    return (
                      <TableCell key={stat.id} className="text-right font-mono text-sm text-muted-foreground">
                        —
                      </TableCell>
                    );
                  }
                  const sum = totalsMetrics.reduce((acc, r) => acc + stat.raw(r.metrics), 0);
                  return (
                    <TableCell key={stat.id} className="text-right font-mono text-sm">
                      {Number.isInteger(sum) ? sum.toLocaleString() : sum.toFixed(1)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ) : null}
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

// ============ Benchmark Table View (one row per category) ============

function BenchmarkTableView({
  stats,
  rows,
  dimensionLabel,
  onRemove,
  sortBy,
  sortDir,
  onSort,
}: {
  stats: NonNullable<ReturnType<typeof STAT_CATALOG_BY_ID.get>>[];
  rows: BenchmarkRow[];
  dimensionLabel: string;
  onRemove: (id: string) => void;
  sortBy: string | null;
  sortDir: "asc" | "desc";
  onSort: (id: string) => void;
}) {
  const sortedRows = (() => {
    if (!sortBy) return rows;
    const stat = STAT_CATALOG_BY_ID.get(sortBy);
    if (!stat) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = stat.raw(a.metrics);
      const bv = stat.raw(b.metrics);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return copy;
  })();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Pick at least one {dimensionLabel.toLowerCase()} value above to start comparing.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="sticky left-0 bg-muted/40 z-10 min-w-[180px] text-xs uppercase tracking-wider">
                {dimensionLabel}
              </TableHead>
              {stats.map((stat) => {
                const isSorted = sortBy === stat.id;
                return (
                  <TableHead key={stat.id} className="text-right whitespace-nowrap group min-w-[120px]">
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
            {sortedRows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="sticky left-0 bg-card z-10 font-medium text-sm">
                  {row.label}
                </TableCell>
                {stats.map((stat) => (
                  <TableCell key={stat.id} className="text-right font-mono text-sm">
                    {stat.format(row.metrics)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
