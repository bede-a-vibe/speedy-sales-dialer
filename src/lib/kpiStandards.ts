/**
 * Setter KPI standards — the single source for targets, ramp and alert bands.
 * Calibration rule: bookings-per-productive-hour (0.90) was calibrated on
 * session spans with a 15-minute idle cutoff. Target measurement is LOCKED
 * to that cutoff — changing it moves the metric >4x and breaks every target.
 */
export const PRODUCTIVE_IDLE_CUTOFF_MIN = 15;
/** 223 working days/yr after holidays + leave ÷ 12. Never 21.7. */
export const PRODUCTIVE_DAYS_PER_MONTH = 18.6;

export const STEADY_STATE = [
  { metric: "Productive dialling hours", daily: 7.5, weekly: 37.5, monthly: 139.5 },
  { metric: "Bookings per productive hour", daily: 0.9, weekly: 0.9, monthly: 0.9 },
  { metric: "Meetings set", daily: 6.75, weekly: 34, monthly: 126 },
  { metric: "Meetings showed", daily: 2.7, weekly: 13.5, monthly: 50 },
  { metric: "Deals closed", daily: 0.68, weekly: 3.4, monthly: 15 },
];

export interface RampBand {
  label: string;
  fromDay: number;
  toDay: number;
  hoursPerDay: number;
  booksPerHour: number | null;
  setsPerDay: number | null;
  showRate: number | null;
  minToPass: number | null;
}

export const RAMP: RampBand[] = [
  { label: "Day 1", fromDay: 1, toDay: 1, hoursPerDay: 4, booksPerHour: null, setsPerDay: null, showRate: null, minToPass: null },
  { label: "Days 1–30", fromDay: 2, toDay: 30, hoursPerDay: 7.5, booksPerHour: 0.33, setsPerDay: 2.5, showRate: 20, minToPass: 0.25 },
  { label: "Days 31–60", fromDay: 31, toDay: 60, hoursPerDay: 7.5, booksPerHour: 0.47, setsPerDay: 3.5, showRate: 28, minToPass: 0.35 },
  { label: "Days 61–90", fromDay: 61, toDay: 90, hoursPerDay: 7.5, booksPerHour: 0.72, setsPerDay: 5.4, showRate: 35, minToPass: 0.55 },
  { label: "Day 91+", fromDay: 91, toDay: Infinity, hoursPerDay: 7.5, booksPerHour: 0.9, setsPerDay: 6.75, showRate: 40, minToPass: 0.65 },
];

export function rampForTenure(startIso: string | null | undefined, now = new Date()): { band: RampBand; day: number } {
  const day = startIso ? Math.max(1, Math.floor((now.getTime() - new Date(startIso).getTime()) / 86_400_000) + 1) : 91;
  return { band: RAMP.find((b) => day >= b.fromDay && day <= b.toDay) ?? RAMP[RAMP.length - 1], day };
}

export type DiagKey =
  | "dials_per_hour" | "pickup_rate" | "pickup_to_conversation" | "conv_to_problem"
  | "problem_to_solution" | "solution_to_commitment" | "commitment_to_booking"
  | "bookings_per_pickup" | "showed_to_qualified";

export interface DiagBand { key: DiagKey; label: string; target: number; below: number; above?: number; unit: "%" | "/hr"; note: string }

export const DIAGNOSTICS: DiagBand[] = [
  { key: "dials_per_hour", label: "Dials per productive hour", target: 50, below: 35, above: 70, unit: "/hr", note: "Over 70 = list-burning" },
  { key: "pickup_rate", label: "Pickup rate", target: 30, below: 25, unit: "%", note: "Measured" },
  { key: "pickup_to_conversation", label: "Pickup → conversation", target: 68, below: 60, unit: "%", note: "Measured" },
  { key: "conv_to_problem", label: "Conversation → problem awareness", target: 36, below: 30, unit: "%", note: "Biggest leak" },
  { key: "problem_to_solution", label: "Problem → solution awareness", target: 50, below: 40, unit: "%", note: "Measured" },
  { key: "solution_to_commitment", label: "Solution → commitment", target: 80, below: 65, unit: "%", note: "Thin sample" },
  { key: "commitment_to_booking", label: "Commitment → booking", target: 71, below: 60, unit: "%", note: "Measured" },
  { key: "bookings_per_pickup", label: "Bookings per pickup", target: 6, below: 4, unit: "%", note: "Measured" },
  { key: "showed_to_qualified", label: "Showed → qualified", target: 85, below: 80, unit: "%", note: "Assumed, never measured" },
];

export type BandStatus = "ok" | "low" | "high" | "none";
export function bandStatus(key: DiagKey, value: number | null): BandStatus {
  const b = DIAGNOSTICS.find((d) => d.key === key);
  if (!b || value == null || !Number.isFinite(value)) return "none";
  if (b.above != null && value > b.above) return "high";
  if (value < b.below) return "low";
  return "ok";
}

/**
 * Productive hours from dial timestamps: consecutive dials ≤15 min apart form
 * one session; hours = sum of session spans. Locked cutoff — do not expose.
 */
export function productiveHours(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const t = [...timestamps].sort((a, b) => a - b);
  const cutoff = PRODUCTIVE_IDLE_CUTOFF_MIN * 60_000;
  let ms = 0;
  for (let i = 1; i < t.length; i++) {
    const gap = t[i] - t[i - 1];
    if (gap <= cutoff) ms += gap;
  }
  return ms / 3_600_000;
}

/** Steady-state closes per show (0.68 / 2.70) — used to derive closed targets from ramp shows. */
export const CLOSE_PER_SHOW = 0.68 / 2.7;
export const WORKING_DAYS_PER_WEEK = 5;

export interface DailyTargets { hours: number; sets: number | null; showed: number | null; closed: number | null; booksPerHour: number | null }

export function dailyTargetsFor(band: RampBand): DailyTargets {
  const sets = band.setsPerDay;
  const showed = sets != null && band.showRate != null ? sets * (band.showRate / 100) : null;
  return { hours: band.hoursPerDay, sets, showed, closed: showed != null ? showed * CLOSE_PER_SHOW : null, booksPerHour: band.booksPerHour };
}

/** Full-period multiplier: day = 1, week = 5, month = 18.6 productive days. */
export function periodDays(period: "day" | "week" | "month"): number {
  return period === "day" ? 1 : period === "week" ? WORKING_DAYS_PER_WEEK : PRODUCTIVE_DAYS_PER_MONTH;
}
