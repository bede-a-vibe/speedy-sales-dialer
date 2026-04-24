import { useMemo, useState } from "react";
import { ArrowUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STAT_CATALOG_BY_ID } from "@/lib/funnelStatsCatalog";
import type { BreakdownGroup } from "@/lib/funnelBreakdown";

interface Props {
  groups: BreakdownGroup[];
  selectedIds: string[];
  dimensionLabel: string;
  onRowClick?: (group: BreakdownGroup) => void;
  activeGroupKey?: string | null;
  onClearActive?: () => void;
}

const DEFAULT_SORT = "dials";

export function BreakdownTable({
  groups,
  selectedIds,
  dimensionLabel,
  onRowClick,
  activeGroupKey,
  onClearActive,
}: Props) {
  const [sortBy, setSortBy] = useState<string>(DEFAULT_SORT);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const stats = useMemo(
    () =>
      selectedIds
        .map((id) => STAT_CATALOG_BY_ID.get(id))
        .filter((s): s is NonNullable<typeof s> => !!s),
    [selectedIds],
  );

  const sorted = useMemo(() => {
    const stat = STAT_CATALOG_BY_ID.get(sortBy);
    if (!stat) return groups;
    // Always keep "Other" at the bottom regardless of sort.
    const real = groups.filter((g) => !g.isOther);
    const other = groups.filter((g) => g.isOther);
    real.sort((a, b) => {
      const va = stat.raw(a.metrics);
      const vb = stat.raw(b.metrics);
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return [...real, ...other];
  }, [groups, sortBy, sortDir]);

  // Per-column best/worst values (only for groups w/ data, ignoring "Other").
  const bestWorst = useMemo(() => {
    const map = new Map<string, { best: number; worst: number; eligible: boolean }>();
    const eligibleGroups = groups.filter((g) => !g.isOther);
    for (const stat of stats) {
      const values = eligibleGroups
        .map((g) => stat.raw(g.metrics))
        .filter((v) => Number.isFinite(v) && v !== 0);
      if (values.length < 3) {
        map.set(stat.id, { best: 0, worst: 0, eligible: false });
        continue;
      }
      map.set(stat.id, {
        best: Math.max(...values),
        worst: Math.min(...values),
        eligible: true,
      });
    }
    return map;
  }, [groups, stats]);

  // Totals row — sum raw metrics across all groups (so it equals the unfiltered overall).
  const totals = useMemo(() => {
    return stats.map((stat) => {
      // For percentage stats we display "—" since summing percentages is meaningless.
      if (stat.isPercent) return { id: stat.id, display: "—" };
      const sum = groups
        .filter((g) => !g.isOther) // Other already counted in real groups? No — overflow rows live only in Other
        .reduce((acc, g) => acc + stat.raw(g.metrics), 0);
      const otherSum = groups.filter((g) => g.isOther).reduce((acc, g) => acc + stat.raw(g.metrics), 0);
      const total = sum + otherSum;
      const integerLike = Math.abs(total - Math.round(total)) < 0.001;
      return { id: stat.id, display: integerLike ? Math.round(total).toLocaleString() : total.toLocaleString() };
    });
  }, [groups, stats]);

  const handleSort = (id: string) => {
    if (sortBy === id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(id);
      setSortDir("desc");
    }
  };

  if (stats.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <p className="text-xs text-muted-foreground">
          No metrics selected — pick columns in the Custom Monitor above to populate this table.
        </p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <p className="text-xs text-muted-foreground">No data for this dimension in the selected period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activeGroupKey && onClearActive ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-0.5 text-xs text-primary">
            Filtered to {activeGroupKey}
            <button
              type="button"
              onClick={onClearActive}
              className="rounded-full p-0.5 hover:bg-primary/10"
              aria-label="Clear filter"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        </div>
      ) : null}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="sticky left-0 bg-muted/40 z-10 min-w-[160px] text-[10px] uppercase tracking-wider">
                  {dimensionLabel}
                </TableHead>
                {stats.map((stat) => {
                  const isSorted = sortBy === stat.id;
                  return (
                    <TableHead key={stat.id} className="text-right whitespace-nowrap min-w-[110px]">
                      <button
                        type="button"
                        onClick={() => handleSort(stat.id)}
                        className={cn(
                          "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider hover:text-foreground",
                          isSorted ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {stat.label}
                        <ArrowUpDown className={cn("h-3 w-3", isSorted ? "opacity-100" : "opacity-30")} />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((group) => {
                const isActive = activeGroupKey === group.label;
                return (
                  <TableRow
                    key={group.key}
                    onClick={() => !group.isOther && onRowClick?.(group)}
                    className={cn(
                      "cursor-pointer",
                      group.isOther && "cursor-default text-muted-foreground italic",
                      isActive && "bg-primary/5",
                    )}
                  >
                    <TableCell
                      className={cn(
                        "sticky left-0 bg-card z-10 text-sm font-medium",
                        isActive && "bg-primary/5",
                      )}
                    >
                      {group.label}
                    </TableCell>
                    {stats.map((stat) => {
                      const value = stat.raw(group.metrics);
                      const display = stat.format(group.metrics);
                      const bw = bestWorst.get(stat.id);
                      const isBest =
                        bw?.eligible && !group.isOther && value === bw.best && value !== 0;
                      const isWorst =
                        bw?.eligible && !group.isOther && value === bw.worst && value !== bw.best;
                      return (
                        <TableCell
                          key={stat.id}
                          className={cn(
                            "text-right font-mono text-sm",
                            isBest && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                            isWorst && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                          )}
                        >
                          {display}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/30 hover:bg-muted/30 font-semibold">
                <TableCell className="sticky left-0 bg-muted/30 z-10 text-sm">Total</TableCell>
                {totals.map((t) => (
                  <TableCell key={t.id} className="text-right font-mono text-sm">
                    {t.display}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
