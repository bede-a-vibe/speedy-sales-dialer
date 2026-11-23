/**
 * The Goals page: a rep's own KPI targets, how they are tracking, and what
 * improving each one does to a month (through projectEarnings, so the money is
 * always the live commission brackets).
 */
import { SETTER_2026_MARGINAL_BANDS } from "@/lib/compPlan";
import { projectEarnings, type EarningsInputs, type RepFunnelCounts } from "@/lib/earningsPlan";
import { addDayKeys, type SaleCommission } from "@/lib/funnelTracker";
import type { TargetKey } from "@/lib/teamTargets";

export type GoalKey = "dialsPerDay" | "pickupRate" | "bookingRate" | "sitRate" | "closeRate" | "avgRetainer";
export type KpiTargets = Partial<Record<GoalKey, number>>;
export interface RepGoal {
  monthly: number | null;
  kpis: KpiTargets;
}

export interface GoalMetric {
  key: GoalKey;
  label: string;
  kind: "n" | "pct" | "money";
  /** What the number is made of, in the rep's words. */
  hint: string;
  /** Slider ceiling and step (rates as fractions). */
  max: number;
  step: number;
  /** One realistic step up, for reps who have not set a target. A flat 10% would make every lever worth the same. */
  lift: number;
  /** The manager target with the same definition, where there is one. */
  manager?: { key: TargetKey; scale: number };
}

export const GOAL_METRICS: GoalMetric[] = [
  { key: "dialsPerDay", label: "Dials a day", kind: "n", hint: "on days you dialled", max: 1000, step: 5, lift: 50, manager: { key: "dialsPerDay", scale: 1 } },
  { key: "pickupRate", label: "Dials that pick up", kind: "pct", hint: "someone answered", max: 0.6, step: 0.005, lift: 0.02, manager: { key: "pickupRate", scale: 0.01 } },
  { key: "bookingRate", label: "Pickups that book", kind: "pct", hint: "first meetings", max: 0.3, step: 0.0025, lift: 0.01, manager: { key: "bookingsPerPickup", scale: 0.01 } },
  { key: "sitRate", label: "Bookings that sit", kind: "pct", hint: "no-shows and cancels count against", max: 1, step: 0.01, lift: 0.05 },
  { key: "closeRate", label: "Sittings that close", kind: "pct", hint: "clients per sitting", max: 1, step: 0.01, lift: 0.05 },
  { key: "avgRetainer", label: "Average client", kind: "money", hint: "first-month retainer", max: 10_000, step: 50, lift: 500 },
];
export const metricOf = (key: GoalKey) => GOAL_METRICS.find((m) => m.key === key)!;

export function formatMetric(m: Pick<GoalMetric, "kind">, v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return "-";
  if (m.kind === "pct") return `${(v * 100).toFixed(1)}%`;
  if (m.kind === "money") return `$${Math.round(v).toLocaleString("en-AU")}`;
  return Math.round(v).toLocaleString("en-AU");
}

/** What a rep typed ("25", "25%", "$2,000") as a stored value; null = blank; undefined = not usable. */
export function parseMetric(m: Pick<GoalMetric, "kind">, text: string): number | null | undefined {
  const clean = text.replace(/[$,%\s]/g, "");
  if (clean === "") return null;
  const n = Number(clean);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const v = m.kind === "pct" ? n / 100 : n;
  return v > (m.kind === "pct" ? 1 : m.kind === "n" ? 2000 : 100_000) ? undefined : v;
}

/** Targets as stored, keeping only known keys with usable numbers. */
export function cleanKpis(raw: unknown): KpiTargets {
  const out: KpiTargets = {};
  if (!raw || typeof raw !== "object") return out;
  for (const m of GOAL_METRICS) {
    const v = Number((raw as Record<string, unknown>)[m.key]);
    if (Number.isFinite(v) && v > 0 && (m.kind !== "pct" || v <= 1)) out[m.key] = v;
  }
  return out;
}

export const withTargets = (inputs: EarningsInputs, kpis: KpiTargets): EarningsInputs => ({ ...inputs, ...kpis });

export interface FunnelDay extends Omit<RepFunnelCounts, "active_days"> {
  day: string;
}

export function sumFunnel(days: FunnelDay[]): RepFunnelCounts {
  const t: RepFunnelCounts = { dials: 0, active_days: 0, pickups: 0, first_bookings: 0, resolved: 0, sat: 0 };
  for (const d of days) {
    t.dials += d.dials;
    t.pickups += d.pickups;
    t.first_bookings += d.first_bookings;
    t.resolved += d.resolved;
    t.sat += d.sat;
    if (d.dials > 0) t.active_days += 1;
  }
  return t;
}

/** Smallest denominator worth showing as a rate, so a 1 of 1 is never "100%". */
const MIN_BASE = { pickupRate: 50, bookingRate: 20, sitRate: 5, closeRate: 5 } as const;

