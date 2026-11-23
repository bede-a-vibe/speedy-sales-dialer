/**
 * Funnel Flowthrough Tracker (Insights > Tracker): the IWB "Funnel Flowthrough
 * Tracker" sheet rebuilt on the dialer's data. One row per Melbourne day, a
 * month-total row and a target row per month, columns in sections
 * Marketing > Setting > Closing calendar > Closing results > P&L.
 *
 * Pure functions only, so the maths is unit tested. Every count reuses an
 * existing definition: ANSWERED_OUTCOMES for pick-ups, resolve_meeting_bucket
 * (via resolved_bucket) for how a slot ended, availableSlotsForDay for the
 * calendar, get_new_clients for wins, dialpadHours for productive hours.
 */
import { ANSWERED_OUTCOMES, type ReportCallLog } from "@/lib/reportMetrics";
import { MISSED_BY_US_REASON, tierFor, type BookingTier } from "@/lib/appointments";
import { SETTER_2026_MARGINAL_BANDS, SETTER_2026_ONE_OFF_RATE } from "@/lib/compPlan";
import type { BookedAppointmentReportItem } from "@/hooks/usePipelineItems";
import type { NewClient } from "@/hooks/useNewClients";
import { toMonthly } from "@/lib/clientRevenue";

export type TrackerFunnel = "cold" | "ads";
export type TierFilter = "all" | BookingTier;

export const COLD_CALL_CHANNEL = "Cold Call";
const TZ = "Australia/Melbourne";

// One shared formatter: toLocaleDateString builds a new one per call, which is
// slow over a whole year of call logs (26k+ rows).
const DAY_KEY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export const dayKeyOf = (iso: string) => DAY_KEY_FORMAT.format(new Date(iso));

/** Dials start in March 2026: the tracker has nothing to show before this month. */
export const TRACKER_FIRST_DATA_MONTH = "2026-03-01";

/**
 * The Tracker's default range start: 1 January of today's year, or the first
 * month with data if that is later. The range runs to today.
 */
export function trackerDefaultFrom(today: string) {
  const jan = `${today.slice(0, 4)}-01-01`;
  const from = jan > TRACKER_FIRST_DATA_MONTH ? jan : TRACKER_FIRST_DATA_MONTH;
  return from > today ? `${today.slice(0, 7)}-01` : from;
}

/** Months start collapsed except the current one (or the only month in view). */
export function defaultMonthOpen(month: string, currentMonth: string, monthCount: number) {
  return monthCount === 1 || month === currentMonth;
}

/** Weeks inside an open month start collapsed except the current week (or a month's only week). */
export function defaultWeekOpen(from: string, to: string, today: string, weekCount: number) {
  return weekCount === 1 || (from <= today && today <= to);
}

/** Collapse-state key for a week (months are keyed by their first day). */
export const weekKey = (from: string) => `week:${from}`;

export function addDayKeys(key: string, n: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDayKeys(d, 1)) out.push(d);
  return out;
}

export const monthOf = (day: string) => `${day.slice(0, 7)}-01`;

/**
 * Split a month's days (in order) into Sunday-to-Saturday weeks. A week never
 * crosses into another month, so the first and last weeks can be short.
 */
export function weeksOf(days: string[]): string[][] {
  const weeks: string[][] = [];
  for (const d of days) {
    const sunday = new Date(`${d}T12:00:00Z`).getUTCDay() === 0;
    if (weeks.length === 0 || sunday) weeks.push([d]);
    else weeks[weeks.length - 1].push(d);
  }
  return weeks;
}

