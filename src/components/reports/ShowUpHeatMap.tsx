import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { ShowUpHeatMapCell } from "@/lib/hourlyMetrics";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_START = 6;
const HOUR_END = 21;

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "pm" : "am";
  const h = hour % 12 || 12;
  return `${h}${suffix}`;
}

interface Props {
  cells: ShowUpHeatMapCell[];
  /** A cell needs this many resolved slots before its colour means anything. */
  minSlots?: number;
}

/**
 * Show-up rate by the day and hour the meeting was scheduled for. Colour is the
 * rate; a cell with fewer than `minSlots` resolved slots stays grey so one lucky
 * 1-for-1 slot never reads as the best hour of the week.
 */
export function ShowUpHeatMap({ cells, minSlots = 3 }: Props) {
  const { grid, hasData, best } = useMemo(() => {
    const grid = new Map<string, ShowUpHeatMapCell>();
    let hasData = false;
    let best: ShowUpHeatMapCell | null = null;
    for (const c of cells) {
      if (c.hour < HOUR_START || c.hour > HOUR_END) continue;
      grid.set(`${c.dayOfWeek}-${c.hour}`, c);
      if (c.resolved > 0) hasData = true;
      if (c.resolved >= minSlots && (!best || c.showUpRate > best.showUpRate || (c.showUpRate === best.showUpRate && c.resolved > best.resolved))) best = c;
    }
    return { grid, hasData, best };
  }, [cells, minSlots]);

  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);

  if (!hasData) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No resolved meetings in this date range.</p>;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="overflow-x-auto">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `56px repeat(${hours.length}, 1fr)` }}>
          <div />
          {hours.map((h) => (
            <div key={h} className="px-1 text-center text-[10px] text-muted-foreground">
              {formatHour(h)}
            </div>
          ))}

          {DAY_LABELS.map((day, dow) => (
            <>
              <div key={`label-${dow}`} className="flex items-center text-xs font-medium text-muted-foreground">
                {day}
              </div>
              {hours.map((h) => {
                const cell = grid.get(`${dow}-${h}`);
                const resolved = cell?.resolved ?? 0;
                const showed = cell?.showed ?? 0;
                const rate = cell?.showUpRate ?? 0;
                const qualifies = resolved >= minSlots;
                const intensity = qualifies ? rate : 0;
                return (
                  <Tooltip key={`${dow}-${h}`}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-7 min-w-[28px] rounded-sm border border-border transition-colors"
                        style={{
                          backgroundColor: intensity > 0
                            ? `hsl(var(--primary) / ${Math.max(0.08, intensity * 0.9)})`
                            : resolved > 0
                              ? "hsl(var(--muted) / 0.5)"
                              : "hsl(var(--muted) / 0.3)",
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {resolved === 0 ? (
                        <span className="text-muted-foreground">No meetings · {day} {formatHour(h)}</span>
                      ) : (
                        <>
                          <span className="font-semibold">{Math.round(rate * 100)}%</span> showed ·{" "}
                          {showed}/{resolved} slots · {day} {formatHour(h)}
                          {!qualifies && <span className="ml-1 text-muted-foreground">(low volume)</span>}
                        </>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>Lower</span>
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
          <span>Higher show-up %</span>
          <span className="ml-3">· Cells need {minSlots}+ resolved slots to qualify</span>
          {best ? (
            <span className="ml-3">
              · Best: {DAY_LABELS[best.dayOfWeek]} {formatHour(best.hour)}, {best.showed}/{best.resolved} showed
            </span>
          ) : null}
        </div>
      </div>
    </TooltipProvider>
  );
}
