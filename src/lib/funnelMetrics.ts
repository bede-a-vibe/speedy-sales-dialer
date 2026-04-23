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

export type FunnelStageKey =
  | "connection"
  | "problem_awareness"
  | "solution_awareness"
  | "commitment"
  | "booked";

export const FUNNEL_STAGE_LABELS: Record<FunnelStageKey, string> = {
  connection: "Connected (>15s)",
  problem_awareness: "Problem Awareness",
  solution_awareness: "Solution Awareness",
  commitment: "Verbal Commitment",
  booked: "Meeting Booked",
};

export const DROP_OFF_REASONS = [
  "gatekeeper",
  "not_interested",
  "wrong_time",
  "price_objection",
  "competitor",
  "no_pain",
  "other",
] as const;

export type DropOffReason = (typeof DROP_OFF_REASONS)[number];

export const DROP_OFF_LABELS: Record<DropOffReason, string> = {
  gatekeeper: "Gatekeeper",
  not_interested: "Not interested",
  wrong_time: "Wrong time",
  price_objection: "Price objection",
  competitor: "Using competitor",
  no_pain: "No pain identified",
  other: "Other",
};

export interface FunnelStageMetric {
  key: FunnelStageKey;
  label: string;
  count: number;
  pctOfTop: number;
  dropFromPrev: number;
}

export interface FunnelMetrics {
  stages: FunnelStageMetric[];
  totalTracked: number;
}

function dateInRange(iso: string, from?: string, to?: string) {
  if (!from && !to) return true;
  const d = iso.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function filterFunnelLogs(
  logs: CallLogRow[],
  opts: { from?: string; to?: string; repUserId?: string },
) {
  return logs.filter((l) => {
    if (!dateInRange(l.created_at, opts.from, opts.to)) return false;
    if (opts.repUserId && l.user_id !== opts.repUserId) return false;
    return true;
  });
}

export function computeFunnel(logs: CallLogRow[]): FunnelMetrics {
  const connection = logs.filter((l) => l.reached_connection).length;
  const problem = logs.filter((l) => l.reached_problem_awareness).length;
  const solution = logs.filter((l) => l.reached_solution_awareness).length;
  const commitment = logs.filter((l) => l.reached_commitment).length;
  const booked = logs.filter((l) => l.outcome === "booked").length;

  const top = connection || 1;
  const stages: FunnelStageMetric[] = [
    { key: "connection", label: FUNNEL_STAGE_LABELS.connection, count: connection, pctOfTop: 100, dropFromPrev: 0 },
    { key: "problem_awareness", label: FUNNEL_STAGE_LABELS.problem_awareness, count: problem, pctOfTop: Math.round((problem / top) * 100), dropFromPrev: connection ? Math.round(((connection - problem) / connection) * 100) : 0 },
    { key: "solution_awareness", label: FUNNEL_STAGE_LABELS.solution_awareness, count: solution, pctOfTop: Math.round((solution / top) * 100), dropFromPrev: problem ? Math.round(((problem - solution) / problem) * 100) : 0 },
    { key: "commitment", label: FUNNEL_STAGE_LABELS.commitment, count: commitment, pctOfTop: Math.round((commitment / top) * 100), dropFromPrev: solution ? Math.round(((solution - commitment) / solution) * 100) : 0 },
    { key: "booked", label: FUNNEL_STAGE_LABELS.booked, count: booked, pctOfTop: Math.round((booked / top) * 100), dropFromPrev: commitment ? Math.round(((commitment - booked) / commitment) * 100) : 0 },
  ];

  return { stages, totalTracked: connection };
}

export interface OpenerMetric {
  openerId: string;
  used: number;
  connections: number;
  problemReached: number;
  bookings: number;
  connectToProblemPct: number;
  problemToBookingPct: number;
  overallPct: number;
}

export function computeOpenerMetrics(
  logs: CallLogRow[],
  openerNames: Map<string, string>,
): Array<OpenerMetric & { name: string }> {
  const grouped = new Map<string, CallLogRow[]>();
  for (const l of logs) {
    if (!l.opener_used_id) continue;
    const arr = grouped.get(l.opener_used_id) ?? [];
    arr.push(l);
    grouped.set(l.opener_used_id, arr);
  }

  const out: Array<OpenerMetric & { name: string }> = [];
  for (const [openerId, group] of grouped) {
    const used = group.length;
    const connections = group.filter((l) => l.reached_connection).length;
    const problemReached = group.filter((l) => l.reached_problem_awareness).length;
    const bookings = group.filter((l) => l.outcome === "booked").length;
    out.push({
      openerId,
      name: openerNames.get(openerId) ?? "Unknown opener",
      used,
      connections,
      problemReached,
      bookings,
      connectToProblemPct: connections ? Math.round((problemReached / connections) * 100) : 0,
      problemToBookingPct: problemReached ? Math.round((bookings / problemReached) * 100) : 0,
      overallPct: used ? Math.round((bookings / used) * 100) : 0,
    });
  }
  return out.sort((a, b) => b.used - a.used);
}

export function computeDropOffBreakdown(logs: CallLogRow[]) {
  const counts = new Map<string, number>();
  let totalWithReason = 0;
  for (const l of logs) {
    if (!l.drop_off_reason) continue;
    counts.set(l.drop_off_reason, (counts.get(l.drop_off_reason) ?? 0) + 1);
    totalWithReason += 1;
  }
  return DROP_OFF_REASONS.map((r) => ({
    reason: r,
    label: DROP_OFF_LABELS[r],
    count: counts.get(r) ?? 0,
    pct: totalWithReason ? Math.round(((counts.get(r) ?? 0) / totalWithReason) * 100) : 0,
  })).sort((a, b) => b.count - a.count);
}
