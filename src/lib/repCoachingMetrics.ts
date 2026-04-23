import type { Tables } from "@/integrations/supabase/types";
import {
  ANSWERED_OUTCOMES,
  getTalkTimeSeconds,
  type ReportBookingItem,
  type ReportCallLog,
} from "./reportMetrics";
import {
  computeFunnel,
  computeStageExitBreakdowns,
  computeTopCoachingCue,
  EXIT_STAGE_LABELS,
  type CoachingCue,
  type ExitStageKey,
  type FunnelMetrics,
} from "./funnelMetrics";

type FullCallLog = Tables<"call_logs">;

export interface HourPickupRow {
  hour: number;
  dials: number;
  pickUps: number;
  pickUpRate: number; // 0..100
}

export interface HourBookingRow {
  hour: number;
  bookings: number;
  conversionPct: number; // bookings/dials
}

export interface RepLeakLeaderRow {
  repUserId: string;
  worstStage: ExitStageKey | null;
  worstStageLabel: string;
  worstStageDropPct: number; // % of prev stage lost
  topExitReasonLabel: string | null;
  topExitReasonCount: number;
  totalDials: number;
}

export interface RepCoachingScorecard {
  repUserId: string;
  totalDials: number;
  totalPickUps: number;
  totalBookings: number;
  funnel: FunnelMetrics;
  worstFunnelStage: { key: string; label: string; dropPct: number } | null;
  topExitReason: CoachingCue | null;
  bestPickupHours: HourPickupRow[];
  bestBookingHours: HourBookingRow[];
  insightLines: string[];
}

const HOUR_LABELS = (h: number) => {
  const suffix = h >= 12 ? "pm" : "am";
  const hh = h % 12 || 12;
  return `${hh}${suffix}`;
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function bestPickupHours(logs: FullCallLog[], minDials = 5, take = 3): HourPickupRow[] {
  const dials = new Array<number>(24).fill(0);
  const picks = new Array<number>(24).fill(0);
  for (const l of logs) {
    const h = new Date(l.created_at).getHours();
    dials[h] += 1;
    if (ANSWERED_OUTCOMES.has(l.outcome)) picks[h] += 1;
  }
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    dials: dials[h],
    pickUps: picks[h],
    pickUpRate: dials[h] > 0 ? Math.round((picks[h] / dials[h]) * 100) : 0,
  }))
    .filter((r) => r.dials >= minDials)
    .sort((a, b) => b.pickUpRate - a.pickUpRate || b.dials - a.dials)
    .slice(0, take);
}

function bestBookingHours(
  logs: FullCallLog[],
  bookings: ReportBookingItem[],
  repUserId: string,
  take = 3,
): HourBookingRow[] {
  const dials = new Array<number>(24).fill(0);
  const books = new Array<number>(24).fill(0);
  for (const l of logs) {
    dials[new Date(l.created_at).getHours()] += 1;
  }
  for (const b of bookings) {
    if (b.created_by !== repUserId) continue;
    if (!b.created_at) continue;
    books[new Date(b.created_at).getHours()] += 1;
  }
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    bookings: books[h],
    conversionPct: dials[h] > 0 ? Math.round((books[h] / dials[h]) * 100) : 0,
  }))
    .filter((r) => r.bookings >= 1)
    .sort((a, b) => b.bookings - a.bookings || b.conversionPct - a.conversionPct)
    .slice(0, take);
}

export function formatHourLabel(hour: number): string {
  return HOUR_LABELS(hour);
}

