import type { Tables } from "@/integrations/supabase/types";
import { getTalkTimeSeconds, ANSWERED_OUTCOMES } from "@/lib/reportMetrics";

type CallLogRow = Pick<
  Tables<"call_logs">,
  "id" | "contact_id" | "user_id" | "outcome" | "created_at" | "dialpad_talk_time_seconds" | "dialpad_total_duration_seconds" | "reached_connection"
> & {
  contacts?: Partial<Pick<Tables<"contacts">,
    "industry" | "state" | "trade_type" | "work_type" | "business_size" | "prospect_tier" | "buying_signal_strength" | "has_google_ads" | "has_facebook_ads"
  >> | null;
};

type BookingRow = {
  id: string;
  contact_id: string;
  created_at: string;
  created_by: string;
  assigned_user_id: string;
  scheduled_for: string | null;
  appointment_outcome: string | null;
  deal_value: number | null;
  monthly_recurring_value: number | null;
  contacts?: Partial<Pick<Tables<"contacts">,
    "industry" | "state" | "trade_type" | "work_type" | "business_size" | "prospect_tier" | "buying_signal_strength" | "has_google_ads" | "has_facebook_ads"
  >> | null;
};

function toDateKey(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inRange(iso: string | null, from?: string, to?: string) {
  if (!iso) return false;
  const k = toDateKey(iso);
  if (from && k < from) return false;
  if (to && k > to) return false;
  return true;
}

export interface SegmentRow {
  key: string;
  label: string;
  dials: number;
  conversations: number;
  bookings: number;
  showed: number;
  closed: number;
  setupRevenue: number;
  mrr: number;
  firstYearValue: number;
  contactRate: number; // conversations / dials
  bookingRate: number; // bookings / conversations
  closeRate: number;   // closed / showed
  revenuePerDial: number;
}

export type SegmentDimensionKey =
  | "industry"
  | "state"
  | "trade_type"
  | "work_type"
  | "business_size"
  | "prospect_tier"
  | "buying_signal_strength"
  | "has_google_ads"
  | "has_facebook_ads";

export const SEGMENT_DIMENSIONS: { key: SegmentDimensionKey; label: string }[] = [
  { key: "industry", label: "Industry" },
  { key: "state", label: "State" },
  { key: "trade_type", label: "Trade Type" },
  { key: "work_type", label: "Work Type" },
  { key: "business_size", label: "Business Size" },
  { key: "prospect_tier", label: "Prospect Tier" },
  { key: "buying_signal_strength", label: "Buying Signal" },
  { key: "has_google_ads", label: "Has Google Ads" },
  { key: "has_facebook_ads", label: "Has FB Ads" },
];

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

export function getSegmentRows(
  callLogs: CallLogRow[],
  bookings: BookingRow[],
  dim: SegmentDimensionKey,
  from?: string,
  to?: string,
): SegmentRow[] {
  const dialsInRange = callLogs.filter((l) => inRange(l.created_at, from, to));
  const bookingsInRange = bookings.filter((b) => inRange(b.created_at, from, to));

  const map = new Map<string, SegmentRow>();
  const get = (key: string): SegmentRow => {
    let r = map.get(key);
    if (!r) {
      r = {
        key,
        label: key || "Unknown",
        dials: 0,
        conversations: 0,
        bookings: 0,
        showed: 0,
        closed: 0,
        setupRevenue: 0,
        mrr: 0,
        firstYearValue: 0,
        contactRate: 0,
        bookingRate: 0,
        closeRate: 0,
        revenuePerDial: 0,
      };
      map.set(key, r);
    }
    return r;
  };

  for (const l of dialsInRange) {
    const k = String((l.contacts?.[dim] as unknown) ?? "Unknown");
    const r = get(k);
    r.dials += 1;
    if (l.reached_connection) r.conversations += 1;
  }

  for (const b of bookingsInRange) {
    const k = String((b.contacts?.[dim] as unknown) ?? "Unknown");
    const r = get(k);
    r.bookings += 1;
    if (b.appointment_outcome && b.appointment_outcome !== "no_show" && b.appointment_outcome !== "rescheduled") {
      r.showed += 1;
    }
    if (b.appointment_outcome === "showed_closed") {
      r.closed += 1;
      r.setupRevenue += Number(b.deal_value ?? 0);
      r.mrr += Number(b.monthly_recurring_value ?? 0);
    }
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    firstYearValue: r.setupRevenue + r.mrr * 12,
    contactRate: pct(r.conversations, r.dials),
    bookingRate: pct(r.bookings, r.conversations),
    closeRate: pct(r.closed, r.showed),
    revenuePerDial: r.dials > 0 ? Math.round(((r.setupRevenue + r.mrr * 12) / r.dials) * 100) / 100 : 0,
  }));

  return rows.sort((a, b) => b.dials - a.dials);
}

export interface MonthlyTrendPoint {
  monthKey: string;
  label: string;
  dials: number;
  conversations: number;
  bookings: number;
  showed: number;
  closed: number;
  revenue: number;
}

