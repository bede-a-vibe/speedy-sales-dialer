import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCallOpeners } from "@/hooks/useCallOpeners";
import {
  computeFunnel,
  computeOpenerMetrics,
  computeDropOffBreakdown,
  filterFunnelLogs,
} from "@/lib/funnelMetrics";
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
  | "drop_off_reason"
>;

interface Props {
  callLogs: CallLogRow[];
  from?: string;
  to?: string;
  repUserId?: string;
}

export function ConversationFunnelPanel({ callLogs, from, to, repUserId }: Props) {
  const { data: openers = [] } = useCallOpeners(true);

  const filtered = useMemo(() => filterFunnelLogs(callLogs, { from, to, repUserId }), [callLogs, from, to, repUserId]);

  const funnel = useMemo(() => computeFunnel(filtered), [filtered]);

  const openerNames = useMemo(() => {
    const map = new Map<string, string>();
    openers.forEach((o) => map.set(o.id, o.name));
    return map;
  }, [openers]);

  const openerMetrics = useMemo(() => computeOpenerMetrics(filtered, openerNames), [filtered, openerNames]);
  const dropOffs = useMemo(() => computeDropOffBreakdown(filtered), [filtered]);

  return (
    <div className="space-y-6">
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

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Drop-off Reasons</h3>
        <p className="mt-1 text-xs text-muted-foreground">Why calls were lost — coaching cue per reason.</p>
        <div className="mt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">% of tagged drop-offs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dropOffs.map((r) => (
                <TableRow key={r.reason}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right font-mono">{r.count}</TableCell>
                  <TableCell className="text-right font-mono">{r.pct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