function generateInsights(
  logs: FullCallLog[],
  bookings: ReportBookingItem[],
  repUserId: string,
  funnel: FunnelMetrics,
): string[] {
  const lines: string[] = [];

  // 1. Worst stage drop
  const worst = funnel.stages
    .slice(1)
    .filter((s) => s.dropFromPrev >= 50)
    .sort((a, b) => b.dropFromPrev - a.dropFromPrev)[0];
  if (worst) {
    lines.push(`Loses ${worst.dropFromPrev}% at ${worst.label}`);
  }

  // 2. Pickup rate AM vs PM (split at noon and at 3pm)
  const dialsByHour = new Array<number>(24).fill(0);
  const picksByHour = new Array<number>(24).fill(0);
  for (const l of logs) {
    const h = new Date(l.created_at).getHours();
    dialsByHour[h] += 1;
    if (ANSWERED_OUTCOMES.has(l.outcome)) picksByHour[h] += 1;
  }
  const sumRange = (start: number, end: number) => {
    let d = 0,
      p = 0;
    for (let h = start; h < end; h++) {
      d += dialsByHour[h];
      p += picksByHour[h];
    }
    return { d, p, rate: d > 0 ? p / d : 0 };
  };
  const morning = sumRange(7, 12);
  const afternoon = sumRange(12, 17);
  if (morning.d >= 10 && afternoon.d >= 10) {
    if (morning.rate > 0 && afternoon.rate / morning.rate <= 0.6) {
      const drop = Math.round((1 - afternoon.rate / morning.rate) * 100);
      lines.push(`Pickup rate drops ${drop}% in the afternoon`);
    } else if (afternoon.rate > 0 && morning.rate / afternoon.rate <= 0.6) {
      const drop = Math.round((1 - morning.rate / afternoon.rate) * 100);
      lines.push(`Pickup rate is ${drop}% lower in the morning`);
    }
  }

  // 3. Day-of-week with 0 bookings (only if rep has bookings overall and ≥10 dials on that day)
  const dialsByDow = new Array<number>(7).fill(0);
  const booksByDow = new Array<number>(7).fill(0);
  for (const l of logs) {
    const dow = (new Date(l.created_at).getDay() + 6) % 7;
    dialsByDow[dow] += 1;
  }
  for (const b of bookings) {
    if (b.created_by !== repUserId || !b.created_at) continue;
    const dow = (new Date(b.created_at).getDay() + 6) % 7;
    booksByDow[dow] += 1;
  }
  const totalBooks = booksByDow.reduce((a, b) => a + b, 0);
  if (totalBooks > 0) {
    for (let d = 0; d < 5; d++) {
      if (dialsByDow[d] >= 10 && booksByDow[d] === 0) {
        lines.push(`0 bookings on ${DAY_LABELS[d]}`);
        break;
      }
    }
  }

  // 4. Avg talk on pickups
  const pickLogs = logs.filter((l) => ANSWERED_OUTCOMES.has(l.outcome));
  if (pickLogs.length >= 5) {
    const totalSec = pickLogs.reduce((s, l) => s + getTalkTimeSeconds(l), 0);
    const avg = Math.round(totalSec / pickLogs.length);
    if (avg > 0 && avg < 60) {
      lines.push(`Avg talk on pickups: ${avg}s — opener may not be hooking`);
    }
  }

  return lines.slice(0, 4);
}

export function computeRepCoachingScorecard(
  repUserId: string,
  callLogs: FullCallLog[],
  bookedItems: ReportBookingItem[],
): RepCoachingScorecard {
  const repLogs = callLogs.filter((l) => l.user_id === repUserId);
  const funnel = computeFunnel(repLogs);
  const topExitReason = computeTopCoachingCue(repLogs);

  const totalPickUps = repLogs.filter((l) => ANSWERED_OUTCOMES.has(l.outcome)).length;
  const totalBookings = bookedItems.filter((b) => b.created_by === repUserId).length;

  const worstStage = funnel.stages
    .slice(1)
    .filter((s) => s.dropFromPrev > 0)
    .sort((a, b) => b.dropFromPrev - a.dropFromPrev)[0];

  return {
    repUserId,
    totalDials: repLogs.length,
    totalPickUps,
    totalBookings,
    funnel,
    worstFunnelStage: worstStage
      ? { key: worstStage.key, label: worstStage.label, dropPct: worstStage.dropFromPrev }
      : null,
    topExitReason,
    bestPickupHours: bestPickupHours(repLogs),
    bestBookingHours: bestBookingHours(repLogs, bookedItems, repUserId),
    insightLines: generateInsights(repLogs, bookedItems, repUserId, funnel),
  };
}

