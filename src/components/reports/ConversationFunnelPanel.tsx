import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCallOpeners } from "@/hooks/useCallOpeners";
import {
  computeFunnel,
  computeOpenerMetrics,
  computeStageExitBreakdowns,
  computeTopCoachingCue,
  filterFunnelLogs,
} from "@/lib/funnelMetrics";
import { computeRepLeakLeaderboard } from "@/lib/repCoachingMetrics";
import { RepLeakLeaderboardTable } from "./RepLeakLeaderboardTable";
import { Lightbulb, PhoneOff } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type CallLogRow = Pick<
  Tables<"call_logs">,
  | "id"
  | "user_id"
  | "outcome"
  | "created_at"
  | "reached_connection"
  | "reached_problem_awareness"
  | "reached_solution_awareness"
  | "reached_commitment"
  | "opener_used_id"
  | "exit_reason_connection"
  | "exit_reason_problem"
  | "exit_reason_solution"
  | "exit_reason_commitment"
  | "exit_reason_booking"
>;

interface Props {
  callLogs: CallLogRow[];
  from?: string;
  to?: string;
  repUserId?: string;
  repLabel?: string;
  repNameMap?: Map<string, string>;
}

export function ConversationFunnelPanel({ callLogs, from, to, repUserId, repLabel, repNameMap }: Props) {
  const { data: openers = [] } = useCallOpeners(true);

  const filtered = useMemo(() => filterFunnelLogs(callLogs, { from, to, repUserId }), [callLogs, from, to, repUserId]);

  const funnel = useMemo(() => computeFunnel(filtered), [filtered]);

  const openerNames = useMemo(() => {
    const map = new Map<string, string>();
    openers.forEach((o) => map.set(o.id, o.name));
    return map;
  }, [openers]);

  const openerMetrics = useMemo(() => computeOpenerMetrics(filtered, openerNames), [filtered, openerNames]);
  const stageBreakdowns = useMemo(() => computeStageExitBreakdowns(filtered), [filtered]);
  const coachingCue = useMemo(() => computeTopCoachingCue(filtered), [filtered]);

  const subjectLabel = repLabel ?? "Team";

  const leakLeaderboard = useMemo(() => {
    if (repUserId) return [];
    const dateFiltered = filterFunnelLogs(callLogs, { from, to });
    const repIds = Array.from(new Set(dateFiltered.map((l) => l.user_id).filter(Boolean)));
    return computeRepLeakLeaderboard(repIds, dateFiltered as never);
  }, [callLogs, from, to, repUserId]);

  const hangUpTrend = useMemo(() => {
    const counts = new Map<string, number>();
    for (const log of filtered) {
      if (log.exit_reason_connection !== "hung_up_immediately") continue;
      const d = new Date(log.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const rows = Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));
    const total = rows.reduce((s, r) => s + r.count, 0);
    const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
    return { rows, total, max };
  }, [filtered]);

  return (
    <div className="space-y-6">
      {coachingCue && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-[10px] uppercase tracking-widest text-primary">Top Coaching Cue</h3>
              <p className="text-sm text-foreground">
                <span className="font-semibold">{subjectLabel}'s biggest leak:</span> {coachingCue.stageLabel} —{" "}
                <span className="font-semibold">"{coachingCue.topReasonLabel}"</span>{" "}
                <span className="text-muted-foreground">
                  ({coachingCue.topReasonCount} drops, {coachingCue.pctOfStageDrops}% of this stage)
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Conversation Funnel</h3>
        <p className="mt-1 text-xs text-muted-foreground">Where calls fall off in the cold-call flow. Stages are manually tagged by reps in the dialer.</p>
        <div className="mt-4 space-y-2">
          {funnel.stages.map((s, i) => (
            <div key={s.key} className="flex items-center gap-3">
              <div className="w-44 text-sm text-foreground">{s.label}</div>
              <div className="flex-1">
                <div className="relative h-6 rounded-md bg-muted overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary/80"
                    style={{ width: `${Math.max(s.pctOfTop, 0)}%` }}
                  />
                </div>
              </div>
              <div className="w-16 text-right font-mono text-sm text-foreground">{s.count}</div>
              <div className="w-14 text-right font-mono text-sm text-muted-foreground">{s.pctOfTop}%</div>
              <div className="w-20 text-right font-mono text-xs text-destructive">
                {i === 0 ? "" : `-${s.dropFromPrev}%`}
              </div>
            </div>
          ))}
        </div>
        {funnel.totalTracked === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">No funnel data yet. Reps need to tick conversation stages on the dialer for calls to appear here.</p>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Opener Performance</h3>
        <p className="mt-1 text-xs text-muted-foreground">A/B compare scripts based on how far conversations progress.</p>
        <div className="mt-3">
          {openerMetrics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No opener attribution yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Opener</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead className="text-right">Connected</TableHead>
                  <TableHead className="text-right">Connect → Problem</TableHead>
                  <TableHead className="text-right">Problem → Booking</TableHead>
                  <TableHead className="text-right">Overall %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openerMetrics.map((m) => (
                  <TableRow key={m.openerId}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-right font-mono">{m.used}</TableCell>
                    <TableCell className="text-right font-mono">{m.connections}</TableCell>
                    <TableCell className="text-right font-mono">{m.connectToProblemPct}%</TableCell>
                    <TableCell className="text-right font-mono">{m.problemToBookingPct}%</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{m.overallPct}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">NEPQ Exit Reasons by Stage</h3>
          <p className="mt-1 text-xs text-muted-foreground">Why calls were lost at each stage of the cold-call flow. Each table shows reasons for drops at that specific stage.</p>
        </div>

        {hangUpTrend.total > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <PhoneOff className="h-4 w-4 text-destructive" />
                <h4 className="text-[10px] uppercase tracking-widest text-destructive">Immediate Hang-Up Trend</h4>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{hangUpTrend.total}</span> total · peak {hangUpTrend.max}/day
              </span>
            </div>
            <div className="mt-3 flex h-12 items-end gap-1">
              {hangUpTrend.rows.map((r) => (
                <div
                  key={r.date}
                  title={`${r.date}: ${r.count}`}
                  className="flex-1 min-w-[6px] rounded-t bg-destructive/70"
                  style={{ height: `${hangUpTrend.max > 0 ? Math.max(8, (r.count / hangUpTrend.max) * 100) : 0}%` }}
                />
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Daily counts of calls tagged as "hung up before opener finished". Spikes often signal opener / list quality issues.
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {stageBreakdowns.map((b) => (
            <div key={b.stage} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-baseline justify-between">
                <h4 className="text-sm font-semibold text-foreground">{b.stageLabel}</h4>
                <span className="font-mono text-xs text-muted-foreground">{b.totalLost} tagged</span>
              </div>
              <div className="mt-3">
                {b.totalLost === 0 ? (
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
                      {b.reasons
                        .filter((r) => r.count > 0)
                        .map((r) => (
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
          ))}
        </div>
      </div>

      {!repUserId && repNameMap && leakLeaderboard.length > 0 && (
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Per-Rep Leak Leaderboard</h3>
          <p className="mt-1 text-xs text-muted-foreground">Ranks reps by their worst-stage drop %, with their dominant exit reason at that stage. Use to spot who needs targeted coaching.</p>
          <div className="mt-3">
            <RepLeakLeaderboardTable rows={leakLeaderboard} repNameMap={repNameMap} />
          </div>
        </div>
      )}
    </div>
  );
}
