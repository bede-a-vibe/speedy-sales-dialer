import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { HeatMapCell } from "@/lib/hourlyMetrics";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_START = 6;
const HOUR_END = 21; // 6am–9pm display range

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "pm" : "am";
  const h = hour % 12 || 12;
  return `${h}${suffix}`;
}

interface Props {
  cells: HeatMapCell[];
  repLabel?: string;
}

export function BookingHeatMap({ cells, repLabel }: Props) {
  const { maxCount, grid } = useMemo(() => {
    const grid = new Map<string, number>();
    let maxCount = 0;
    for (const c of cells) {
      if (c.hour < HOUR_START || c.hour > HOUR_END) continue;
      grid.set(`${c.dayOfWeek}-${c.hour}`, c.count);
      if (c.count > maxCount) maxCount = c.count;
    }
    return { maxCount, grid };
  }, [cells]);

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  if (maxCount === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No bookings{repLabel ? ` for ${repLabel}` : ""} in this date range to generate a heat map.</p>;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="overflow-x-auto">
        {repLabel && (
          <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Showing bookings for {repLabel}</p>
        )}
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `56px repeat(${hours.length}, 1fr)` }}>
          {/* Header row */}
          <div />
          {hours.map((h) => (
            <div key={h} className="px-1 text-center text-[10px] text-muted-foreground">
              {formatHour(h)}
            </div>
          ))}

          {/* Data rows */}
          {DAY_LABELS.map((day, dow) => (
            <>
              <div key={`label-${dow}`} className="flex items-center text-xs font-medium text-muted-foreground">
                {day}
              </div>
              {hours.map((h) => {
                const count = grid.get(`${dow}-${h}`) ?? 0;
                const intensity = maxCount > 0 ? count / maxCount : 0;
                return (
                  <Tooltip key={`${dow}-${h}`}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-7 min-w-[28px] rounded-sm border border-border transition-colors"
                        style={{
                          backgroundColor: intensity > 0
                            ? `hsl(var(--primary) / ${Math.max(0.08, intensity * 0.9)})`
                            : "hsl(var(--muted) / 0.3)",
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <span className="font-semibold">{count}</span> booking{count !== 1 ? "s" : ""} · {day} {formatHour(h)}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <div
              key={v}
              className="h-3 w-3 rounded-sm border border-border"
              style={{
                backgroundColor: v > 0
                  ? `hsl(var(--primary) / ${Math.max(0.08, v * 0.9)})`
                  : "hsl(var(--muted) / 0.3)",
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
