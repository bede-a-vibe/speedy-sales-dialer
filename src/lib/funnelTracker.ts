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
import { setterMarginalCommission } from "@/lib/compPlan";
import type { BookedAppointmentReportItem } from "@/hooks/usePipelineItems";
import type { NewClient } from "@/hooks/useNewClients";

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
    availability: 0, bookingsOnCal: 0, live: 0, cancels: 0, noShows: 0, reschedules: 0, missedByUs: 0, pending: 0, qualifiedLive: 0,
    newClients: 0, cash: 0,
    bookingsOnCalT1: 0, bookingsOnCalT2: 0, liveT1: 0, liveT2: 0, newClientsT1: 0, newClientsT2: 0, cashT1: 0, cashT2: 0,
    setterBase: 0, commission: 0,
  };
}

const SUMMED: (keyof TrackerStats)[] = [
  "adSpend", "clicks", "leads", "tier1Leads", "dbsCreated", "bookingRequests",
  "dials", "answers", "rosteredHours", "productiveHours", "manualSets", "confirmedDbs", "totalSets",
  "setsT1", "setsT2", "setsUnknownTier",
  "availability", "bookingsOnCal", "live", "cancels", "noShows", "reschedules", "missedByUs", "pending", "qualifiedLive",
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

  // Setter base pay sits in the cold view: the setters are the cold callers.
  if (funnel === "cold") {
    for (const d of days) {
      for (const p of activeSetters(args.compPlans, d, repId)) get(d)!.setterBase += (Number(p.base_annual) || 0) / 365;
    }
  }
  return byDay;
}

/**
 * Commission for one calendar month, per setter on 'setter_2026_marginal'.
 * `clients` should be every new client whose first deal starts in that month
 * (any channel, any tier: pay does not split). The setter credited is the
 * created_by of the lead's first booking.
 */
export function monthCommission(clients: NewClientWithCredit[], plans: CompPlanRow[], month: string, repId?: string) {
  const bySetter = new Map<string, { retainer: number; oneOff: number }>();
  for (const n of clients) {
    if (monthOf(n.first_start) !== month || !n.setter_id) continue;
    const plan = plans.find((p) => p.user_id === n.setter_id);
    if (!plan || plan.role !== "setter" || plan.plan_key !== "setter_2026_marginal") continue;
    if (plan.active_from && plan.active_from > lastDayOfMonth(month)) continue;
    if (repId && n.setter_id !== repId) continue;
    const acc = bySetter.get(n.setter_id) ?? { retainer: 0, oneOff: 0 };
    acc.retainer += n.mrr || 0;
    acc.oneOff += n.one_off || 0;
    bySetter.set(n.setter_id, acc);
  }
  let total = 0;
  const perSetter = new Map<string, number>();
  for (const [uid, acc] of bySetter) {
    const c = setterMarginalCommission(acc.retainer, acc.oneOff).total;
    perSetter.set(uid, c);
    total += c;
  }
  return { total, perSetter };
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