/** One metric out of a set of counts; null when there is not enough behind it. */
export function metricValue(key: GoalKey, c: RepFunnelCounts, clients = 0, retainerTotal = 0): number | null {
  switch (key) {
    case "dialsPerDay": return c.active_days > 0 ? c.dials / c.active_days : null;
    case "pickupRate": return c.dials >= MIN_BASE.pickupRate ? c.pickups / c.dials : null;
    case "bookingRate": return c.pickups >= MIN_BASE.bookingRate ? c.first_bookings / c.pickups : null;
    case "sitRate": return c.resolved >= MIN_BASE.sitRate ? c.sat / c.resolved : null;
    case "closeRate": return c.sat >= MIN_BASE.closeRate ? Math.min(1, clients / c.sat) : null;
    case "avgRetainer": return clients > 0 ? retainerTotal / clients : null;
  }
}

/** Monday of the week a day sits in. */
export function mondayOf(day: string) {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDayKeys(day, -((dow + 6) % 7));
}

/** The last `weeks` weeks of a metric, oldest first. */
export function weeklyMetric(days: FunnelDay[], key: GoalKey, today: string, weeks = 12) {
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDayKeys(thisMonday, -7 * (weeks - 1 - i));
    const to = addDayKeys(from, 6);
    return { week: from, value: metricValue(key, sumFunnel(days.filter((d) => d.day >= from && d.day <= to))) };
  });
}

export type Outcome = "monthly" | "retainerCash" | "clients";

export interface CurvePoint {
  x: number;
  now: number;
  changed: number;
}

/**
 * A month as one metric moves and everything else stays put: `now` with the
 * rep's own numbers behind it, `changed` with the numbers on the sliders.
 */
export function improvementCurve(
  key: GoalKey,
  own: EarningsInputs,
  changed: EarningsInputs,
  baseAnnual: number,
  outcome: Outcome,
  target: number | undefined,
  points = 60,
): CurvePoint[] {
  const m = metricOf(key);
  const top = Math.max(own[key], changed[key], target ?? 0);
  const lo = top > 0 ? Math.min(own[key] > 0 ? own[key] : top, changed[key] > 0 ? changed[key] : top) * 0.5 : 0;
  const hi = top > 0 ? Math.min(m.kind === "pct" ? 1 : Infinity, top * 1.6) : m.max;
  const at = (base: EarningsInputs, x: number) => projectEarnings({ ...base, [key]: x }, baseAnnual)[outcome];
  return Array.from({ length: points + 1 }, (_, i) => {
    const x = lo + ((hi - lo) * i) / points;
    return { x, now: at(own, x), changed: at(changed, x) };
  });
}

/** Round axis ticks inside [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const rough = span / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= rough * 0.999)!;
  const out: number[] = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9; i += 1) out.push(Number((i * step).toPrecision(12)));
  return out;
}

export interface LeverGain {
  key: GoalKey;
  label: string;
  from: number;
  to: number;
  toTarget: boolean;
  gain: number;
}

/** What lifting each metric alone adds to a month: up to the rep's target, or one step up where there is none to reach. */
export function leverGains(own: EarningsInputs, kpis: KpiTargets, baseAnnual: number, outcome: Outcome): LeverGain[] {
  const base = projectEarnings(own, baseAnnual)[outcome];
  return GOAL_METRICS.flatMap((m) => {
    const from = own[m.key];
    const target = kpis[m.key];
    const toTarget = target != null && target > from;
    if (!toTarget && from <= 0) return [];
    const to = toTarget ? target : Math.min(m.kind === "pct" ? 1 : Infinity, from + m.lift);
    return [{ key: m.key, label: m.label, from, to, toTarget, gain: projectEarnings({ ...own, [m.key]: to }, baseAnnual)[outcome] - base }];
  });
}

/** Retainer levels a month's cash crosses: where commission starts and steps up. */
export const BRACKET_STARTS = SETTER_2026_MARGINAL_BANDS.filter((b) => b.rate > 0).map((b) => ({ from: b.from, rate: b.rate }));

export interface MonthPay {
  month: string;
  retainer: number;
  oneOff: number;
  commission: number;
  sales: number;
}

/** Commission by month from the plan's first month to this one, newest last. */
export function monthlyCommission(sales: SaleCommission[], planFrom: string | null, thisMonth: string, limit = 12): MonthPay[] {
  const first = [planFrom ? `${planFrom.slice(0, 7)}-01` : null, sales[0]?.month ?? null].filter((x): x is string => !!x).sort()[0] ?? thisMonth;
  const months: string[] = [];
  for (let m = first; m <= thisMonth; m = nextMonth(m)) months.push(m);
  const all = months.slice(-limit).map((month) => {
    const rows = sales.filter((s) => s.month === month);
    const sum = (f: (s: SaleCommission) => number) => rows.reduce((t, s) => t + f(s), 0);
    return { month, retainer: sum((s) => s.retainer), oneOff: sum((s) => s.oneOff), commission: sum((s) => s.commission), sales: rows.length };
  });
  // A plan that started late in a month leaves an empty first bar: start at the first paid month.
  const firstPaid = all.findIndex((m) => m.sales > 0);
  return all.slice(firstPaid < 0 ? -1 : firstPaid);
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
