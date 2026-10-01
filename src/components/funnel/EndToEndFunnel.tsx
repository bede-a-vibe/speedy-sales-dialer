import { useMemo, useState } from "react";
import type { ReportMetrics } from "@/lib/reportMetrics";
import type { FunnelMetrics } from "@/lib/funnelMetrics";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CONVERSATION_TAGGING_LAUNCH_LABEL } from "@/data/constants";

interface Props {
  metrics: ReportMetrics;
  funnel: FunnelMetrics;
}

type ViewMode = "of_top" | "of_prev";

interface Stage {
  key: string;
  label: string;
  count: number;
  sub?: string;
  isTotalDials?: boolean;
}

export function EndToEndFunnel({ metrics, funnel }: Props) {
  const [mode, setMode] = useState<ViewMode>("of_top");

  const stages = useMemo<Stage[]>(() => {
    const setter = metrics.appointmentPerformance.setter;
    const avgAttempts = metrics.dialer.uniqueLeadsDialed > 0
      ? (metrics.dialer.dials / metrics.dialer.uniqueLeadsDialed).toFixed(1)
      : "0";

    return [
      {
        key: "unique_leads",
        label: "Unique Leads Dialed",
        count: metrics.dialer.uniqueLeadsDialed,
        sub: `${metrics.dialer.dials.toLocaleString()} total dials · ${avgAttempts} avg / lead`,
      },
      { key: "pickups", label: "Pick Ups", count: metrics.dialer.pickUps },
      {
        key: "conversations",
        label: "Conversations",
        count: metrics.dialer.conversations,
        sub: "reached connection",
      },
      {
        key: "problem",
        label: "Problem Awareness",
        count: funnel.stages.find((s) => s.key === "problem_awareness")?.count ?? 0,
      },
      {
        key: "solution",
        label: "Solution Awareness",
        count: funnel.stages.find((s) => s.key === "solution_awareness")?.count ?? 0,
      },
      {
        key: "commitment",
        label: "Verbal Commitment",
        count: funnel.stages.find((s) => s.key === "commitment")?.count ?? 0,
      },
      {
        key: "bookings",
        label: "Bookings Made",
        count: metrics.bookingsMade.totalBookingsMade,
        sub: funnel.bookedWithoutFunnelTags > 0
          ? `+${funnel.bookedWithoutFunnelTags} booked without funnel tags`
          : undefined,
      },
      { key: "showed", label: "Showed", count: setter.showed },
      { key: "closed", label: "Closed", count: setter.showedClosed },
    ];
  }, [metrics, funnel]);

  const top = stages[0]?.count || 1;
  const maxBar = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">End-to-End Call Funnel</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Every step from first dial to closed deal. {mode === "of_top" ? "% shown is conversion from top of funnel." : "% shown is conversion from previous stage."}
          </p>
          {funnel.scoped && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Connection-stage tracking started {CONVERSATION_TAGGING_LAUNCH_LABEL} — Conversation, Problem, Solution & Commitment counts only include calls from that date forward.
            </p>
          )}
        </div>
        <div className="flex rounded-md border border-border bg-card p-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 px-2 text-xs", mode === "of_top" && "bg-primary/10 text-primary")}
            onClick={() => setMode("of_top")}
          >
            % of top
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 px-2 text-xs", mode === "of_prev" && "bg-primary/10 text-primary")}
            onClick={() => setMode("of_prev")}
          >
            % of prev
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {stages.map((stage, i) => {
          const prev = i > 0 ? stages[i - 1].count : 0;
          const pctOfTop = top > 0 ? Math.round((stage.count / top) * 100) : 0;
          const pctOfPrev = i === 0 ? 100 : prev > 0 ? Math.round((stage.count / prev) * 100) : 0;
          const dropFromPrev = i === 0 || prev === 0 ? 0 : Math.round(((prev - stage.count) / prev) * 100);
          const barPct = maxBar > 0 ? Math.max((stage.count / maxBar) * 100, stage.count > 0 ? 2 : 0) : 0;
          const shownPct = mode === "of_top" ? pctOfTop : pctOfPrev;

          return (
            <div key={stage.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-1 sm:flex sm:gap-3">
              <div className="min-w-0 sm:w-44 sm:shrink-0">
                <div className="text-sm text-foreground">{stage.label}</div>
                {stage.sub && <div className="text-[10px] text-muted-foreground truncate">{stage.sub}</div>}
              </div>
              <div className="col-span-3 order-last sm:order-none sm:col-span-1 sm:flex-1">
                <div className="relative h-6 rounded-md bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/80 transition-all"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
              <div className="sm:w-16 text-right font-mono text-sm font-semibold text-foreground">
                {stage.count.toLocaleString()}
              </div>
              <div className="sm:w-14 text-right font-mono text-sm text-muted-foreground">{shownPct}%</div>
              <div className="hidden sm:block sm:w-20 text-right font-mono text-xs text-destructive">
                {i === 0 ? "" : `-${dropFromPrev}%`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}