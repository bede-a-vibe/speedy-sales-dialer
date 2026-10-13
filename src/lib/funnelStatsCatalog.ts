import type { ReportMetrics } from "@/lib/reportMetrics";
import { formatDurationSeconds } from "@/lib/duration";
import { CONVERSATION_TAGGING_LAUNCH_LABEL } from "@/data/constants";

export type StatCategory = "activity" | "conversations" | "outcomes" | "bookings" | "closing";

/** The two sides of the job. Setting ends when the booked meeting resolves; closing starts when the closer pitches. */
export type StatSide = "setting" | "closing";
export const SIDE_ORDER: StatSide[] = ["setting", "closing"];
export const SIDE_LABEL: Record<StatSide, string> = { setting: "Setting", closing: "Closing" };
export const STAT_SIDE: Record<StatCategory, StatSide> = {
  activity: "setting",
  conversations: "setting",
  outcomes: "setting",
  bookings: "setting",
  closing: "closing",
};

export const STAT_CATEGORY_LABEL: Record<StatCategory, string> = {
  activity: "Activity",
  conversations: "Conversations",
  outcomes: "Outcomes",
  bookings: "Bookings",
  closing: "Closing",
};

export const STAT_CATEGORY_DESCRIPTION: Record<StatCategory, string> = {
  activity: "Dials, leads, talk time",
  conversations: "Pickups, conversations & quality",
  outcomes: "Disposition results",
  bookings: "Booked, qualified & showed",
  closing: "Pitched, verbal, closed & revenue",
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
  /** Plain-English rule for the glossary. Filled from METRIC_FORMULAS below. */
  formula?: string;
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
  { id: "call_commitments", label: "Call Commitments", category: "conversations", subgroup: "Volume", subtext: "reached the commitment stage", raw: (m) => m.dialer.commitments, format: (m) => String(m.dialer.commitments) },
  { id: "call_commitment_rate", label: "Call Commitment Rate", category: "conversations", subgroup: "Conversion %", isPercent: true, subtext: "commitments / conversations", raw: (m) => m.dialer.commitmentRate, format: (m) => `${m.dialer.commitmentRate}%` },
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
  { id: "showed", label: "Showed", category: "bookings", subgroup: "Post-Booking", subtext: "sittings; a lead that met twice counts twice", raw: (m) => m.appointmentPerformance.setter.showed, format: (m) => String(m.appointmentPerformance.setter.showed) },
  { id: "unique_leads_showed", label: "Unique Leads Showed", category: "bookings", subgroup: "Post-Booking", subtext: "distinct businesses that showed", raw: (m) => m.appointmentPerformance.setter.uniqueLeadsShowed, format: (m) => String(m.appointmentPerformance.setter.uniqueLeadsShowed) },
  { id: "first_meeting_show_up_rate", label: "First-Meeting Show-Up Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "first slot with a lead", raw: (m) => m.appointmentPerformance.setter.firstMeetingShowUpRate, format: (m) => `${m.appointmentPerformance.setter.firstMeetingShowUpRate}%` },
  { id: "follow_up_sat", label: "Second Meetings", category: "bookings", subgroup: "Post-Booking", subtext: "resolved slots after the lead already showed once", raw: (m) => m.appointmentPerformance.setter.followUpSat, format: (m) => String(m.appointmentPerformance.setter.followUpSat) },
  { id: "follow_up_show_up_rate", label: "Second-Meeting Show-Up Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "follow-up slots only", raw: (m) => m.appointmentPerformance.setter.followUpShowUpRate, format: (m) => `${m.appointmentPerformance.setter.followUpShowUpRate}%` },
  { id: "no_shows", label: "No-Shows", category: "bookings", subgroup: "Post-Booking", raw: (m) => m.appointmentPerformance.setter.noShows, format: (m) => String(m.appointmentPerformance.setter.noShows) },
  { id: "closed", label: "Closed", category: "bookings", subgroup: "Post-Booking", raw: (m) => m.appointmentPerformance.setter.showedClosed, format: (m) => String(m.appointmentPerformance.setter.showedClosed) },
  { id: "cancelled", label: "Cancelled", category: "bookings", subgroup: "Post-Booking", raw: (m) => m.appointmentPerformance.setter.cancelled, format: (m) => String(m.appointmentPerformance.setter.cancelled) },
  { id: "show_up_rate", label: "Show-Up Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "showed / (showed + no-shows + cancelled + rescheduled)", raw: (m) => m.appointmentPerformance.setter.showUpRate, format: (m) => `${m.appointmentPerformance.setter.showUpRate}%` },
  { id: "pitched", label: "Pitched", category: "bookings", subgroup: "Post-Booking", subtext: "close or no-close recorded", raw: (m) => m.appointmentPerformance.setter.pitched, format: (m) => String(m.appointmentPerformance.setter.pitched) },
  { id: "close_rate", label: "Close Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "closed / pitched, not-qualified excluded", raw: (m) => m.appointmentPerformance.setter.closeRate, format: (m) => `${m.appointmentPerformance.setter.closeRate}%` },
  { id: "shown_to_close", label: "Shown → Close", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "closed / all showed", raw: (m) => m.appointmentPerformance.setter.showToCloseRate, format: (m) => `${m.appointmentPerformance.setter.showToCloseRate}%` },
  { id: "no_show_rate", label: "No-Show Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "ghosted / resolved slots", raw: (m) => m.appointmentPerformance.setter.noShowRate, format: (m) => `${m.appointmentPerformance.setter.noShowRate}%` },
  { id: "rescheduled", label: "Rescheduled", category: "bookings", subgroup: "Post-Booking", subtext: "slots that were moved", raw: (m) => m.appointmentPerformance.setter.rescheduled, format: (m) => String(m.appointmentPerformance.setter.rescheduled) },
  { id: "reschedule_rate", label: "Reschedule Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "moved / resolved slots", raw: (m) => m.appointmentPerformance.setter.rescheduleRate, format: (m) => `${m.appointmentPerformance.setter.rescheduleRate}%` },
  { id: "cancellation_rate", label: "Cancellation Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "cancelled / resolved slots", raw: (m) => m.appointmentPerformance.setter.cancellationRate, format: (m) => `${m.appointmentPerformance.setter.cancellationRate}%` },
  { id: "first_time_show_up_rate", label: "Show-Up Rate (never moved)", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "slots never rescheduled", raw: (m) => m.appointmentPerformance.setter.firstTimeShowUpRate, format: (m) => `${m.appointmentPerformance.setter.firstTimeShowUpRate}%` },
  { id: "rescheduled_sittings", label: "Rescheduled Slots Resolved", category: "bookings", subgroup: "Post-Booking", subtext: "moved at least once, then resolved", raw: (m) => m.appointmentPerformance.setter.rescheduledSittings, format: (m) => String(m.appointmentPerformance.setter.rescheduledSittings) },
  { id: "rescheduled_show_up_rate", label: "Show-Up Rate (rescheduled)", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "slots moved at least once", raw: (m) => m.appointmentPerformance.setter.rescheduledShowUpRate, format: (m) => `${m.appointmentPerformance.setter.rescheduledShowUpRate}%` },
  { id: "multi_reschedule_show_up_rate", label: "Show-Up Rate (moved 2+)", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "slots moved two or more times", raw: (m) => m.appointmentPerformance.setter.multiRescheduleShowUpRate, format: (m) => `${m.appointmentPerformance.setter.multiRescheduleShowUpRate}%` },
  { id: "verbal_commitments", label: "Verbal Commitments", category: "bookings", subgroup: "Post-Booking", raw: (m) => m.appointmentPerformance.setter.verbalCommitments, format: (m) => String(m.appointmentPerformance.setter.verbalCommitments) },
  { id: "verbal_rate", label: "Verbal Commitment Rate", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "verbal / pitched", raw: (m) => m.appointmentPerformance.setter.verbalRateOfPitched, format: (m) => `${m.appointmentPerformance.setter.verbalRateOfPitched}%` },
  { id: "verbal_to_close", label: "Verbal → Closed", category: "bookings", subgroup: "Post-Booking", isPercent: true, subtext: "verbal leads that closed", raw: (m) => m.appointmentPerformance.setter.verbalToCloseRate, format: (m) => `${m.appointmentPerformance.setter.verbalToCloseRate}%` },

  // ===== Qualification (the setter's verdict on each booking; unjudged = unknown, not unqualified) =====
  { id: "qualified_bookings", label: "Qualified Bookings", category: "bookings", subgroup: "Qualification", subtext: "marked qualified", raw: (m) => m.appointmentPerformance.setter.qualifiedBookings, format: (m) => String(m.appointmentPerformance.setter.qualifiedBookings) },
  { id: "disqualified_bookings", label: "Not Qualified", category: "bookings", subgroup: "Qualification", subtext: "marked not qualified", raw: (m) => m.appointmentPerformance.setter.disqualifiedBookings, format: (m) => String(m.appointmentPerformance.setter.disqualifiedBookings) },
  { id: "qualified_coverage", label: "Verdict Coverage", category: "bookings", subgroup: "Qualification", isPercent: true, subtext: "bookings with a verdict", raw: (m) => m.appointmentPerformance.setter.qualifiedCoverage, format: (m) => `${m.appointmentPerformance.setter.qualifiedCoverage}%` },
  { id: "qualified_rate", label: "Qualified Booking Rate", category: "bookings", subgroup: "Qualification", isPercent: true, subtext: "qualified / all bookings", raw: (m) => m.appointmentPerformance.setter.qualifiedRate, format: (m) => `${m.appointmentPerformance.setter.qualifiedRate}%` },
  { id: "qualified_showed", label: "Qualified Showed", category: "bookings", subgroup: "Qualification", raw: (m) => m.appointmentPerformance.setter.qualifiedShowed, format: (m) => String(m.appointmentPerformance.setter.qualifiedShowed) },
  { id: "showed_qualified_rate", label: "Qualified Show Rate", category: "bookings", subgroup: "Qualification", isPercent: true, subtext: "qualified shows / all shows", raw: (m) => m.appointmentPerformance.setter.showedQualifiedRate, format: (m) => `${m.appointmentPerformance.setter.showedQualifiedRate}%` },
  { id: "qualified_show_up_rate", label: "Show-Up Rate (qualified)", category: "bookings", subgroup: "Qualification", isPercent: true, subtext: "showed / resolved, qualified bookings only", raw: (m) => m.appointmentPerformance.setter.qualifiedShowUpRate, format: (m) => `${m.appointmentPerformance.setter.qualifiedShowUpRate}%` },
  { id: "unqualified_show_up_rate", label: "Show-Up Rate (not qualified)", category: "bookings", subgroup: "Qualification", isPercent: true, subtext: "showed / resolved, not-qualified bookings only", raw: (m) => m.appointmentPerformance.setter.unqualifiedShowUpRate, format: (m) => `${m.appointmentPerformance.setter.unqualifiedShowUpRate}%` },
  { id: "qualified_closed", label: "Qualified Closed", category: "bookings", subgroup: "Qualification", raw: (m) => m.appointmentPerformance.setter.qualifiedClosed, format: (m) => String(m.appointmentPerformance.setter.qualifiedClosed) },
  { id: "qualified_close_rate", label: "Qualified Lead Close Rate", category: "bookings", subgroup: "Qualification", isPercent: true, subtext: "closed / qualified pitched", raw: (m) => m.appointmentPerformance.setter.qualifiedCloseRate, format: (m) => `${m.appointmentPerformance.setter.qualifiedCloseRate}%` },
  { id: "qualified_booking_close_rate", label: "Qualified Booking → Close", category: "bookings", subgroup: "Qualification", isPercent: true, subtext: "closed / qualified bookings", raw: (m) => pct(m.appointmentPerformance.setter.qualifiedClosed, m.appointmentPerformance.setter.qualifiedBookings), format: (m) => `${pct(m.appointmentPerformance.setter.qualifiedClosed, m.appointmentPerformance.setter.qualifiedBookings)}%` },
  { id: "unqualified_close_rate", label: "Unqualified Close Rate", category: "bookings", subgroup: "Qualification", isPercent: true, subtext: "closed / not-qualified pitched", raw: (m) => m.appointmentPerformance.setter.unqualifiedCloseRate, format: (m) => `${m.appointmentPerformance.setter.unqualifiedCloseRate}%` },
  { id: "qualified_verbal", label: "Qualified Verbals", category: "bookings", subgroup: "Qualification", raw: (m) => m.appointmentPerformance.setter.qualifiedVerbal, format: (m) => String(m.appointmentPerformance.setter.qualifiedVerbal) },

  { id: "cash_collected", label: "One-Off Collected", category: "bookings", subgroup: "Revenue", subtext: "setup / one-off fees on closes", raw: (m) => m.appointmentPerformance.setter.cashCollected, format: (m) => `$${m.appointmentPerformance.setter.cashCollected.toLocaleString()}` },
  { id: "retainers_won", label: "Retainers Won", category: "bookings", subgroup: "Revenue", subtext: "monthly retainers on closes", raw: (m) => m.appointmentPerformance.setter.retainersWon, format: (m) => `$${m.appointmentPerformance.setter.retainersWon.toLocaleString()}` },
  { id: "closed_value", label: "First Collection", category: "bookings", subgroup: "Revenue", subtext: "one-off + first retainer month", raw: (m) => m.appointmentPerformance.setter.closedValue, format: (m) => `$${m.appointmentPerformance.setter.closedValue.toLocaleString()}` },
  { id: "avg_deal_value", label: "Avg Deal Value", category: "bookings", subgroup: "Revenue", subtext: "first collection per close", raw: (m) => m.appointmentPerformance.setter.averageDealValue, format: (m) => `$${m.appointmentPerformance.setter.averageDealValue.toLocaleString()}` },
  { id: "avg_retainer", label: "Avg Retainer", category: "bookings", subgroup: "Revenue", subtext: "monthly, per retainer close", raw: (m) => m.appointmentPerformance.setter.averageRetainer, format: (m) => `$${m.appointmentPerformance.setter.averageRetainer.toLocaleString()}` },
  { id: "avg_one_off", label: "Avg One-Off", category: "bookings", subgroup: "Revenue", subtext: "per one-off close", raw: (m) => m.appointmentPerformance.setter.averageOneOff, format: (m) => `$${m.appointmentPerformance.setter.averageOneOff.toLocaleString()}` },
];

/**
 * The metric glossary. One plain-English rule per stat, shown in the
 * Definitions dialog on the Custom Monitor and exported to docs/metrics-glossary.md.
 * Bede's rules (12 Oct 2026):
 *  - A booked slot resolves one of four ways: showed, no-show, cancelled, rescheduled.
 *  - Show-up rate = showed / every resolved slot scheduled for the day.
 *  - Close rate = closed / pitched, with meetings marked not qualified excluded.
 *  - Shown → Close = closed / all showed, qualified or not.
 *  - Unjudged qualification is unknown, never "not qualified".
 */
export const METRIC_FORMULAS: Record<string, string> = {
  dials: "Every call attempt logged in the dialer in the period, by date dialled.",
  unique_leads: "Distinct contacts dialled at least once in the period.",
  avg_attempts: "Dials ÷ unique leads dialled.",
  pickups: "Dials answered by a person: not interested, DNC, follow-up, booked, or a gatekeeper. Voicemail and no answer are not pickups.",
  pickup_rate: "Pick ups ÷ dials.",
  talk_time: "Sum of Dialpad talk time across the period's dials (total call duration when talk time is missing).",
  avg_talk_dial: "Talk time ÷ dials.",
  avg_talk_pickup: "Talk time ÷ pick ups.",
  conversations: "Dials where the rep tagged that the Connection stage was reached. Counted from the day stage tagging went live.",
  dial_pickup: "Pick ups ÷ dials.",
  pickup_conversation: "Conversations ÷ pick ups, both counted only from the day stage tagging went live.",
  immediate_hang_ups: "Dials where the connection exit reason is 'hung up immediately'.",
  short_hangups_15s: "Pick ups that ended in under 15 seconds.",
  short_hangups_2m: "Pick ups that ended in under 2 minutes.",
  long_dq: "Calls over 30 minutes that ended not interested, DNC or disqualified.",
  no_answer: "Dials logged as no answer.",
  voicemail: "Dials logged as voicemail (no message left; next number).",
  not_interested: "Dials logged as not interested.",
  dnc: "Dials logged as do not call.",
  follow_ups: "Dials logged as follow-up (call back later).",
  bookings_made: "Bookings created in the period, by the date the rep booked them, not the meeting date. Includes cold-call meetings that only exist in the GHL calendar.",
  same_next_day_rate: "Bookings whose meeting is the same or next day ÷ bookings made.",
  conversation_booking: "Bookings made ÷ conversations, both since stage tagging went live.",
  pickup_booking: "Bookings made ÷ pick ups.",
  lead_booked: "Bookings made ÷ unique leads dialled.",
  showed: "Meetings scheduled in the period that showed: closed, no close, verbal, second meeting booked, or no-close follow-up. Counts sittings; a lead that met twice counts twice.",
  unique_leads_showed: "Distinct businesses with at least one showed meeting in the period.",
  first_meeting_show_up_rate: "Show-up rate on slots where the lead had not showed at an earlier meeting.",
  follow_up_sat: "Resolved slots where the lead had already showed at an earlier meeting (a second meeting; a reschedule is not).",
  follow_up_show_up_rate: "Showed ÷ resolved slots, second meetings only.",
  no_shows: "Meetings logged as no-show (ghosted).",
  closed: "Meetings logged as showed and closed.",
  cancelled: "Meetings cancelled or disqualified before they sat, plus bookings cancelled by status.",
  show_up_rate: "Showed ÷ every slot scheduled for the day that resolved (showed + no-shows + cancelled + rescheduled). Pending and upcoming slots are excluded.",
  no_show_rate: "No-shows ÷ resolved slots. With cancellation and reschedule rate, the four buckets add to 100%.",
  rescheduled: "Slots that were moved to another time (the old slot).",
  reschedule_rate: "Rescheduled ÷ resolved slots.",
  cancellation_rate: "Cancelled ÷ resolved slots.",
  first_time_show_up_rate: "Show-up rate on slots that were never moved.",
  rescheduled_sittings: "Resolved slots that had been moved at least once before they resolved.",
  rescheduled_show_up_rate: "Show-up rate on slots moved at least once.",
  multi_reschedule_show_up_rate: "Show-up rate on slots moved two or more times.",
  pitched: "Meetings where a close decision was recorded: closed, no close, verbal commitment, or no-close follow-up. First or second meeting. 'Second meeting booked' is discovery only and is not a pitch.",
  close_rate: "Closed ÷ pitched, with meetings marked not qualified removed from the denominator. Unjudged meetings stay in.",
  shown_to_close: "Closed ÷ all showed meetings, qualified or not. 20 showed, 10 qualified, 10 closed = 50% here and 100% close rate.",
  verbal_commitments: "Meetings logged as showed with a verbal commitment.",
  verbal_rate: "Verbal commitments ÷ pitched. The closing-side commitment rate.",
  verbal_to_close: "Leads that gave a verbal and then closed ÷ leads that gave a verbal (within the window).",
  call_commitments: "Dials where the prospect committed on the call: tagged at the Commitment stage, or booked (a booking counts even if the stage was not ticked). Since stage tagging went live.",
  call_commitment_rate: "Call commitments ÷ conversations. The setting-side commitment rate.",
  qualified_bookings: "Bookings marked qualified by the setter or closer.",
  disqualified_bookings: "Bookings marked not qualified.",
  qualified_coverage: "Bookings with a qualified verdict ÷ all bookings. Shows how much of the sample has been judged.",
  qualified_rate: "Bookings marked qualified ÷ all bookings. A booking with no verdict counts as not qualified here, so mark them.",
  qualified_showed: "Showed meetings marked qualified.",
  showed_qualified_rate: "Showed meetings marked qualified ÷ all showed meetings. 13 qualified of 26 shows = 50%. Unjudged shows count as not qualified here.",
  qualified_show_up_rate: "Show-up rate on bookings marked qualified.",
  unqualified_show_up_rate: "Show-up rate on bookings marked not qualified.",
  qualified_closed: "Closed meetings marked qualified.",
  qualified_close_rate: "Closed ÷ pitched, bookings marked qualified only.",
  qualified_booking_close_rate: "Closed ÷ all bookings marked qualified, whether or not they sat.",
  unqualified_close_rate: "Closed ÷ pitched, bookings marked not qualified only.",
  qualified_verbal: "Verbal commitments on bookings marked qualified.",
  cash_collected: "Sum of one-off / setup fees on closed meetings.",
  retainers_won: "Sum of monthly retainers on closed meetings.",
  closed_value: "First collection: one-off fee plus first retainer month, summed over closed meetings.",
  avg_deal_value: "First collection ÷ closed meetings. A $4k retainer with no setup fee is a $4k deal.",
  avg_retainer: "Retainers won ÷ closes that include a retainer. A one-off-only close does not count.",
  avg_one_off: "One-off fees ÷ closes that include a one-off fee. A retainer-only close does not count.",
};
for (const stat of STAT_CATALOG) stat.formula = METRIC_FORMULAS[stat.id];

/** Closing side: everything from the pitch onward. Setting keeps booked → showed. */
const CLOSING_SUBGROUP: Record<string, string> = {
  pitched: "Pitch & close", close_rate: "Pitch & close", shown_to_close: "Pitch & close", closed: "Pitch & close",
  verbal_commitments: "Verbal", verbal_rate: "Verbal", verbal_to_close: "Verbal", qualified_verbal: "Verbal",
  follow_up_sat: "Second meetings", follow_up_show_up_rate: "Second meetings",
  qualified_closed: "Qualified", qualified_close_rate: "Qualified", qualified_booking_close_rate: "Qualified", unqualified_close_rate: "Qualified",
  cash_collected: "Revenue", retainers_won: "Revenue", closed_value: "Revenue", avg_deal_value: "Revenue", avg_retainer: "Revenue", avg_one_off: "Revenue",
};
for (const stat of STAT_CATALOG) {
  const sub = CLOSING_SUBGROUP[stat.id];
  if (sub) {
    stat.category = "closing";
    stat.subgroup = sub;
  }
}

export const STAT_CATALOG_BY_ID = new Map<string, StatDefinition>(
  STAT_CATALOG.map((stat) => [stat.id, stat]),
);

export function groupStatsByCategory(): Record<StatCategory, StatDefinition[]> {
  const out: Record<StatCategory, StatDefinition[]> = {
    activity: [],
    conversations: [],
    outcomes: [],
    bookings: [],
    closing: [],
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