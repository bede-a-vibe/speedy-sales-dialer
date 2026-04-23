import { AlertTriangle, Lightbulb, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatHourLabel, type RepCoachingScorecard } from "@/lib/repCoachingMetrics";

interface Props {
  scorecards: RepCoachingScorecard[];
  repNameMap: Map<string, string>;
  expanded?: boolean;
}

export function RepCoachingPanel({ scorecards, repNameMap, expanded = false }: Props) {
  if (scorecards.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No rep activity in this date range. Reps need to log calls and tag conversation stages for coaching insights.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {scorecards.map((s) => (
        <RepScorecard key={s.repUserId} scorecard={s} repName={repNameMap.get(s.repUserId) ?? "Unnamed rep"} expanded={expanded} />
      ))}
    </div>
  );
}

function RepScorecard({
  scorecard,
  repName,
  expanded,
}: {
  scorecard: RepCoachingScorecard;
  repName: string;
  expanded: boolean;
}) {
  const { funnel, worstFunnelStage, topExitReason, bestPickupHours, bestBookingHours, insightLines } = scorecard;

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold text-foreground">{repName}</h3>
          <span className="font-mono text-xs text-muted-foreground">
            {scorecard.totalDials} dials · {scorecard.totalPickUps} pick-ups · {scorecard.totalBookings} bookings
          </span>
        </div>
        {worstFunnelStage && worstFunnelStage.dropPct >= 50 && (
          <Badge variant="destructive" className="text-[10px] uppercase tracking-widest">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {worstFunnelStage.dropPct}% drop at {worstFunnelStage.label}
          </Badge>
        )}
      </div>

      {/* Funnel Leak Strip */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground">Funnel Leak</h4>
        </div>
        {funnel.totalTracked === 0 ? (
          <p className="text-xs text-muted-foreground">No funnel stages tagged yet.</p>
        ) : (
          <div className="space-y-1.5">
            {funnel.stages.map((stage, i) => {
              const isWorstDrop = worstFunnelStage?.key === stage.key && stage.dropFromPrev > 0;
              return (
                <div key={stage.key} className="flex items-center gap-3">
                  <div className="w-40 truncate text-xs text-foreground">{stage.label}</div>
                  <div className="flex-1">
                    <div className="relative h-4 overflow-hidden rounded bg-muted">
                      <div
                        className={`absolute inset-y-0 left-0 ${isWorstDrop ? "bg-destructive/70" : "bg-primary/70"}`}
                        style={{ width: `${Math.max(stage.pctOfTop, 0)}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-12 text-right font-mono text-xs text-foreground">{stage.count}</div>
                  <div className="w-20 text-right font-mono text-xs">
                    {i === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : stage.dropFromPrev > 0 ? (
                      <span className={isWorstDrop ? "font-semibold text-destructive" : "text-muted-foreground"}>
                        −{stage.dropFromPrev}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top Exit Reason */}
      {topExitReason && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-foreground">
              <span className="font-semibold">Biggest leak:</span> {topExitReason.topReasonLabel} —{" "}
              <span className="text-muted-foreground">
                {topExitReason.pctOfStageDrops}% of {topExitReason.stageLabel} drops · {topExitReason.topReasonCount} calls
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Timing Windows */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground">Best Pick-Up Hours</h4>
          </div>
          {bestPickupHours.length === 0 ? (
            <p className="text-xs text-muted-foreground">Not enough volume yet (need 5+ dials/hour).</p>
          ) : (
            <ul className="space-y-1">
              {bestPickupHours.map((h) => (
                <li key={h.hour} className="flex items-baseline justify-between font-mono text-xs">
                  <span className="text-foreground">{formatHourLabel(h.hour)}</span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{h.pickUpRate}%</span> · {h.dials} dials
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-[10px] uppercase tracking-widest text-muted-foreground">Best Booking Hours</h4>
          </div>
          {bestBookingHours.length === 0 ? (
            <p className="text-xs text-muted-foreground">No bookings recorded.</p>
          ) : (
            <ul className="space-y-1">
              {bestBookingHours.map((h) => (
                <li key={h.hour} className="flex items-baseline justify-between font-mono text-xs">
                  <span className="text-foreground">{formatHourLabel(h.hour)}</span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{h.bookings}</span> booking
                    {h.bookings !== 1 ? "s" : ""} · {h.conversionPct}% conv
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Insight Lines */}
      {insightLines.length > 0 && (
        <div className="border-t border-border pt-3">
          <h4 className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Coaching Cues</h4>
          <ul className="space-y-1">
            {insightLines.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      {expanded && funnel.totalTracked > 0 && (
        <p className="text-[10px] italic text-muted-foreground">Tip: switch back to "All reps" to compare across the team.</p>
      )}
    </div>
  );
}