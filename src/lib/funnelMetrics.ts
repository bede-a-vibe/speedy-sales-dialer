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

// ========== NEPQ-aligned per-stage exit reasons ==========

export type ExitStageKey =
  | "connection"
  | "problem"
  | "solution"
  | "commitment"
  | "booking";

export const EXIT_STAGE_LABELS: Record<ExitStageKey, string> = {
  connection: "Lost at Connection",
  problem: "Lost at Problem Awareness",
  solution: "Lost at Solution Awareness",
  commitment: "Lost at Verbal Commitment",
  booking: "Lost at Booking Ask",
};

export interface ExitReasonOption {
  value: string;
  label: string;
  description: string;
}

const STAGE_EXIT_REASONS_BASE: Record<ExitStageKey, ExitReasonOption[]> = {
  connection: [
    { value: "hung_up_immediately", label: "Hung up immediately", description: "Hung up before opener finished" },
    { value: "gatekeeper_block", label: "Gatekeeper block", description: "Gatekeeper refused transfer" },
    { value: "not_right_person", label: "Not the right person", description: "Wrong contact / DM unavailable" },
    { value: "wrong_number", label: "Wrong number", description: "Number invalid / wrong business" },
    { value: "aggressive_rejection", label: "Aggressive rejection", description: "Hostile / 'take me off your list'" },
  ],
  problem: [
    { value: "no_pain_acknowledged", label: "No pain acknowledged", description: "Prospect denies any problem exists" },
    { value: "status_quo_bias", label: "Status quo bias", description: "'Everything's fine as it is'" },
    { value: "deflected_questions", label: "Deflected questions", description: "Wouldn't engage with situation questions" },
    { value: "time_objection_early", label: "Early time objection", description: "'Not a good time' before pain surfaced" },
    { value: "defensive_posture", label: "Defensive posture", description: "Got guarded when probed" },
  ],
  solution: [
    { value: "pain_not_big_enough", label: "Pain not big enough", description: "Acknowledged issue but low urgency" },
    { value: "already_solving_it", label: "Already solving it", description: "Has internal/other solution in motion" },
    { value: "cant_see_consequence", label: "Can't see consequence", description: "Doesn't connect pain to business impact" },
    { value: "budget_concern_surfaced", label: "Budget concern surfaced", description: "Raised cost too early" },
    { value: "lost_emotional_engagement", label: "Lost emotional engagement", description: "Went cold mid-conversation" },
  ],
  commitment: [
    { value: "skepticism_of_solution", label: "Skepticism of solution", description: "Doesn't believe we can help" },
    { value: "competitor_loyalty", label: "Competitor loyalty", description: "Locked in with competitor" },
    { value: "needs_to_think", label: "Needs to think", description: "'Let me think about it'" },
    { value: "consult_partner", label: "Consult partner", description: "Needs to talk to spouse/partner/team" },
    { value: "price_objection", label: "Price objection", description: "Cost is the blocker" },
  ],
  booking: [
    { value: "calendar_conflict", label: "Calendar conflict", description: "Couldn't find suitable time" },
    { value: "wants_info_first", label: "Wants info first", description: "'Send me something to review'" },
    { value: "cold_feet", label: "Cold feet", description: "Pulled back at the ask" },
    { value: "reschedule_loop", label: "Reschedule loop", description: "Asked to call back later (vague)" },
    { value: "decision_maker_absent", label: "Decision maker absent", description: "Needs DM present for booking" },
  ],
};

const OTHER_OPTION: ExitReasonOption = { value: "other", label: "Other", description: "Use notes for detail" };

export const STAGE_EXIT_REASONS: Record<ExitStageKey, ExitReasonOption[]> = {
  connection: [...STAGE_EXIT_REASONS_BASE.connection, OTHER_OPTION],
  problem: [...STAGE_EXIT_REASONS_BASE.problem, OTHER_OPTION],
  solution: [...STAGE_EXIT_REASONS_BASE.solution, OTHER_OPTION],
  commitment: [...STAGE_EXIT_REASONS_BASE.commitment, OTHER_OPTION],
  booking: [...STAGE_EXIT_REASONS_BASE.booking, OTHER_OPTION],
};

export function getExitReasonLabel(stage: ExitStageKey, value: string | null | undefined): string {
  if (!value) return "—";
  const opt = STAGE_EXIT_REASONS[stage].find((o) => o.value === value);
  return opt?.label ?? value;
}

const EXIT_STAGE_TO_COLUMN: Record<ExitStageKey, keyof Pick<CallLogRow,
  "exit_reason_connection" | "exit_reason_problem" | "exit_reason_solution" | "exit_reason_commitment" | "exit_reason_booking"
>> = {
  connection: "exit_reason_connection",
  problem: "exit_reason_problem",
  solution: "exit_reason_solution",
  commitment: "exit_reason_commitment",
  booking: "exit_reason_booking",
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

export interface StageExitBreakdown {
  stage: ExitStageKey;
  stageLabel: string;
  totalLost: number;
  reasons: Array<{ value: string; label: string; count: number; pct: number }>;
}

export function computeStageExitBreakdowns(logs: CallLogRow[]): StageExitBreakdown[] {
  const stages: ExitStageKey[] = ["connection", "problem", "solution", "commitment", "booking"];
  return stages.map((stage) => {
    const column = EXIT_STAGE_TO_COLUMN[stage];
    const counts = new Map<string, number>();
    let totalWithReason = 0;
    for (const l of logs) {
      const v = l[column] as string | null | undefined;
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
      totalWithReason += 1;
    }
    const reasons = STAGE_EXIT_REASONS[stage]
      .map((opt) => ({
        value: opt.value,
        label: opt.label,
        count: counts.get(opt.value) ?? 0,
        pct: totalWithReason ? Math.round(((counts.get(opt.value) ?? 0) / totalWithReason) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    return {
      stage,
      stageLabel: EXIT_STAGE_LABELS[stage],
      totalLost: totalWithReason,
      reasons,
    };
  });
}

export interface CoachingCue {
  stage: ExitStageKey;
  stageLabel: string;
  topReasonValue: string;
  topReasonLabel: string;
  topReasonCount: number;
  pctOfStageDrops: number;
}

/**
 * Surfaces the single biggest leak: the stage with the most tagged exit reasons,
 * and within that stage, the dominant reason.
 */
export function computeTopCoachingCue(logs: CallLogRow[]): CoachingCue | null {
  const breakdowns = computeStageExitBreakdowns(logs);
  const worst = breakdowns
    .filter((b) => b.totalLost > 0 && b.reasons[0]?.count > 0)
    .sort((a, b) => b.totalLost - a.totalLost)[0];
  if (!worst) return null;
  const top = worst.reasons[0];
  return {
    stage: worst.stage,
    stageLabel: worst.stageLabel,
    topReasonValue: top.value,
    topReasonLabel: top.label,
    topReasonCount: top.count,
    pctOfStageDrops: top.pct,
  };
}
