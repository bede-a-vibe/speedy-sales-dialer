import type { ReportMetrics } from "@/lib/reportMetrics";
import { formatDurationSeconds } from "@/lib/duration";
import { CONVERSATION_TAGGING_LAUNCH_LABEL } from "@/data/constants";

export type StatCategory = "activity" | "conversations" | "outcomes" | "bookings";

export const STAT_CATEGORY_LABEL: Record<StatCategory, string> = {
  activity: "Activity",
  conversations: "Conversations",
  outcomes: "Outcomes",
  bookings: "Bookings",
};

export const STAT_CATEGORY_DESCRIPTION: Record<StatCategory, string> = {
  activity: "Dials, leads, talk time",
  conversations: "Pickups, conversations & quality",
  outcomes: "Disposition results",
  bookings: "Booked, showed, closed & revenue",
};

export interface StatDefinition {
  id: string;
  label: string;
  category: StatCategory;
  /** Optional sub-grouping inside a category (e.g. "Conversion %", "Quality", "Revenue"). */
  subgroup?: string;
  subtext?: string;
  /** Returns the numeric value for delta comparisons. */
  raw: (m: ReportMetrics) => number;
  /** Returns the formatted string to display. */
  format: (m: ReportMetrics) => string;
  /** True if this metric is a percentage (formats deltas as pp). */
  isPercent?: boolean;
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

export const STAT_CATALOG: StatDefinition[] = [
  // ===== Activity =====
  { id: "dials", label: "Dials", category: "activity", raw: (m) => m.dialer.dials, format: (m) => String(m.dialer.dials) },
  { id: "unique_leads", label: "Unique Leads Dialed", category: "activity", raw: (m) => m.dialer.uniqueLeadsDialed, format: (m) => String(m.dialer.uniqueLeadsDialed) },
  {
    id: "avg_attempts",
    label: "Avg Attempts / Lead",
    category: "activity",
    subtext: "dials ÷ unique leads",
    raw: (m) => (m.dialer.uniqueLeadsDialed > 0 ? Math.round((m.dialer.dials / m.dialer.uniqueLeadsDialed) * 10) / 10 : 0),
    format: (m) => (m.dialer.uniqueLeadsDialed > 0 ? (m.dialer.dials / m.dialer.uniqueLeadsDialed).toFixed(1) : "0"),
  },
  { id: "pickups", label: "Pick Ups", category: "activity", raw: (m) => m.dialer.pickUps, format: (m) => String(m.dialer.pickUps) },
  { id: "pickup_rate", label: "Pick Up Rate", category: "activity", isPercent: true, raw: (m) => m.dialer.pickUpRate, format: (m) => `${m.dialer.pickUpRate}%` },
  { id: "talk_time", label: "Talk Time", category: "activity", raw: (m) => m.dialer.totalTalkTimeSeconds, format: (m) => formatDurationSeconds(m.dialer.totalTalkTimeSeconds) },
  { id: "avg_talk_dial", label: "Avg Talk / Dial", category: "activity", raw: (m) => m.dialer.averageTalkTimePerDialSeconds, format: (m) => formatDurationSeconds(m.dialer.averageTalkTimePerDialSeconds) },
  { id: "avg_talk_pickup", label: "Avg Talk / Pickup", category: "activity", raw: (m) => m.dialer.averageTalkTimePerPickupSeconds, format: (m) => formatDurationSeconds(m.dialer.averageTalkTimePerPickupSeconds) },

  // ===== Conversations (pickup → connection → quality) =====
  { id: "conversations", label: "Conversations", category: "conversations", subgroup: "Volume", subtext: "reached connection", raw: (m) => m.dialer.conversations, format: (m) => String(m.dialer.conversations) },
  { id: "dial_pickup", label: "Dial → Pickup", category: "conversations", subgroup: "Conversion %", isPercent: true, raw: (m) => m.dialer.pickUpRate, format: (m) => `${m.dialer.pickUpRate}%` },
  {
    id: "pickup_conversation",
    label: "Pickup → Conversation",
    category: "conversations",
    subgroup: "Conversion %",
    isPercent: true,
    subtext: `since ${CONVERSATION_TAGGING_LAUNCH_LABEL}`,
    raw: (m) =>
      m.dialer.conversationToBookingRate === null
        ? 0
        : pct(m.dialer.conversations, m.dialer.pickUpsSinceLaunch),
    format: (m) =>
      m.dialer.conversationToBookingRate === null
        ? "—"
        : `${pct(m.dialer.conversations, m.dialer.pickUpsSinceLaunch)}%`,
  },
  { id: "immediate_hang_ups", label: "Immediate Hang-Ups", category: "conversations", subgroup: "Quality", raw: (m) => m.dialer.immediateHangUps, format: (m) => String(m.dialer.immediateHangUps) },
  { id: "short_hangups_15s", label: "Short Hangups <15s", category: "conversations", subgroup: "Quality", raw: (m) => m.outboundDiagnostic.shortHangupsUnder15s, format: (m) => String(m.outboundDiagnostic.shortHangupsUnder15s) },
  { id: "short_hangups_2m", label: "Short Hangups <2m", category: "conversations", subgroup: "Quality", raw: (m) => m.outboundDiagnostic.shortHangupsUnder2m, format: (m) => String(m.outboundDiagnostic.shortHangupsUnder2m) },
  { id: "long_dq", label: "Long DQ >30m", category: "conversations", subgroup: "Quality", subtext: "long calls ending bad", raw: (m) => m.outboundDiagnostic.longDqOver30m, format: (m) => String(m.outboundDiagnostic.longDqOver30m) },

  // ===== Outcomes (call dispositions) =====
  { id: "no_answer", label: "No Answer", category: "outcomes", raw: (m) => m.outcomeCounts.no_answer, format: (m) => String(m.outcomeCounts.no_answer) },
  { id: "voicemail", label: "Voicemail", category: "outcomes", raw: (m) => m.outcomeCounts.voicemail, format: (m) => String(m.outcomeCounts.voicemail) },
  { id: "not_interested", label: "Not Interested", category: "outcomes", raw: (m) => m.outcomeCounts.not_interested, format: (m) => String(m.outcomeCounts.not_interested) },
  { id: "dnc", label: "DNC", category: "outcomes", raw: (m) => m.outcomeCounts.dnc, format: (m) => String(m.outcomeCounts.dnc) },
  { id: "follow_ups", label: "Follow-ups", category: "outcomes", raw: (m) => m.outcomeCounts.follow_up, format: (m) => String(m.outcomeCounts.follow_up) },

  // ===== Bookings (made → showed → closed → revenue) =====
  {
    id: "bookings_made",
    label: "Bookings Made",
    category: "bookings",
    subgroup: "Volume",
    subtext: "by date booked",
    raw: (m) => m.bookingsMade.totalBookingsMade,
    format: (m) => String(m.bookingsMade.totalBookingsMade),
  },
  {
    id: "same_next_day_rate",
    label: "Same/Next Day Rate",
    category: "bookings",
    subgroup: "Volume",
    isPercent: true,
    subtext: "fast bookings",
    raw: (m) => m.bookingsMade.sameDayNextDayRate,
    format: (m) => `${m.bookingsMade.sameDayNextDayRate}%`,
  },
  {
    id: "conversation_booking",
    label: "Conversation → Booking",
    category: "bookings",
    subgroup: "Conversion %",
    isPercent: true,
    subtext: `since ${CONVERSATION_TAGGING_LAUNCH_LABEL}`,
    raw: (m) => m.dialer.conversationToBookingRate ?? 0,
    format: (m) =>
      m.dialer.conversationToBookingRate === null
        ? "—"
        : `${m.dialer.conversationToBookingRate}%`,
  },
  {
    id: "pickup_booking",
    label: "Pickup → Booking",
    category: "bookings",
    subgroup: "Conversion %",
    isPercent: true,
    raw: (m) => m.bookingsMade.pickUpsToBookingRate,
    format: (m) => `${m.bookingsMade.pickUpsToBookingRate}%`,
  },
  {
    id: "lead_booked",
    label: "Lead → Booked",
    category: "bookings",
    subgroup: "Conversion %",
    isPercent: true,
    raw: (m) => pct(m.bookingsMade.totalBookingsMade, m.dialer.uniqueLeadsDialed),
    format: (m) => `${pct(m.bookingsMade.totalBookingsMade, m.dialer.uniqueLeadsDialed)}%`,
  },
  { id: "showed", label: "Showed", category: "bookings", subgroup: "Post-Booking", raw: (m) => m.appointmentPerformance.setter.showed, format: (m) => String(m.appointmentPerformance.setter.showed) },
  { id: "no_shows", label: "No-Shows", category: "bookings", subgroup: "Post-Booking", raw: (m) => m.appointmentPerformance.setter.noShows, format: (m) => String(m.appointmentPerformance.setter.noShows) },
  { id: "closed", label: "Closed", category: "bookings", subgroup: "Post-Booking", raw: (m) => m.appointmentPerformance.setter.showedClosed, format: (m) => String(m.appointmentPerformance.setter.showedClosed) },
  { id: "show_up_rate", label: "Show-Up Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, raw: (m) => m.appointmentPerformance.setter.showUpRate, format: (m) => `${m.appointmentPerformance.setter.showUpRate}%` },
  { id: "close_rate", label: "Close Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "closed / showed", raw: (m) => m.appointmentPerformance.setter.closeRate, format: (m) => `${m.appointmentPerformance.setter.closeRate}%` },
  { id: "cash_collected", label: "Cash Collected", category: "bookings", subgroup: "Revenue", raw: (m) => m.appointmentPerformance.setter.cashCollected, format: (m) => `$${m.appointmentPerformance.setter.cashCollected.toLocaleString()}` },
  { id: "avg_deal_value", label: "Avg Deal Value", category: "bookings", subgroup: "Revenue", raw: (m) => m.appointmentPerformance.setter.averageDealValue, format: (m) => `$${m.appointmentPerformance.setter.averageDealValue.toLocaleString()}` },
];

export const STAT_CATALOG_BY_ID = new Map<string, StatDefinition>(
  STAT_CATALOG.map((stat) => [stat.id, stat]),
);

export function groupStatsByCategory(): Record<StatCategory, StatDefinition[]> {
  const out: Record<StatCategory, StatDefinition[]> = {
    activity: [],
    conversations: [],
    outcomes: [],
    bookings: [],
  };
  for (const stat of STAT_CATALOG) {
    out[stat.category].push(stat);
  }
  return out;
}

/** Group a list of stats by their optional `subgroup` field, preserving order. */
export function groupStatsBySubgroup(stats: StatDefinition[]): { name: string; items: StatDefinition[] }[] {
  const order: string[] = [];
  const map = new Map<string, StatDefinition[]>();
  for (const stat of stats) {
    const key = stat.subgroup ?? "";
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(stat);
  }
  return order.map((name) => ({ name, items: map.get(name)! }));
}

export function computeDelta(stat: StatDefinition, current: ReportMetrics, previous?: ReportMetrics) {
  if (!previous) return null;
  const cur = stat.raw(current);
  const prev = stat.raw(previous);
  if (stat.isPercent) {
    return { absolute: cur - prev, isPercentagePoint: true };
  }
  if (prev === 0) {
    return cur > 0 ? { absolute: cur, percent: null as number | null } : null;
  }
  return { absolute: cur - prev, percent: Math.round(((cur - prev) / Math.abs(prev)) * 100) };
}