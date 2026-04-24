import { useState } from "react";
import { Plus, X, ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MetricPickerDialog } from "./MetricPickerDialog";
import { computeDelta, STAT_CATALOG_BY_ID } from "@/lib/funnelStatsCatalog";
import type { ReportMetrics } from "@/lib/reportMetrics";

interface Props {
  metrics: ReportMetrics;
  previousMetrics?: ReportMetrics;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  compareMode: boolean;
}

export function CustomStatGrid({ metrics, previousMetrics, selectedIds, onToggle, onRemove, compareMode }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const visibleStats = selectedIds
    .map((id) => STAT_CATALOG_BY_ID.get(id))
    .filter((s): s is NonNullable<typeof s> => !!s);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Your Monitor</h3>
          <p className="text-xs text-muted-foreground">Pick the stats you want to track. Saved per user.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add metric
        </Button>
      </div>

      {visibleStats.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">No metrics selected yet. Click "Add metric" to start.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibleStats.map((stat) => {
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
                  ) : <span />}
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
      )}

      <MetricPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={selectedIds}
        onToggle={onToggle}
      />
    </div>
  );
}