export function lastDayOfMonth(month: string) {
  const d = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/**
 * Bede's bookable calendar: 9:00 to 18:30 Monday to Friday (9.5 one-hour slots), a half day
 * to 13:00 on Saturday (4), nothing Sunday. The directors' meeting takes 9 to 10 on Monday
 * and Thursday. Evenings to 20:00 happen but are not counted as standing capacity.
 * Moved here from ClosingTracker (which re-exports it) so both tabs share one definition.
 */
export function availableSlotsForDay(key: string) {
  const dow = (new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7;
  if (dow === 6) return 0;
  if (dow === 5) return 4;
  return dow === 0 || dow === 3 ? 8.5 : 9.5;
}

// ── Channel and tier ────────────────────────────────────────────────────────

/** Cold view = the Cold Call channel; Ads view = every other channel (Ads, Website, Meta, Unattributed...). */
export function inFunnel(channel: string | null | undefined, funnel: TrackerFunnel) {
  const isCold = (channel || "Unattributed") === COLD_CALL_CHANNEL;
  return funnel === "cold" ? isCold : !isCold;
}

type TierSource = {
  booking_tier?: string | null;
  contacts?: { team_size?: number | null; monthly_revenue?: number | null } | null;
};

/**
 * The tier of a booking: the one saved on it, else the rule applied to the
 * contact's team size and monthly revenue (backdates older bookings where the
 * data allows). Null = unknown.
 */
export function bookingTierOf(item: TierSource): BookingTier | null {
  if (item.booking_tier === "tier_1" || item.booking_tier === "tier_2") return item.booking_tier;
  return tierFor(item.contacts?.team_size ?? null, item.contacts?.monthly_revenue ?? null);
}

export function matchesTier(tier: BookingTier | null, filter: TierFilter) {
  return filter === "all" || tier === filter;
}

/**
 * How the meeting got on the calendar. Before 17 Nov 2026 nothing was
 * recorded; every cold booking then was a setter booking by phone, so a
 * blank method on a Cold Call booking reads as a manual set. Elsewhere a blank
 * stays unknown.
 */
export function bookingMethodOf(item: { booking_method?: string | null; meeting_channel?: string | null }) {
  if (item.booking_method) return item.booking_method;
  return (item.meeting_channel || "Unattributed") === COLD_CALL_CHANNEL ? "manual_set" : null;
}

// ── Stats ──────────────────────────────────────────────────────────────────

export type TrackerItem = BookedAppointmentReportItem & {
  booking_tier?: string | null;
  booking_method?: string | null;
};

export interface TrackerInputRow {
  day: string;
  funnel: string;
  user_id: string | null;
  rostered_hours: number | null;
  ad_spend: number | null;
  clicks: number | null;
  leads: number | null;
}

export interface CompPlanRow {
  user_id: string;
  role: string;
  base_annual: number;
  plan_key: string;
  active_from: string | null;
}

/** Counts for a day or a month. Everything but the lead sets is a plain sum. */
export interface TrackerStats {
  // Marketing
  adSpend: number;
  clicks: number;
  leads: number;
  tier1Leads: number;
  dbsCreated: number;
  bookingRequests: number;
  // Setting
  dials: number;
  answers: number;
  leadsDialled: Set<string>;
  rosteredHours: number;
  productiveHours: number;
  manualSets: number;
  confirmedDbs: number;
  totalSets: number;
  /** Total sets by booking tier. T1 + T2 + unknown = total sets. */
  setsT1: number;
  setsT2: number;
  setsUnknownTier: number;
  // Closing calendar
  availability: number;
  bookingsOnCal: number;
  live: number;
  cancels: number;
  noShows: number;
  reschedules: number;
  missedByUs: number;
  pending: number;
  qualifiedLive: number;
  /** Live calls marked not qualified. Unmarked ones are in neither count. */
  notQualifiedLive: number;
  /** Live calls that didn't close on the day (no close, follow-up, second meeting booked), by objection. */
  didntClose: number;
  /** Second meeting booked: still in the funnel, kept out of the didn't-close objections. */
  stillInPlay: number;
  whyPrice: number;
  whyThink: number;
  whyTiming: number;
  whyAgency: number;
  whyFear: number;
  whyOther: number;
  whyNotQualified: number;
  whyBlank: number;
  // Closing results
  newClients: number;
  cash: number;
  // Tier split (unknown tier left out of both)
  bookingsOnCalT1: number;
  bookingsOnCalT2: number;
  liveT1: number;
  liveT2: number;
  newClientsT1: number;
  newClientsT2: number;
  cashT1: number;
  cashT2: number;
  // P&L
  setterBase: number;
  commission: number;
}

export function emptyTrackerStats(): TrackerStats {
  return {
    adSpend: 0, clicks: 0, leads: 0, tier1Leads: 0, dbsCreated: 0, bookingRequests: 0,
    dials: 0, answers: 0, leadsDialled: new Set(), rosteredHours: 0, productiveHours: 0, manualSets: 0, confirmedDbs: 0, totalSets: 0,
    setsT1: 0, setsT2: 0, setsUnknownTier: 0,
    availability: 0, bookingsOnCal: 0, live: 0, cancels: 0, noShows: 0, reschedules: 0, missedByUs: 0, pending: 0, qualifiedLive: 0, notQualifiedLive: 0,
    didntClose: 0, stillInPlay: 0, whyPrice: 0, whyThink: 0, whyTiming: 0, whyAgency: 0, whyFear: 0, whyOther: 0, whyNotQualified: 0, whyBlank: 0,
    newClients: 0, cash: 0,
    bookingsOnCalT1: 0, bookingsOnCalT2: 0, liveT1: 0, liveT2: 0, newClientsT1: 0, newClientsT2: 0, cashT1: 0, cashT2: 0,
    setterBase: 0, commission: 0,
  };
}

const SUMMED: (keyof TrackerStats)[] = [
  "adSpend", "clicks", "leads", "tier1Leads", "dbsCreated", "bookingRequests",
  "dials", "answers", "rosteredHours", "productiveHours", "manualSets", "confirmedDbs", "totalSets",
  "setsT1", "setsT2", "setsUnknownTier",
  "availability", "bookingsOnCal", "live", "cancels", "noShows", "reschedules", "missedByUs", "pending", "qualifiedLive", "notQualifiedLive",
  "didntClose", "stillInPlay", "whyPrice", "whyThink", "whyTiming", "whyAgency", "whyFear", "whyOther", "whyNotQualified", "whyBlank",
  "newClients", "cash",
  "bookingsOnCalT1", "bookingsOnCalT2", "liveT1", "liveT2", "newClientsT1", "newClientsT2", "cashT1", "cashT2",
  "setterBase", "commission",
];

/** Month total = sum of the days (unique leads dialled are a union, not a sum). */
export function sumTrackerStats(days: TrackerStats[]): TrackerStats {
  const out = emptyTrackerStats();
  for (const d of days) {
    for (const k of SUMMED) (out[k] as number) += d[k] as number;
    for (const id of d.leadsDialled) out.leadsDialled.add(id);
  }
  return out;
}

/** Where a first-meeting slot on the calendar ended. Every slot lands in exactly one. */
export type CalendarBucket = "live" | "cancelled" | "noshow" | "missed_by_us" | "rescheduled" | "pending";

/**
 * Second meetings whose next meeting has already happened (closed, no close,
 * verbal, DQ, no-show or cancelled). The deal is then counted once, by that
 * later meeting, so these are no longer "still in play" (Bede, 23 Nov).
 */
export function supersededSecondMeetings(
  items: Array<{ id: string; contact_id: string; scheduled_for: string | null; appointment_outcome?: string | null; resolved_bucket?: string | null; is_reschedule_slot?: boolean }>,
): Set<string> {
  const byContact = new Map<string, typeof items>();
  for (const i of items) {
    if (i.is_reschedule_slot || !i.scheduled_for) continue;
    byContact.set(i.contact_id, [...(byContact.get(i.contact_id) ?? []), i]);
  }
  const out = new Set<string>();
  for (const list of byContact.values()) {
    for (const i of list) {
      if (i.appointment_outcome !== "second_meeting_booked") continue;
      const later = list.some(
        (j) =>
          j.id !== i.id &&
          j.scheduled_for! > i.scheduled_for! &&
          (Boolean(j.appointment_outcome) || ["showed", "noshow", "cancelled"].includes(j.resolved_bucket ?? "")),
      );
      if (later) out.add(i.id);
    }
  }
  return out;
}

/** Sat and didn't close on the day: each carries an objection (required on the meeting card). */
const DIDNT_CLOSE = new Set(["showed_no_close", "no_close_follow_up"]);

type WhyKey = "whyPrice" | "whyThink" | "whyTiming" | "whyAgency" | "whyFear" | "whyOther" | "whyNotQualified" | "whyBlank";
/** The tracker column an objection counts in. A DQ reason on a no-close counts as not qualified. */
export function whyKeyOf(reason: string | null | undefined): WhyKey {
  switch (reason) {
    case "price_budget": return "whyPrice";
    case "think_partner": return "whyThink";
    case "timing": return "whyTiming";
    case "agency_trust": return "whyAgency";
    case "fear": return "whyFear";
    case null: case undefined: case "": return "whyBlank";
    default: return reason.startsWith("dq_") ? "whyNotQualified" : "whyOther";
  }
}

export function calendarBucketOf(item: Pick<TrackerItem, "resolved_bucket" | "outcome_reason" | "is_reschedule_slot">): CalendarBucket {
  if (item.is_reschedule_slot) return "rescheduled";
  switch (item.resolved_bucket) {
    case "showed": return "live";
    case "cancelled": return "cancelled";
    case "rescheduled": return "rescheduled";
    case "noshow": return item.outcome_reason === MISSED_BY_US_REASON ? "missed_by_us" : "noshow";
    default: return "pending";
  }
}

/** live + cancels + no-shows + reschedules + missed + pending == bookings on the calendar. */
export function addsUp(s: Pick<TrackerStats, "live" | "cancels" | "noShows" | "reschedules" | "missedByUs" | "pending" | "bookingsOnCal">) {
  return s.live + s.cancels + s.noShows + s.reschedules + s.missedByUs + s.pending === s.bookingsOnCal;
}

export interface NewClientWithCredit extends NewClient {
  /** created_by of the lead's first booking: the setter credited. */
  setter_id: string | null;
  /** Tier of the contact's latest booking. */
  tier: BookingTier | null;
}

export interface BuildTrackerArgs {
  days: string[];
  funnel: TrackerFunnel;
  tier: TierFilter;
  repId?: string;
  callLogs: Pick<ReportCallLog, "contact_id" | "outcome" | "created_at" | "user_id">[];
  /** Bookings plus reschedule slots (is_reschedule_slot), as loaded for Insights. */
  items: TrackerItem[];
  inputs: TrackerInputRow[];
  /** user_id -> day -> productive hours. */
  productiveHours: Map<string, Map<string, number>>;
  newClients: NewClientWithCredit[];
  /**
   * First-month cash COLLECTED for commission (paidCommissionCash): one row per
   * client per paid day, first_start = the paid day. Commission is paid on cash
   * in the month it lands, not on deals started.
   */
  commissionCash?: (NewClientWithCredit & { sale_start?: string })[];
  compPlans: CompPlanRow[];
}

/** Setters on a pay plan on a given day (active_from blank = always). */
function activeSetters(plans: CompPlanRow[], day: string, repId?: string) {
  return plans.filter((p) => p.role === "setter" && (!p.active_from || p.active_from <= day) && (!repId || p.user_id === repId));
}

/** One stats object per day key. */
export function buildDailyTrackerStats(args: BuildTrackerArgs): Map<string, TrackerStats> {
  const { days, funnel, tier, repId } = args;
  const byDay = new Map<string, TrackerStats>(days.map((d) => [d, emptyTrackerStats()]));
  const get = (day: string) => byDay.get(day);
  for (const d of days) get(d)!.availability = availableSlotsForDay(d);

  // Daily inputs. Rostered hours are per setter on the cold funnel; ad numbers on the ads funnel.
  for (const r of args.inputs) {
    const s = get(r.day);
    if (!s) continue;
    if (r.funnel === "cold" && funnel === "cold" && (!repId || r.user_id === repId)) s.rosteredHours += Number(r.rostered_hours) || 0;
    if (r.funnel === "ads" && funnel === "ads") {
      s.adSpend += Number(r.ad_spend) || 0;
      s.clicks += Number(r.clicks) || 0;
      s.leads += Number(r.leads) || 0;
    }
  }

  // Dials and productive hours: the dialer is the cold funnel. Not split by tier.
  if (funnel === "cold") {
    for (const log of args.callLogs) {
      if (repId && log.user_id !== repId) continue;
      const s = get(dayKeyOf(log.created_at));
      if (!s) continue;
      s.dials += 1;
      if (ANSWERED_OUTCOMES.has(log.outcome)) s.answers += 1;
      if (log.contact_id) s.leadsDialled.add(log.contact_id);
    }
    for (const [uid, perDay] of args.productiveHours) {
      if (repId && uid !== repId) continue;
      for (const [day, hours] of perDay) {
        const s = get(day);
        if (s) s.productiveHours += hours;
      }
    }
  }

  // Each booking's tier is worked out once and reused below.
  const inView: { i: TrackerItem; t: BookingTier | null }[] = [];
  const superseded = supersededSecondMeetings(args.items);
  for (const i of args.items) {
    if (!inFunnel(i.meeting_channel, funnel)) continue;
    const t = bookingTierOf(i);
    if (matchesTier(t, tier)) inView.push({ i, t });
  }

  // Sets: first meetings booked that day, by the setter (created_by).
  const tier1LeadsByDay = new Map<string, Set<string>>();
  for (const { i, t } of inView) {
    if (i.is_reschedule_slot || i.is_follow_up || !i.created_at) continue;
    if (repId && i.created_by !== repId) continue;
    const day = dayKeyOf(i.created_at);
    const s = get(day);
    if (!s) continue;
    const method = bookingMethodOf(i);
    s.totalSets += 1;
    if (t === "tier_1") s.setsT1 += 1;
    else if (t === "tier_2") s.setsT2 += 1;
    else s.setsUnknownTier += 1;
    if (method === "manual_set") s.manualSets += 1;
    if (method === "self_booked") { s.dbsCreated += 1; s.confirmedDbs += 1; }
    if (method === "booking_request") s.bookingRequests += 1;
    if (funnel === "ads" && t === "tier_1") {
      const set = tier1LeadsByDay.get(day) ?? new Set<string>();
      set.add(i.contact_id);
      tier1LeadsByDay.set(day, set);
    }
  }
  for (const [day, set] of tier1LeadsByDay) get(day)!.tier1Leads = set.size;

  // Calendar: first-meeting slots due that day, by the closer (assigned_user_id).
  for (const { i, t } of inView) {
    if (i.is_follow_up || !i.scheduled_for) continue;
    if (repId && i.assigned_user_id !== repId) continue;
    const s = get(dayKeyOf(i.scheduled_for));
    if (!s) continue;
    s.bookingsOnCal += 1;
    if (t === "tier_1") s.bookingsOnCalT1 += 1;
    else if (t === "tier_2") s.bookingsOnCalT2 += 1;
    const bucket = calendarBucketOf(i);
    if (bucket === "live") {
      s.live += 1;
      if (t === "tier_1") s.liveT1 += 1;
      else if (t === "tier_2") s.liveT2 += 1;
      if (i.is_qualified === true) s.qualifiedLive += 1;
      else if (i.is_qualified === false) s.notQualifiedLive += 1;
      if (i.appointment_outcome === "second_meeting_booked" && !superseded.has(i.id)) s.stillInPlay += 1;
      if (DIDNT_CLOSE.has(i.appointment_outcome ?? "")) {
        s.didntClose += 1;
        s[whyKeyOf(i.outcome_reason)] += 1;
      }
    } else if (bucket === "cancelled") s.cancels += 1;
    else if (bucket === "noshow") s.noShows += 1;
    else if (bucket === "missed_by_us") s.missedByUs += 1;
    else if (bucket === "rescheduled") s.reschedules += 1;
    else s.pending += 1;
  }

  // Results: new clients by first deal start day.
  for (const n of args.newClients) {
    if (!inFunnel(n.channel, funnel) || !matchesTier(n.tier, tier)) continue;
    if (repId && n.setter_id !== repId) continue;
    const s = get(n.first_start);
    if (!s) continue;
    const cash = (n.mrr || 0) + (n.one_off || 0);
    s.newClients += 1;
    s.cash += cash;
    if (n.tier === "tier_1") { s.newClientsT1 += 1; s.cashT1 += cash; }
    else if (n.tier === "tier_2") { s.newClientsT2 += 1; s.cashT2 += cash; }
  }

  // Setter pay sits in the cold view: the setters are the cold callers.
  // Commission lands on the day the first-month cash is paid, allocated per
  // payment in date order over the whole calendar month (any channel, any
  // tier: pay does not split).
  if (funnel === "cold") {
    for (const d of days) {
      for (const p of activeSetters(args.compPlans, d, repId)) get(d)!.setterBase += (Number(p.base_annual) || 0) / 365;
    }
    for (const sale of saleCommissions(args.commissionCash ?? [], args.compPlans, repId)) {
      const s = get(sale.day);
      if (s) s.commission += sale.commission;
    }
  }
  return byDay;
}

/** Retainer dollars of one sale in one commission bracket. */
export interface BracketSlice {
  rate: number;
  amount: number;
}

/**
 * Split a sale's retainer dollars across the setter_2026_marginal brackets,
 * given the setter's month running total before the sale. Each dollar earns
 * the rate of the bracket it falls in. Zero-dollar slices are left out.
 */
export function splitAcrossBrackets(before: number, amount: number): BracketSlice[] {
  const out: BracketSlice[] = [];
  if (amount <= 0) return out;
  const after = before + amount;
  for (const band of SETTER_2026_MARGINAL_BANDS) {
    const lo = Math.max(before, band.from);
    const hi = Math.min(after, band.to);
    if (hi > lo) out.push({ rate: band.rate, amount: hi - lo });
  }
  return out;
}

/** One credited sale with its own share of the setter's month commission. */
export interface SaleCommission {
  contact_id: string;
  business_name: string | null;
  setter_id: string;
  /** The commission day: the day the cash was paid (first_start of the input row). */
  day: string;
  /** The deal's start day, when the input is paid cash (CommissionCash). */
  sale_start?: string;
  month: string;
  retainer: number;
  oneOff: number;
  /** Setter's first-month retainer total for the calendar month, before and after this sale. */
  runningBefore: number;
  runningAfter: number;
  brackets: BracketSlice[];
  retainerCommission: number;
  oneOffCommission: number;
  commission: number;
}

function onMarginalPlan(plans: CompPlanRow[], setterId: string, month: string) {
  const plan = plans.find((p) => p.user_id === setterId);
  if (!plan || plan.role !== "setter" || plan.plan_key !== "setter_2026_marginal") return false;
  return !plan.active_from || plan.active_from <= lastDayOfMonth(month);
}

/**
 * Commission per sale on 'setter_2026_marginal'. Per setter, per calendar
 * month, the credited sales are taken in date order (first deal start day,
 * then contact id). Each sale's retainer dollars are split across the brackets
 * they fall into on the month running total; one-off cash earns a flat 5% and
 * does not move the running total. So the per-sale amounts add up to the month
 * figure. `clients` should hold every new client of each whole month in view
 * (any channel, any tier: pay does not split); the setter credited is the
 * created_by of the lead's first booking. Returned in date order.
 */
export function saleCommissions(clients: (NewClientWithCredit & { sale_start?: string })[], plans: CompPlanRow[], repId?: string): SaleCommission[] {
  const eligible = clients
    .filter((n) => n.setter_id && (!repId || n.setter_id === repId) && onMarginalPlan(plans, n.setter_id, monthOf(n.first_start)))
    .slice()
    .sort((a, b) => a.first_start.localeCompare(b.first_start) || a.contact_id.localeCompare(b.contact_id));
  const running = new Map<string, number>();
  return eligible.map((n) => {
    const setter = n.setter_id!;
    const month = monthOf(n.first_start);
    const key = `${setter}|${month}`;
    const retainer = n.mrr || 0;
    const oneOff = Math.max(0, n.one_off || 0);
    const runningBefore = running.get(key) ?? 0;
    const brackets = splitAcrossBrackets(runningBefore, retainer);
    const runningAfter = runningBefore + Math.max(0, retainer);
    running.set(key, runningAfter);
    const retainerCommission = brackets.reduce((sum, b) => sum + b.amount * b.rate, 0);
    const oneOffCommission = oneOff * SETTER_2026_ONE_OFF_RATE;
    return {
      contact_id: n.contact_id,
      business_name: n.business_name,
      setter_id: setter,
      day: n.first_start,
      sale_start: n.sale_start,
      month,
      retainer,
      oneOff,
      runningBefore,
      runningAfter,
      brackets,
      retainerCommission,
      oneOffCommission,
      commission: retainerCommission + oneOffCommission,
    };
  });
}

/** The brackets a sale hit, e.g. "15% / 18%", plus "5% one-off" when it has project cash. */
export function bracketLabel(sale: Pick<SaleCommission, "brackets" | "oneOff">) {
  const parts = sale.brackets.map((b) => `${Math.round(b.rate * 100)}%`);
  const retainer = parts.join(" / ");
  const oneOff = sale.oneOff > 0 ? `${Math.round(SETTER_2026_ONE_OFF_RATE * 100)}% one-off` : "";
  return [retainer, oneOff].filter(Boolean).join(" + ") || "-";
}

/**
 * Commission for one calendar month, per setter: the sum of that month's
 * per-sale commissions (saleCommissions).
 */
export function monthCommission(clients: NewClientWithCredit[], plans: CompPlanRow[], month: string, repId?: string) {
  let total = 0;
  const perSetter = new Map<string, number>();
  for (const sale of saleCommissions(clients, plans, repId)) {
    if (sale.month !== month) continue;
    perSetter.set(sale.setter_id, (perSetter.get(sale.setter_id) ?? 0) + sale.commission);
    total += sale.commission;
  }
  return { total, perSetter };
}

// ── Paid marker: commission on first-month cash collected ──────────────────

export interface SetterDealPayment {
  id: string;
  paid_on: string;
  amount: number;
  note: string | null;
}

/** A first deal (public.get_setter_first_deals) of a lead whose first booking a rep on a comp plan made. */
export interface SetterFirstDeal {
  deal_id: string;
  contact_id: string;
  business_name: string | null;
  setter_id: string | null;
  billing_period: string;
  amount: number;
  /** First month fee when it differs from the ongoing amount (Bright Future: $4k first month, then $2k/mo). */
  first_month_amount?: number | null;
  start_date: string;
  status: string;
  payments: SetterDealPayment[];
}

/** One client's commissionable cash on one paid day, shaped as a sale for saleCommissions. */
export interface CommissionCash extends NewClientWithCredit {
  /** The client's first deal start day. first_start is the paid day. */
  sale_start: string;
}

/** What commission can be paid on: the first month's fee (first_month_amount when set), or the whole one-off. */
export function firstMonthValue(d: Pick<SetterFirstDeal, "billing_period" | "amount" | "first_month_amount">) {
  if (d.first_month_amount != null && d.billing_period !== "one_off") return Math.max(0, Number(d.first_month_amount) || 0);
  const amount = Number(d.amount) || 0;
  return d.billing_period === "one_off" ? amount : toMonthly(amount, d.billing_period);
}

/** Payments counted toward a deal's first month, in paid order, capped at its first-month value. */
function countedPayments(d: SetterFirstDeal) {
  let left = firstMonthValue(d);
  const out: { paid_on: string; amount: number }[] = [];
  for (const p of [...d.payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.id.localeCompare(b.id))) {
    const amount = Math.min(Math.max(0, Number(p.amount) || 0), left);
    if (amount <= 0) continue;
    left -= amount;
    out.push({ paid_on: p.paid_on, amount });
  }
  return out;
}

/**
 * First-month cash collected, per client per paid day: the input to
 * saleCommissions for the paid-cash rule. Retainer payments move the setter's
 * running total; one-off payments earn 5% flat. Payments past a deal's
 * first-month value are later months' fees and earn nothing. An instalment
 * deal lands each payment in the month it is paid.
 */
export function paidCommissionCash(deals: SetterFirstDeal[]): CommissionCash[] {
  const byKey = new Map<string, CommissionCash>();
  for (const d of deals) {
    if (!d.setter_id) continue;
    for (const p of countedPayments(d)) {
      const key = `${d.contact_id}|${p.paid_on}`;
      const row = byKey.get(key) ?? {
        contact_id: d.contact_id, business_name: d.business_name, channel: null, source: null,
        first_start: p.paid_on, mrr: 0, one_off: 0, dialled: false, setter_id: d.setter_id, tier: null,
        sale_start: d.start_date,
      };
      if (d.billing_period === "one_off") row.one_off += p.amount;
      else row.mrr += p.amount;
      if (d.start_date < row.sale_start) row.sale_start = d.start_date;
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

export interface AwaitingPayment {
  deal_id: string;
  contact_id: string;
  business_name: string | null;
  setter_id: string;
  start_date: string;
  billing_period: string;
  value: number;
  paid: number;
  outstanding: number;
}

/**
 * First deals still owed first-month cash, for a setter on the commission
 * plan, oldest first. Churned deals are left out: they will not pay.
 */
export function awaitingPayment(deals: SetterFirstDeal[], plans: CompPlanRow[], repId?: string): AwaitingPayment[] {
  const onPlan = new Set(plans.filter((p) => p.role === "setter" && p.plan_key === "setter_2026_marginal").map((p) => p.user_id));
  const out: AwaitingPayment[] = [];
  for (const d of deals) {
    if (!d.setter_id || !onPlan.has(d.setter_id) || (repId && d.setter_id !== repId) || d.status === "churned") continue;
    const value = firstMonthValue(d);
    const paid = countedPayments(d).reduce((t, p) => t + p.amount, 0);
    if (value - paid <= 0) continue;
    out.push({
      deal_id: d.deal_id, contact_id: d.contact_id, business_name: d.business_name, setter_id: d.setter_id,
      start_date: d.start_date, billing_period: d.billing_period, value, paid, outstanding: value - paid,
    });
  }
  return out.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.deal_id.localeCompare(b.deal_id));
}

/** Credit each new client to the setter of the lead's first booking and tag it with the latest booking's tier. */
export function creditNewClients(
  clients: NewClient[],
  history: { contact_id: string; created_at: string; created_by: string | null; booking_tier?: string | null; id: string }[],
  contacts?: Map<string, { team_size?: number | null; monthly_revenue?: number | null }>,
): NewClientWithCredit[] {
  const byContact = new Map<string, typeof history>();
  for (const h of history) {
    const list = byContact.get(h.contact_id) ?? [];
    list.push(h);
    byContact.set(h.contact_id, list);
  }
  return clients.map((n) => {
    const list = (byContact.get(n.contact_id) ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const first = list[0];
    const latest = list[list.length - 1];
    const tier = latest
      ? bookingTierOf({ booking_tier: latest.booking_tier, contacts: contacts?.get(n.contact_id) ?? null })
      : bookingTierOf({ booking_tier: null, contacts: contacts?.get(n.contact_id) ?? null });
    return { ...n, setter_id: first?.created_by ?? null, tier };
  });
}

// ── Derived columns ─────────────────────────────────────────────────────────

export const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
export const pctOf = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);

export function setterCost(s: TrackerStats) {
  return s.setterBase + s.commission;
}
export function totalCost(s: TrackerStats) {
  return setterCost(s) + s.adSpend;
}
/** The lead count the funnel starts from: unique leads dialled (cold) or leads from the ads (ads). */
export function leadsFor(s: TrackerStats, funnel: TrackerFunnel) {
  return funnel === "cold" ? s.leadsDialled.size : s.leads;
}

/**
 * Tier split for one tier: the closing side of Tier 1 vs Tier 2 bookings.
 * Show rate uses the Show rate column's definition (live calls ÷ bookings on
 * the calendar), within the tier. Unknown-tier bookings and clients are in
 * neither tier.
 */
export function tierSplitOf(s: TrackerStats, t: BookingTier) {
  const one = t === "tier_1";
  const sets = one ? s.setsT1 : s.setsT2;
  const bookingsOnCal = one ? s.bookingsOnCalT1 : s.bookingsOnCalT2;
  const live = one ? s.liveT1 : s.liveT2;
  const newClients = one ? s.newClientsT1 : s.newClientsT2;
  const cash = one ? s.cashT1 : s.cashT2;
  return {
    sets,
    bookingsOnCal,
    live,
    showRate: pctOf(live, bookingsOnCal),
    newClients,
    setToClose: pctOf(newClients, sets),
    liveToClose: pctOf(newClients, live),
    cash,
    avgCash: ratio(cash, newClients),
    cashPerSet: ratio(cash, sets),
  };
}