export function getMonthlyTrend(
  callLogs: CallLogRow[],
  bookings: BookingRow[],
  from?: string,
  to?: string,
): MonthlyTrendPoint[] {
  const map = new Map<string, MonthlyTrendPoint>();
  const ensure = (iso: string) => {
    const k = iso.slice(0, 7);
    let p = map.get(k);
    if (!p) {
      const [y, m] = k.split("-");
      const d = new Date(Number(y), Number(m) - 1, 1);
      p = {
        monthKey: k,
        label: d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
        dials: 0,
        conversations: 0,
        bookings: 0,
        showed: 0,
        closed: 0,
        revenue: 0,
      };
      map.set(k, p);
    }
    return p;
  };

  for (const l of callLogs) {
    if (!inRange(l.created_at, from, to)) continue;
    const p = ensure(l.created_at);
    p.dials += 1;
    if (l.reached_connection) p.conversations += 1;
  }

  for (const b of bookings) {
    if (inRange(b.created_at, from, to)) {
      ensure(b.created_at).bookings += 1;
    }
    if (b.appointment_outcome === "showed_closed" && b.scheduled_for && inRange(b.scheduled_for, from, to)) {
      const p = ensure(b.scheduled_for);
      p.showed += 1;
      p.closed += 1;
      p.revenue += Number(b.deal_value ?? 0) + Number(b.monthly_recurring_value ?? 0) * 12;
    } else if (
      b.appointment_outcome &&
      b.appointment_outcome !== "no_show" &&
      b.appointment_outcome !== "rescheduled" &&
      b.scheduled_for &&
      inRange(b.scheduled_for, from, to)
    ) {
      ensure(b.scheduled_for).showed += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

export interface RepPerformanceRow {
  repUserId: string;
  dials: number;
  talkTimeSeconds: number;
  conversations: number;
  bookings: number;
  showed: number;
  closed: number;
  setupRevenue: number;
  mrr: number;
  firstYearValue: number;
  contactRate: number;
  bookingRate: number;
  showRate: number;
  closeRate: number;
  dialToCloseRate: number;
  revenuePerDial: number;
  dialsPerClose: number;
}

export function getRepPerformance(
  callLogs: CallLogRow[],
  bookings: BookingRow[],
  from?: string,
  to?: string,
): RepPerformanceRow[] {
  const repIds = new Set<string>();
  for (const l of callLogs) if (l.user_id) repIds.add(l.user_id);
  for (const b of bookings) if (b.created_by) repIds.add(b.created_by);

  const rows: RepPerformanceRow[] = [];
  for (const repId of repIds) {
    const repLogs = callLogs.filter((l) => l.user_id === repId && inRange(l.created_at, from, to));
    const repBookings = bookings.filter((b) => b.created_by === repId && inRange(b.created_at, from, to));
    const dials = repLogs.length;
    const conversations = repLogs.filter((l) => l.reached_connection).length;
    const pickUps = repLogs.filter((l) => ANSWERED_OUTCOMES.has(l.outcome as never)).length;
    const talkTime = repLogs.reduce((s, l) => s + getTalkTimeSeconds(l as never), 0);
    const bookingsCount = repBookings.length;

    // Show/close from bookings scheduled in-range, attributed to setter (created_by)
    const scheduledInRange = bookings.filter(
      (b) => b.created_by === repId && b.scheduled_for && inRange(b.scheduled_for, from, to),
    );
    const showed = scheduledInRange.filter(
      (b) => b.appointment_outcome && !["no_show", "rescheduled"].includes(b.appointment_outcome),
    ).length;
    const closedDeals = scheduledInRange.filter((b) => b.appointment_outcome === "showed_closed");
    const closed = closedDeals.length;
    const setupRevenue = closedDeals.reduce((s, b) => s + Number(b.deal_value ?? 0), 0);
    const mrr = closedDeals.reduce((s, b) => s + Number(b.monthly_recurring_value ?? 0), 0);
    const firstYearValue = setupRevenue + mrr * 12;

    rows.push({
      repUserId: repId,
      dials,
      talkTimeSeconds: talkTime,
      conversations,
      bookings: bookingsCount,
      showed,
      closed,
      setupRevenue,
      mrr,
      firstYearValue,
      contactRate: pct(conversations, dials),
      bookingRate: pct(bookingsCount, conversations),
      showRate: pct(showed, scheduledInRange.length),
      closeRate: pct(closed, showed),
      dialToCloseRate: pct(closed, dials),
      revenuePerDial: dials > 0 ? Math.round((firstYearValue / dials) * 100) / 100 : 0,
      dialsPerClose: closed > 0 ? Math.round(dials / closed) : 0,
      // expose pickUps to silence unused warning; not currently surfaced
      ...(pickUps as unknown as object ? {} : {}),
    });
  }

  return rows.sort((a, b) => b.dials - a.dials);
}

export interface DailyDialPoint {
  date: string;
  dials: number;
  conversations: number;
  bookings: number;
}

export function getDailyActivity(
  callLogs: CallLogRow[],
  bookings: BookingRow[],
  from?: string,
  to?: string,
): DailyDialPoint[] {
  const map = new Map<string, DailyDialPoint>();
  const ensure = (k: string) => {
    let p = map.get(k);
    if (!p) {
      p = { date: k, dials: 0, conversations: 0, bookings: 0 };
      map.set(k, p);
    }
    return p;
  };
  for (const l of callLogs) {
    if (!inRange(l.created_at, from, to)) continue;
    const p = ensure(toDateKey(l.created_at));
    p.dials += 1;
    if (l.reached_connection) p.conversations += 1;
  }
  for (const b of bookings) {
    if (!inRange(b.created_at, from, to)) continue;
    ensure(toDateKey(b.created_at)).bookings += 1;
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
