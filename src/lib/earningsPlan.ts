/**
 * Earnings planner maths: a setter's own funnel run through the plan they are
 * paid on (setter_2026_marginal, the same brackets as the level-up bar), and
 * the reverse: what a monthly target takes. First meetings only, and "close"
 * is clients per first sitting, so the observed inputs reproduce the observed
 * month. One-off cash (5% flat) is left out: it is rare and not plannable.
 */
import { SETTER_2026_MARGINAL_BANDS, SETTER_PLAN, setterMarginalCommission } from "@/lib/compPlan";
import { firstMonthValue, type SetterFirstDeal } from "@/lib/funnelTracker";

export const EARNINGS_WINDOW_DAYS = 60;
/** Below this many sittings the close rate is too thin to lean on. */
export const THIN_SITTINGS = 20;

export interface RepFunnelCounts {
  dials: number;
  active_days: number;
  pickups: number;
  first_bookings: number;
  resolved: number;
  sat: number;
}

export interface EarningsInputs {
  dialsPerDay: number;
  pickupRate: number;
  bookingRate: number;
  sitRate: number;
  closeRate: number;
  avgRetainer: number;
  daysPerMonth: number;
}

export interface ObservedEarnings {
  counts: RepFunnelCounts;
  clients: number;
  retainerTotal: number;
  inputs: EarningsInputs;
  /** No clients yet, so the close rate and average client are not the rep's own. */
  noClients: boolean;
  thin: boolean;
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : 0);

/** Retainer clients the setter is credited with that started inside the window. */
export function clientsInWindow(deals: SetterFirstDeal[], setterId: string, since: string, today: string) {
  const byContact = new Map<string, number>();
  for (const d of deals) {
    if (d.setter_id !== setterId || d.billing_period === "one_off") continue;
    if (d.start_date < since || d.start_date > today) continue;
    byContact.set(d.contact_id, (byContact.get(d.contact_id) ?? 0) + firstMonthValue(d));
  }
  const values = [...byContact.values()].filter((v) => v > 0);
  return { clients: values.length, retainerTotal: values.reduce((t, v) => t + v, 0) };
}

export function observeEarnings(counts: RepFunnelCounts, clients: number, retainerTotal: number): ObservedEarnings {
  return {
    counts,
    clients,
    retainerTotal,
    noClients: clients === 0,
    thin: counts.sat < THIN_SITTINGS,
    inputs: {
      dialsPerDay: Math.round(ratio(counts.dials, counts.active_days)),
      pickupRate: ratio(counts.pickups, counts.dials),
      bookingRate: ratio(counts.first_bookings, counts.pickups),
      sitRate: ratio(counts.sat, counts.resolved),
      closeRate: Math.min(1, ratio(clients, counts.sat)),
      avgRetainer: ratio(retainerTotal, clients),
      daysPerMonth: SETTER_PLAN.workingDaysPerMonth,
    },
  };
}

export function projectEarnings(i: EarningsInputs, baseAnnual: number) {
  const dials = i.dialsPerDay * i.daysPerMonth;
  const bookings = dials * i.pickupRate * i.bookingRate;
  const sittings = bookings * i.sitRate;
  const clients = sittings * i.closeRate;
  const retainerCash = clients * i.avgRetainer;
  const commission = setterMarginalCommission(retainerCash).total;
  const base = baseAnnual / 12;
  return { dials, bookings, sittings, clients, retainerCash, commission, base, monthly: base + commission, annual: (base + commission) * 12 };
}

/** First-month retainer cash a month that pays this commission under the brackets. */
export function retainerCashForCommission(commission: number) {
  if (commission <= 0) return 0;
  let left = commission;
  for (const band of SETTER_2026_MARGINAL_BANDS) {
    if (band.rate === 0) continue;
    const full = (band.to - band.from) * band.rate;
    if (left <= full) return band.from + left / band.rate;
    left -= full;
  }
  return Number.POSITIVE_INFINITY;
}

export interface TargetPlan {
  commissionNeeded: number;
  retainerNeeded: number;
  clients: number | null;
  sittings: number | null;
  bookings: number | null;
  bookingsPerDay: number | null;
  dialsPerDay: number | null;
  /** What one lever alone would have to be, everything else unchanged; null = it can't get there alone. */
  alone: { label: string; now: number; need: number | null; kind: "pct" | "money" | "n" }[];
  reached: boolean;
}

/** What a monthly take-home target (before super and tax) takes at these rates. */
export function planForTarget(target: number, i: EarningsInputs, baseAnnual: number): TargetPlan {
  const p = projectEarnings(i, baseAnnual);
  const commissionNeeded = Math.max(0, target - p.base);
  const retainerNeeded = retainerCashForCommission(commissionNeeded);
  const up = (n: number, rate: number) => (rate > 0 ? n / rate : null);
  const clients = up(retainerNeeded, i.avgRetainer);
  const sittings = clients == null ? null : up(clients, i.closeRate);
  const bookings = sittings == null ? null : up(sittings, i.sitRate);
  const pickups = bookings == null ? null : up(bookings, i.bookingRate);
  const dials = pickups == null ? null : up(pickups, i.pickupRate);
  const lift = p.retainerCash > 0 ? retainerNeeded / p.retainerCash : null;
  const rateNeed = (now: number) => (lift == null || now <= 0 || now * lift > 1 ? null : now * lift);
  return {
    commissionNeeded,
    retainerNeeded,
    clients,
    sittings,
    bookings,
    bookingsPerDay: bookings == null ? null : up(bookings, i.daysPerMonth),
    dialsPerDay: dials == null ? null : up(dials, i.daysPerMonth),
    reached: p.monthly >= target,
    alone: [
      { label: "Bookings that sit", now: i.sitRate, need: rateNeed(i.sitRate), kind: "pct" },
      { label: "Sittings that close", now: i.closeRate, need: rateNeed(i.closeRate), kind: "pct" },
      { label: "Pickups that book", now: i.bookingRate, need: rateNeed(i.bookingRate), kind: "pct" },
      { label: "Dials a day", now: i.dialsPerDay, need: lift == null ? null : Math.ceil(i.dialsPerDay * lift), kind: "n" },
    ],
  };
}