export function computeAllRepScorecards(
  repIds: string[],
  callLogs: FullCallLog[],
  bookedItems: ReportBookingItem[],
): RepCoachingScorecard[] {
  return repIds
    .map((id) => computeRepCoachingScorecard(id, callLogs, bookedItems))
    .filter((s) => s.totalDials > 0)
    .sort((a, b) => b.totalDials - a.totalDials);
}

export function computeRepLeakLeaderboard(
  repIds: string[],
  callLogs: FullCallLog[],
): RepLeakLeaderRow[] {
  return repIds
    .map((repId) => {
      const repLogs = callLogs.filter((l) => l.user_id === repId);
      if (repLogs.length === 0) {
        return null;
      }
      const funnel = computeFunnel(repLogs);
      const worst = funnel.stages
        .slice(1)
        .filter((s) => s.dropFromPrev > 0)
        .sort((a, b) => b.dropFromPrev - a.dropFromPrev)[0];

      // Map funnel stage to ExitStageKey
      const stageToExit: Record<string, ExitStageKey> = {
        problem_awareness: "connection",
        solution_awareness: "problem",
        commitment: "solution",
        booked: "commitment",
      };
      const exitStage: ExitStageKey | null = worst ? stageToExit[worst.key] ?? null : null;

      let topReasonLabel: string | null = null;
      let topReasonCount = 0;
      if (exitStage) {
        const breakdowns = computeStageExitBreakdowns(repLogs);
        const stageBd = breakdowns.find((b) => b.stage === exitStage);
        const top = stageBd?.reasons.find((r) => r.count > 0);
        if (top) {
          topReasonLabel = top.label;
          topReasonCount = top.count;
        }
      }

      return {
        repUserId: repId,
        worstStage: exitStage,
        worstStageLabel: exitStage ? EXIT_STAGE_LABELS[exitStage] : "—",
        worstStageDropPct: worst?.dropFromPrev ?? 0,
        topExitReasonLabel: topReasonLabel,
        topExitReasonCount: topReasonCount,
        totalDials: repLogs.length,
      } satisfies RepLeakLeaderRow;
    })
    .filter((r): r is RepLeakLeaderRow => r !== null)
    .sort((a, b) => b.worstStageDropPct - a.worstStageDropPct);
}

/**
 * For Rep Comparison: compact summary of best pickup hour, worst stage label,
 * and top exit reason for a single rep.
 */
export interface RepComparisonExtras {
  bestPickupHourLabel: string | null;
  bestPickupHourRate: number;
  worstStageLabel: string | null;
  worstStageDropPct: number;
  topExitReasonLabel: string | null;
}

export function computeRepComparisonExtras(
  repUserId: string,
  callLogs: FullCallLog[],
): RepComparisonExtras {
  const repLogs = callLogs.filter((l) => l.user_id === repUserId);
  const top = bestPickupHours(repLogs, 5, 1)[0] ?? null;
  const funnel = computeFunnel(repLogs);
  const worst = funnel.stages
    .slice(1)
    .filter((s) => s.dropFromPrev > 0)
    .sort((a, b) => b.dropFromPrev - a.dropFromPrev)[0];
  const cue = computeTopCoachingCue(repLogs);
  return {
    bestPickupHourLabel: top ? HOUR_LABELS(top.hour) : null,
    bestPickupHourRate: top?.pickUpRate ?? 0,
    worstStageLabel: worst?.label ?? null,
    worstStageDropPct: worst?.dropFromPrev ?? 0,
    topExitReasonLabel: cue?.topReasonLabel ?? null,
  };
}