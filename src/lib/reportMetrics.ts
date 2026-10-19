import type { Tables } from "@/integrations/supabase/types";
import { CONVERSATION_TAGGING_LAUNCH_DATE } from "@/data/constants";

export type ReportCallLog = Pick<
  Tables<"call_logs">,
  "id" | "contact_id" | "outcome" | "created_at" | "user_id" | "dialpad_talk_time_seconds" | "dialpad_total_duration_seconds" | "exit_reason_connection" | "reached_connection" | "reached_commitment"
>;
export type ReportBookingItem = Pick<
  Tables<"pipeline_items">,
  "id" | "contact_id" | "created_at" | "created_by" | "assigned_user_id" | "scheduled_for" | "status" | "appointment_outcome" | "deal_value" | "reschedule_count"
> & {
  monthly_recurring_value?: number | null;
  /** Setter's qualification verdict on the booking; null = not judged yet. */
  is_qualified?: boolean | null;
  stream?: "dialer" | "ghl";
  /** The contact already showed at an earlier booking: a second meeting, not a reschedule. */
  is_follow_up?: boolean;
  /** How the slot resolved, from public.resolve_meeting_bucket() in the database. */
  resolved_bucket?: string | null;
};

export type ReportContact = Pick<
  Tables<"contacts">,
  "id" | "call_attempt_count"
>;

export const ANSWERED_OUTCOMES = new Set<ReportCallLog["outcome"]>([
  "not_interested",
  "dnc",
  "follow_up",
  "booked",
  // A gatekeeper answering IS a pickup — it just isn't a conversation with
  // the decision maker (reached_connection stays false).
  "gatekeeper",
]);

type AppointmentOutcomeKey = NonNullable<ReportBookingItem["appointment_outcome"]>;
type OutcomeCounts = Record<Exclude<ReportCallLog["outcome"], "wrong_number">, number>;
export type AppointmentOutcomeCounts = Record<AppointmentOutcomeKey, number>;

export interface AppointmentPerformanceMetrics {
  appointmentsScheduled: number;
  noShows: number;
  rescheduled: number;
  showedClosed: number;
  showedNoClose: number;
  showedVerbalCommitment: number;
  secondMeetingsBooked: number;
  noCloseFollowUps: number;
  showed: number;
  showUpRate: number;
  /** Meetings where a pitch outcome was recorded: closed, no close, verbal, or no-close follow-up. First or second meeting. */
  pitched: number;
  /** Pitched meetings not marked unqualified (unjudged stays in). */
  qualifiedPitched: number;
  /** closed / pitched, with meetings marked not qualified excluded from the denominator. */
  closeRate: number;
  /** closed / all showed meetings, qualified or not. */
  showToCloseRate: number;
  verbalCommitmentRate: number;
  rescheduleRate: number;
  resolvedAppointments: number;
  pendingOutcome: number;
  /** One-off / setup fees across closes. */
  cashCollected: number;
  /** Monthly retainers (MRR) won across closes. */
  retainersWon: number;
  /** One-off fees plus first retainer month across closes — the first collection. */
  closedValue: number;
  /** First collection per close: retainer + one-off. */
  averageDealValue: number;
  /** Monthly retainer per close (closes with no retainer count as $0). */
  averageRetainer: number;
  /** One-off / setup fee per close (closes with no one-off count as $0). */
  averageOneOff: number;
  cancelled: number;
  verbalCommitments: number;
  /** verbal commitments / pitched — the closing-side commitment rate. */
  verbalRateOfPitched: number;
  /** Distinct leads that gave a verbal commitment in the window. */
  verbalLeads: number;
  /** Of those, leads that have a closed meeting. */
  verbalLeadsClosed: number;
  /** verbalLeadsClosed / verbalLeads */
  verbalToCloseRate: number;
  // ---- Resolution buckets. A booked slot ends one of four ways: showed,
  // no-show, cancelled or rescheduled. Show-up rate = showed / all four, and
  // the other three rates use the same denominator so they add up to 100%.
  // Pending and upcoming slots are not resolved and stay out. ----
  /** no-shows / resolved slots — the ghost rate. */
  noShowRate: number;
  /** cancelled / resolved slots */
  cancellationRate: number;
  /** Slots that sat after being moved at least once. */
  rescheduledSittings: number;
  /** Show-up rate on slots that had been rescheduled at least once. */
  rescheduledShowUpRate: number;
  /** Show-up rate on slots never rescheduled. */
  firstTimeShowUpRate: number;
  /** Show-up rate on slots rescheduled two or more times. */
  multiRescheduleShowUpRate: number;
  /** Show-up rate by how many times the slot was moved before it sat. */
  showUpByRescheduleCount: Array<{ reschedules: "0" | "1" | "2" | "3+"; sat: number; showed: number; noShows: number; showUpRate: number }>;
  // ---- Sittings vs leads. `showed` counts sittings; a lead that met twice counts twice. ----
  /** Distinct contacts with at least one show in the window. */
  uniqueLeadsShowed: number;
  /** Distinct contacts whose slot sat (showed or no-show). */
  uniqueLeadsSat: number;
  firstMeetingSat: number;
  firstMeetingShowed: number;
  firstMeetingShowUpRate: number;
  /** Sittings where the contact had already showed at an earlier booking. */
  followUpSat: number;
  followUpShowed: number;
  followUpShowUpRate: number;
  // ---- Qualification (from the setter's verdict on each booking) ----
  judgedBookings: number;
  qualifiedBookings: number;
  disqualifiedBookings: number;
  /** judged / all bookings — how much of the sample has a verdict. */
  qualifiedCoverage: number;
  /** qualified / all bookings. Unjudged bookings count as not qualified here. */
  qualifiedRate: number;
  qualifiedShowed: number;
  qualifiedNoShows: number;
  qualifiedClosed: number;
  qualifiedVerbal: number;
  /** qualified shows / all shows. Unjudged shows count as not qualified here. */
  showedQualifiedRate: number;
  qualifiedShowUpRate: number;
  /** closed / pitched among bookings marked qualified */
  qualifiedCloseRate: number;
  unqualifiedShowUpRate: number;
  /** closed / pitched among bookings marked not qualified */
  unqualifiedCloseRate: number;
}

export interface RepDialerMetrics {
  dials: number;
  pickUps: number;
  totalTalkTimeSeconds: number;
  averageTalkTimePerDialSeconds: number;
  averageTalkTimePerPickupSeconds: number;
}

export interface RepComparisonRow {
  repUserId: string;
  dialer: RepDialerMetrics;
  setter: AppointmentPerformanceMetrics;
  closer: AppointmentPerformanceMetrics;
}

export interface RepRedFlagRow {
  repUserId: string;
  dials: number;
  notInterestedRate: number;
  dncRate: number;
  shortHangupRate: number;
  immediateHangUpRate: number;
  immediateHangUps: number;
  flags: string[];
}

export interface OutboundDiagnosticMetrics {
  contactRate: number; // unique leads spoken to / unique leads attempted (%)
  uniqueDialRate: number; // unique leads dialed / total dials (%)
  averageAttemptsPerLead: number;
  uniqueLeadsSpokenTo: number;
  leadAgePenetration: { bucket: "P1" | "P2" | "P3" | "P4" | "P5+"; count: number; pct: number }[];
  totalLeadsInPenetration: number;
  shortHangupsUnder15s: number;
  shortHangupsUnder2m: number;
  longDqOver30m: number;
  immediateHangUps: number;
  immediateHangUpRate: number;
  repRedFlags: RepRedFlagRow[];
}

export interface ReportMetrics {
  dialer: {
    dials: number;
    uniqueLeadsDialed: number;
    pickUps: number;
    pickUpRate: number;
    callBacks: number;
    pickUpToFollowUpRate: number;
    conversations: number;
    /** Calls that reached the Commitment stage: tagged as such, or booked (a booking is a commitment). Since tagging launch. */
    commitments: number;
    /** commitments / conversations — the setting-side commitment rate. */
    commitmentRate: number;
    /** Pickups on/after the conversation-tagging launch date. Use as the
     *  denominator for Pickup → Conversation so it stays apples-to-apples
     *  with `conversations` (which is also clipped to launch). */
    pickUpsSinceLaunch: number;
    /**
     * Bookings made / Conversations.
     * `null` when the selected date range ends before the conversation-tagging
     * launch date (no eligible data) — UI should render "—".
     */
    conversationToBookingRate: number | null;
    /** True when the selected range starts before the tagging launch date,
     *  so the UI can show a "Since {date}" footnote on conversation-derived tiles. */
    conversationMetricsScoped: boolean;
    /** ISO date (YYYY-MM-DD) of when conversation-progress tagging went live. */
    conversationTaggingLaunchDate: string;
    totalTalkTimeSeconds: number;
    averageTalkTimePerDialSeconds: number;
    averageTalkTimePerPickupSeconds: number;
    immediateHangUps: number;
    immediateHangUpRate: number;
  };
  bookingsMade: {
    totalBookingsMade: number;
    rebooked: number;
    newBookings: number;
    pickUpsToBookingRate: number;
    sameDayNextDayBookings: number;
    sameDayNextDayRate: number;
  };
  sales: {
    closes: number;
    setupRevenue: number;
    monthlyRecurring: number;
    firstYearValue: number;
    dialToCloseRate: number;
    revenuePerDial: number;
    firstYearValuePerDial: number;
    avgDialsPerClose: number;
  };
  appointmentPerformance: {
    setter: AppointmentPerformanceMetrics;
    closer: AppointmentPerformanceMetrics;
  };
  repComparison: RepComparisonRow[];
  dailyVolume: Array<{ date: string; count: number }>;
  outcomeCounts: OutcomeCounts;
  appointmentOutcomeCounts: {
    setter: AppointmentOutcomeCounts;
    closer: AppointmentOutcomeCounts;
  };
  outboundDiagnostic: OutboundDiagnosticMetrics;
}

function toDateKey(value: string) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isInDateRange(value: string | null, from?: string, to?: string) {
  if (!value) return false;
  const dateKey = toDateKey(value);
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

function getWholeDayDifference(fromDateKey: string, toDateKey: string) {
  const fromTime = Date.parse(`${fromDateKey}T00:00:00Z`);
  const toTime = Date.parse(`${toDateKey}T00:00:00Z`);
  return Math.round((toTime - fromTime) / 86_400_000);
}

function toPercent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function createOutcomeCounts(): OutcomeCounts {
  return {
    no_answer: 0,
    voicemail: 0,
    not_interested: 0,
    dnc: 0,
    follow_up: 0,
    booked: 0,
    disqualified: 0,
    gatekeeper: 0,
  };
}

function createAppointmentOutcomeCounts(): AppointmentOutcomeCounts {
  return {
    no_show: 0,
    rescheduled: 0,
    showed_closed: 0,
    showed_no_close: 0,
    showed_verbal_commitment: 0,
    second_meeting_booked: 0,
    no_close_follow_up: 0,
    disqualified: 0,
    cancelled: 0,
  };
}

export function getTalkTimeSeconds(callLog: ReportCallLog) {
  if (typeof callLog.dialpad_talk_time_seconds === "number") {
    return Math.max(0, callLog.dialpad_talk_time_seconds);
  }

  if (typeof callLog.dialpad_total_duration_seconds === "number") {
    return Math.max(0, callLog.dialpad_total_duration_seconds);
  }

  return 0;
}

function isSameOrNextDayBooking(item: ReportBookingItem) {
  if (!item.scheduled_for) return false;
  const createdDate = toDateKey(item.created_at);
  const scheduledDate = toDateKey(item.scheduled_for);
  const dayDifference = getWholeDayDifference(createdDate, scheduledDate);
  return dayDifference === 0 || dayDifference === 1;
}

/** A close decision was recorded: the rep pitched. Discovery-only meetings (second meeting booked) are not pitches. */
export const PITCHED_OUTCOMES = new Set<AppointmentOutcomeKey>([
  "showed_closed",
  "showed_no_close",
  "showed_verbal_commitment",
  "no_close_follow_up",
]);

/** Did they turn up. Same single rule as every other surface. */
function isShowed(item: ReportBookingItem) {
  return bucketOf(item) === "showed";
}

export type SlotBucket = "showed" | "noshow" | "cancelled" | "rescheduled";

const SLOT_BUCKETS = new Set<SlotBucket>(["showed", "noshow", "cancelled", "rescheduled"]);

/**
 * How a booked slot resolved.
 *
 * This is NOT decided here. `resolved_bucket` comes from
 * public.resolve_meeting_bucket() in the database, which is the single rule:
 * showed / noshow / cancelled / rescheduled / upcoming / pending. The same
 * function backs v_meetings_unified, so the Sources page, the Meetings page,
 * get_rep_meeting_stats and everything built on getReportMetrics now answer
 * from one definition.
 *
 * It used to be re-derived here from appointment_outcome, and the copy drifted:
 * a disqualification counted as a sitting in this file and as a cancellation in
 * the view, so the same 97 meetings read 36 showed on one page and 33 on
 * another. If the rule needs to change, change the SQL function.
 *
 * Pending and upcoming slots are not resolved and return null, so they stay out
 * of every denominator.
 */
export function bucketOf(item: ReportBookingItem): SlotBucket | null {
  const bucket = item.resolved_bucket;
  return bucket && SLOT_BUCKETS.has(bucket as SlotBucket) ? (bucket as SlotBucket) : null;
}

/**
 * First collection on a close: the one-off / setup fee plus the first month of
 * the retainer. A $4k retainer with no setup fee is a $4k deal; a $2k setup
 * plus $2k retainer is also $4k.
 */
function firstCollection(item: ReportBookingItem) {
  return (item.deal_value ?? 0) + (item.monthly_recurring_value ?? 0);
}

function buildAppointmentPerformance(items: ReportBookingItem[]) {
  const appointmentOutcomeCounts = createAppointmentOutcomeCounts();

  let cashCollected = 0;
  let retainersWon = 0;
  let closedValue = 0;
  let retainerDeals = 0;
  let oneOffDeals = 0;

  for (const item of items) {
    if (item.appointment_outcome) {
      appointmentOutcomeCounts[item.appointment_outcome] += 1;
    }
    if (item.appointment_outcome === "showed_closed") {
      cashCollected += item.deal_value ?? 0;
      retainersWon += item.monthly_recurring_value ?? 0;
      if ((item.monthly_recurring_value ?? 0) > 0) retainerDeals += 1;
      if ((item.deal_value ?? 0) > 0) oneOffDeals += 1;
      closedValue += firstCollection(item);
    }
  }

  const resolvedAppointments = items.filter((item) => !!item.appointment_outcome).length;
  const pendingOutcome = items.filter(
    (item) => !item.appointment_outcome && item.status !== "canceled" && item.scheduled_for && new Date(item.scheduled_for) < new Date(),
  ).length;

  // ---- The four resolution buckets ----
  const resolved = items.filter((item) => bucketOf(item) !== null);
  const countBucket = (list: ReportBookingItem[], bucket: SlotBucket) => list.filter((item) => bucketOf(item) === bucket).length;
  const showUpOf = (list: ReportBookingItem[]) => toPercent(countBucket(list, "showed"), list.filter((item) => bucketOf(item) !== null).length);
  const showed = countBucket(items, "showed");
  const noShows = countBucket(items, "noshow");
  const cancelled = countBucket(items, "cancelled");
  const rescheduled = countBucket(items, "rescheduled");

  // ---- Qualification. Only bookings with a verdict count on either side;
  // an unjudged booking is unknown, not unqualified. ----
  const judged = items.filter((item) => item.is_qualified != null);
  const qualified = judged.filter((item) => item.is_qualified === true);
  const unqualified = judged.filter((item) => item.is_qualified === false);
  const qualifiedShowedItems = qualified.filter(isShowed);
  const qualifiedNoShows = countBucket(qualified, "noshow");
  const qualifiedClosed = qualified.filter((item) => item.appointment_outcome === "showed_closed").length;
  const unqualifiedClosed = unqualified.filter((item) => item.appointment_outcome === "showed_closed").length;
  const qualifiedVerbal = qualified.filter((item) => item.appointment_outcome === "showed_verbal_commitment").length;

  // ---- Pitched = a close decision was recorded on the meeting (first or
  // second). "Second meeting booked" is discovery only, so it is not a pitch.
  const pitchedItems = items.filter((item) => !!item.appointment_outcome && PITCHED_OUTCOMES.has(item.appointment_outcome));
  const qualifiedPitchedItems = pitchedItems.filter((item) => item.is_qualified !== false);
  const closedAmong = (list: ReportBookingItem[]) => list.filter((item) => item.appointment_outcome === "showed_closed").length;
  const verbalLeadIds = new Set(items.filter((item) => item.appointment_outcome === "showed_verbal_commitment").map((item) => item.contact_id));
  const closedLeadIds = new Set(items.filter((item) => item.appointment_outcome === "showed_closed").map((item) => item.contact_id));
  const verbalLeadsClosed = [...verbalLeadIds].filter((id) => closedLeadIds.has(id)).length;

  // ---- Reschedule history of the slots that resolved ----
  const rescheduleBucket = (item: ReportBookingItem): "0" | "1" | "2" | "3+" => {
    const n = item.reschedule_count ?? 0;
    return n <= 0 ? "0" : n === 1 ? "1" : n === 2 ? "2" : "3+";
  };
  const showUpByRescheduleCount = (["0", "1", "2", "3+"] as const).map((bucket) => {
    const slots = resolved.filter((item) => !item.is_follow_up && rescheduleBucket(item) === bucket);
    const showedCount = countBucket(slots, "showed");
    return {
      reschedules: bucket,
      sat: slots.length,
      showed: showedCount,
      noShows: countBucket(slots, "noshow"),
      showUpRate: toPercent(showedCount, slots.length),
    };
  });
  // ---- Setting-side show-up is measured on FIRST meetings only. A follow-up (the lead
  // already sat on an earlier day) is the closer's slot, not the setter's, and is reported as
  // Second-Meeting Show-Up Rate. KEO 19 Oct 2026 was a decision call, not a setting call. ----
  const firstMeetingResolved = resolved.filter((item) => !item.is_follow_up);
  const followUpResolved = resolved.filter((item) => !!item.is_follow_up);
  const rescheduledResolved = firstMeetingResolved.filter((item) => (item.reschedule_count ?? 0) > 0);
  const firstTimeResolved = firstMeetingResolved.filter((item) => (item.reschedule_count ?? 0) === 0);
  const multiRescheduledResolved = firstMeetingResolved.filter((item) => (item.reschedule_count ?? 0) >= 2);
  const uniqueLeadsShowed = new Set(items.filter(isShowed).map((item) => item.contact_id)).size;
  const uniqueLeadsSat = new Set(resolved.map((item) => item.contact_id)).size;

  return {
    metrics: {
      appointmentsScheduled: items.length,
      noShows,
      rescheduled,
      showedClosed: appointmentOutcomeCounts.showed_closed,
      showedNoClose: appointmentOutcomeCounts.showed_no_close,
      showedVerbalCommitment: appointmentOutcomeCounts.showed_verbal_commitment,
      secondMeetingsBooked: appointmentOutcomeCounts.second_meeting_booked,
      noCloseFollowUps: appointmentOutcomeCounts.no_close_follow_up,
      showed,
      showUpRate: showUpOf(firstMeetingResolved),
      pitched: pitchedItems.length,
      qualifiedPitched: qualifiedPitchedItems.length,
      closeRate: toPercent(closedAmong(qualifiedPitchedItems), qualifiedPitchedItems.length),
      showToCloseRate: toPercent(appointmentOutcomeCounts.showed_closed, showed),
      verbalCommitmentRate: toPercent(appointmentOutcomeCounts.showed_verbal_commitment, showed),
      rescheduleRate: toPercent(countBucket(firstMeetingResolved, "rescheduled"), firstMeetingResolved.length),
      resolvedAppointments,
      pendingOutcome,
      cashCollected,
      retainersWon,
      closedValue,
      averageDealValue: appointmentOutcomeCounts.showed_closed > 0 ? Math.round(closedValue / appointmentOutcomeCounts.showed_closed) : 0,
      // A one-off-only close must not drag the average retainer down (and vice versa):
      // each average is taken over the closes that actually include that component.
      averageRetainer: retainerDeals > 0 ? Math.round(retainersWon / retainerDeals) : 0,
      averageOneOff: oneOffDeals > 0 ? Math.round(cashCollected / oneOffDeals) : 0,
      cancelled,
      verbalCommitments: appointmentOutcomeCounts.showed_verbal_commitment,
      verbalRateOfPitched: toPercent(appointmentOutcomeCounts.showed_verbal_commitment, pitchedItems.length),
      verbalLeads: verbalLeadIds.size,
      verbalLeadsClosed,
      verbalToCloseRate: toPercent(verbalLeadsClosed, verbalLeadIds.size),
      noShowRate: toPercent(countBucket(firstMeetingResolved, "noshow"), firstMeetingResolved.length),
      cancellationRate: toPercent(countBucket(firstMeetingResolved, "cancelled"), firstMeetingResolved.length),
      rescheduledSittings: rescheduledResolved.length,
      rescheduledShowUpRate: showUpOf(rescheduledResolved),
      firstTimeShowUpRate: showUpOf(firstTimeResolved),
      multiRescheduleShowUpRate: showUpOf(multiRescheduledResolved),
      showUpByRescheduleCount,
      uniqueLeadsShowed,
      uniqueLeadsSat,
      firstMeetingSat: firstMeetingResolved.length,
      firstMeetingShowed: countBucket(firstMeetingResolved, "showed"),
      firstMeetingShowUpRate: showUpOf(firstMeetingResolved),
      followUpSat: followUpResolved.length,
      followUpShowed: countBucket(followUpResolved, "showed"),
      followUpShowUpRate: showUpOf(followUpResolved),
      judgedBookings: judged.length,
      qualifiedBookings: qualified.length,
      disqualifiedBookings: unqualified.length,
      qualifiedCoverage: toPercent(judged.length, items.length),
      qualifiedRate: toPercent(qualified.length, items.length),
      qualifiedShowed: qualifiedShowedItems.length,
      qualifiedNoShows,
      qualifiedClosed,
      qualifiedVerbal,
      showedQualifiedRate: toPercent(qualifiedShowedItems.length, showed),
      qualifiedShowUpRate: showUpOf(qualified),
      qualifiedCloseRate: toPercent(qualifiedClosed, pitchedItems.filter((item) => item.is_qualified === true).length),
      unqualifiedShowUpRate: showUpOf(unqualified),
      unqualifiedCloseRate: toPercent(unqualifiedClosed, pitchedItems.filter((item) => item.is_qualified === false).length),
    } satisfies AppointmentPerformanceMetrics,
    outcomeCounts: appointmentOutcomeCounts,
  };
}

export function getReportMetrics({
  callLogs,
  bookedItems,
  from,
  to,
  repUserId,
  contacts,
}: {
  callLogs: ReportCallLog[];
  bookedItems: ReportBookingItem[];
  from?: string;
  to?: string;
  repUserId?: string;
  contacts?: ReportContact[];
}): ReportMetrics {
  const filteredCallLogs = (repUserId ? callLogs.filter((log) => log.user_id === repUserId) : callLogs)
    .filter((log) => isInDateRange(log.created_at, from, to));
  const bookingsForCreatedView = repUserId
    ? bookedItems.filter((item) => item.created_by === repUserId)
    : bookedItems;
  const setterAppointments = repUserId
    ? bookedItems.filter((item) => item.created_by === repUserId)
    : bookedItems;
  const closerAppointments = repUserId
    ? bookedItems.filter((item) => item.assigned_user_id === repUserId)
    : bookedItems;

  const outcomeCounts = createOutcomeCounts();
  const dailyVolumeMap: Record<string, number> = {};

  for (const log of filteredCallLogs) {
    outcomeCounts[log.outcome] += 1;
    const dateKey = toDateKey(log.created_at);
    dailyVolumeMap[dateKey] = (dailyVolumeMap[dateKey] ?? 0) + 1;
  }

  const globallySortedBookings = [...bookedItems].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );

  const firstBookingIdByContact = new Map<string, string>();
  for (const item of globallySortedBookings) {
    if (!firstBookingIdByContact.has(item.contact_id)) {
      firstBookingIdByContact.set(item.contact_id, item.id);
    }
  }

  const bookingsMadeInRange = bookingsForCreatedView.filter((item) => isInDateRange(item.created_at, from, to));
  const setterAppointmentsInRange = setterAppointments.filter((item) => isInDateRange(item.scheduled_for, from, to));
  const closerAppointmentsInRange = closerAppointments.filter((item) => isInDateRange(item.scheduled_for, from, to));

  const totalTalkTimeSeconds = filteredCallLogs.reduce((total, log) => total + getTalkTimeSeconds(log), 0);
  const pickUps = filteredCallLogs.filter((log) => ANSWERED_OUTCOMES.has(log.outcome)).length;
  const callBacks = outcomeCounts.follow_up;

  // Conversations = calls where the rep reached at least the Connection stage.
  // This is the truest "talked to a human" metric for cold-calling skill analysis.
  // Clipped to on/after CONVERSATION_TAGGING_LAUNCH_DATE because the
  // reached_connection column defaults to false for older rows and would
  // otherwise pollute the denominator.
  const launchDate = CONVERSATION_TAGGING_LAUNCH_DATE;
  const conversations = filteredCallLogs.filter(
    (log) => log.reached_connection === true && toDateKey(log.created_at) >= launchDate,
  ).length;
  // A booked call is a commitment whether or not the rep ticked the stage
  // (reps under-tag: Ben had 8 ticks against 73 bookings), so booked floors it.
  const commitments = filteredCallLogs.filter(
    (log) => (log.reached_commitment === true || log.outcome === "booked") && toDateKey(log.created_at) >= launchDate,
  ).length;
  const pickUpsSinceLaunch = filteredCallLogs.filter(
    (log) => ANSWERED_OUTCOMES.has(log.outcome) && toDateKey(log.created_at) >= launchDate,
  ).length;
  // For the conversation→booking rate, scope BOTH sides to on/after launch
  // so we don't divide weeks of bookings by days of conversations.
  const bookingsForConversationRate = bookingsMadeInRange.filter(
    (item) => toDateKey(item.created_at) >= launchDate,
  );
  const rangeStartsBeforeLaunch = !from || from < launchDate;
  const rangeEndsBeforeLaunch = !!to && to < launchDate;
  const conversationToBookingRate: number | null = rangeEndsBeforeLaunch
    ? null
    : toPercent(bookingsForConversationRate.length, conversations);

  const repIds = Array.from(
    new Set(
      [...bookedItems.flatMap((item) => [item.created_by, item.assigned_user_id]), ...callLogs.map((log) => log.user_id)].filter(Boolean),
    ),
  );

  const repComparison = repIds
    .map((repId) => {
      // "Bookings" column reflects bookings the rep MADE in the date range
      // (created_at), not appointments scheduled to happen in the range.
      // This matches the headline "Bookings Made" KPI and reflects setter activity.
      const setterItems = bookedItems.filter(
        (item) => item.created_by === repId && isInDateRange(item.created_at, from, to),
      );
      const closerItems = bookedItems.filter(
        (item) => item.assigned_user_id === repId && isInDateRange(item.scheduled_for, from, to),
      );
      const repCallLogs = callLogs.filter((log) => log.user_id === repId && isInDateRange(log.created_at, from, to));
      const repPickUps = repCallLogs.filter((log) => ANSWERED_OUTCOMES.has(log.outcome)).length;
      const repTotalTalkTimeSeconds = repCallLogs.reduce((total, log) => total + getTalkTimeSeconds(log), 0);

      return {
        repUserId: repId,
        dialer: {
          dials: repCallLogs.length,
          pickUps: repPickUps,
          totalTalkTimeSeconds: repTotalTalkTimeSeconds,
          averageTalkTimePerDialSeconds: repCallLogs.length > 0 ? Math.round(repTotalTalkTimeSeconds / repCallLogs.length) : 0,
          averageTalkTimePerPickupSeconds: repPickUps > 0 ? Math.round(repTotalTalkTimeSeconds / repPickUps) : 0,
        },
        setter: buildAppointmentPerformance(setterItems).metrics,
        closer: buildAppointmentPerformance(closerItems).metrics,
      } satisfies RepComparisonRow;
    })
    .sort((a, b) => {
      const delta = b.dialer.totalTalkTimeSeconds - a.dialer.totalTalkTimeSeconds;
      if (delta !== 0) return delta;
      return b.setter.appointmentsScheduled - a.setter.appointmentsScheduled;
    });

  const totalBookingsMade = bookingsMadeInRange.length;
  const newBookings = bookingsMadeInRange.filter(
    (item) => firstBookingIdByContact.get(item.contact_id) === item.id,
  ).length;
  const rebooked = totalBookingsMade - newBookings;
  const sameDayNextDayBookings = bookingsMadeInRange.filter(isSameOrNextDayBooking).length;

  const setterPerformance = buildAppointmentPerformance(setterAppointmentsInRange);
  const closerPerformance = buildAppointmentPerformance(closerAppointmentsInRange);

  // ---- Outbound Diagnostic (SOP-aligned) ----
  const dialedContactIds = new Set(filteredCallLogs.map((log) => log.contact_id));
  const spokenContactIds = new Set(
    filteredCallLogs.filter((log) => ANSWERED_OUTCOMES.has(log.outcome)).map((log) => log.contact_id),
  );
  const uniqueDialed = dialedContactIds.size;
  const totalDials = filteredCallLogs.length;
  const uniqueSpoken = spokenContactIds.size;

  const contactRate = toPercent(uniqueSpoken, uniqueDialed);
  const uniqueDialRate = toPercent(uniqueDialed, totalDials);
  const averageAttemptsPerLead = uniqueDialed > 0 ? Math.round((totalDials / uniqueDialed) * 10) / 10 : 0;

  // Lead age penetration from contacts.call_attempt_count
  const buckets: Record<"P1" | "P2" | "P3" | "P4" | "P5+", number> = { P1: 0, P2: 0, P3: 0, P4: 0, "P5+": 0 };
  const contactPool = contacts ?? [];
  for (const c of contactPool) {
    const n = c.call_attempt_count ?? 0;
    if (n === 1) buckets.P1 += 1;
    else if (n === 2) buckets.P2 += 1;
    else if (n === 3) buckets.P3 += 1;
    else if (n === 4) buckets.P4 += 1;
    else if (n >= 5) buckets["P5+"] += 1;
  }
  const totalAttempted = buckets.P1 + buckets.P2 + buckets.P3 + buckets.P4 + buckets["P5+"];
  const leadAgePenetration = (Object.keys(buckets) as Array<keyof typeof buckets>).map((bucket) => ({
    bucket,
    count: buckets[bucket],
    pct: toPercent(buckets[bucket], totalAttempted),
  }));

  // Call duration diagnostics
  let shortHangupsUnder15s = 0;
  let shortHangupsUnder2m = 0;
  let longDqOver30m = 0;
  for (const log of filteredCallLogs) {
    if (!ANSWERED_OUTCOMES.has(log.outcome)) continue;
    const sec = getTalkTimeSeconds(log);
    if (sec > 0 && sec < 15) shortHangupsUnder15s += 1;
    if (sec > 0 && sec < 120) shortHangupsUnder2m += 1;
    if (sec > 1800 && (log.outcome === "not_interested" || log.outcome === "dnc")) longDqOver30m += 1;
  }

  // Per-rep red flags vs team baseline
  const allReps = Array.from(new Set(callLogs.map((l) => l.user_id).filter(Boolean)));
  const teamDials = callLogs.length;
  const teamNotInt = callLogs.filter((l) => l.outcome === "not_interested").length;
  const teamDnc = callLogs.filter((l) => l.outcome === "dnc").length;
  const teamShort = callLogs.filter((l) => ANSWERED_OUTCOMES.has(l.outcome) && getTalkTimeSeconds(l) > 0 && getTalkTimeSeconds(l) < 15).length;
  const teamNotIntRate = teamDials > 0 ? teamNotInt / teamDials : 0;
  const teamDncRate = teamDials > 0 ? teamDnc / teamDials : 0;
  const teamShortRate = teamDials > 0 ? teamShort / teamDials : 0;

  const repRedFlags: RepRedFlagRow[] = allReps
    .map((repId) => {
      const repLogs = callLogs.filter((l) => l.user_id === repId);
      const dials = repLogs.length;
      const ni = repLogs.filter((l) => l.outcome === "not_interested").length;
      const dn = repLogs.filter((l) => l.outcome === "dnc").length;
      const sh = repLogs.filter((l) => ANSWERED_OUTCOMES.has(l.outcome) && getTalkTimeSeconds(l) > 0 && getTalkTimeSeconds(l) < 15).length;
      const ih = repLogs.filter((l) => l.exit_reason_connection === "hung_up_immediately").length;
      const niRate = dials > 0 ? ni / dials : 0;
      const dnRate = dials > 0 ? dn / dials : 0;
      const shRate = dials > 0 ? sh / dials : 0;
      const ihRate = dials > 0 ? ih / dials : 0;
      const flags: string[] = [];
      if (dials >= 10 && niRate > teamNotIntRate * 1.5 && teamNotIntRate > 0) flags.push("High not-interested");
      if (dials >= 10 && dnRate > teamDncRate * 1.5 && teamDncRate > 0) flags.push("High DNC");
      if (dials >= 10 && shRate > teamShortRate * 1.5 && teamShortRate > 0) flags.push("Opener review");
      if (dials >= 20 && ihRate >= 0.15) flags.push("High immediate hang-ups");
      return {
        repUserId: repId,
        dials,
        notInterestedRate: Math.round(niRate * 100),
        dncRate: Math.round(dnRate * 100),
        shortHangupRate: Math.round(shRate * 100),
        immediateHangUpRate: Math.round(ihRate * 100),
        immediateHangUps: ih,
        flags,
      };
    })
    .sort((a, b) => b.flags.length - a.flags.length || b.dials - a.dials);

  const immediateHangUps = filteredCallLogs.filter((l) => l.exit_reason_connection === "hung_up_immediately").length;
  const immediateHangUpRate = toPercent(immediateHangUps, totalDials);

  // ---- Sales Efficiency (closed deals attributed to the rep who booked them) ----
  const closedDealsInRange = bookingsMadeInRange.filter(
    (item) => item.appointment_outcome === "showed_closed",
  );
  const setupRevenue = closedDealsInRange.reduce(
    (sum, item) => sum + (item.deal_value ?? 0),
    0,
  );
  const monthlyRecurring = closedDealsInRange.reduce(
    (sum, item) => sum + (item.monthly_recurring_value ?? 0),
    0,
  );
  const closes = closedDealsInRange.length;
  const firstYearValue = setupRevenue + monthlyRecurring * 12;
  const dialsCount = filteredCallLogs.length;
  const sales = {
    closes,
    setupRevenue,
    monthlyRecurring,
    firstYearValue,
    dialToCloseRate: toPercent(closes, dialsCount),
    revenuePerDial: dialsCount > 0 ? Math.round((setupRevenue / dialsCount) * 100) / 100 : 0,
    firstYearValuePerDial: dialsCount > 0 ? Math.round((firstYearValue / dialsCount) * 100) / 100 : 0,
    avgDialsPerClose: closes > 0 ? Math.round(dialsCount / closes) : 0,
  };

  const outboundDiagnostic: OutboundDiagnosticMetrics = {
    contactRate,
    uniqueDialRate,
    averageAttemptsPerLead,
    uniqueLeadsSpokenTo: uniqueSpoken,
    leadAgePenetration,
    totalLeadsInPenetration: totalAttempted,
    shortHangupsUnder15s,
    shortHangupsUnder2m,
    longDqOver30m,
    immediateHangUps,
    immediateHangUpRate,
    repRedFlags,
  };

  return {
    dialer: {
      dials: filteredCallLogs.length,
      uniqueLeadsDialed: new Set(filteredCallLogs.map((log) => log.contact_id)).size,
      pickUps,
      pickUpRate: toPercent(pickUps, filteredCallLogs.length),
      callBacks,
      pickUpToFollowUpRate: toPercent(callBacks, pickUps),
      conversations,
      commitments,
      commitmentRate: toPercent(commitments, conversations),
      pickUpsSinceLaunch,
      conversationToBookingRate,
      conversationMetricsScoped: rangeStartsBeforeLaunch,
      conversationTaggingLaunchDate: launchDate,
      totalTalkTimeSeconds,
      averageTalkTimePerDialSeconds: filteredCallLogs.length > 0 ? Math.round(totalTalkTimeSeconds / filteredCallLogs.length) : 0,
      averageTalkTimePerPickupSeconds: pickUps > 0 ? Math.round(totalTalkTimeSeconds / pickUps) : 0,
      immediateHangUps,
      immediateHangUpRate,
    },
    bookingsMade: {
      totalBookingsMade,
      rebooked,
      newBookings,
      pickUpsToBookingRate: toPercent(totalBookingsMade, pickUps),
      sameDayNextDayBookings,
      sameDayNextDayRate: toPercent(sameDayNextDayBookings, totalBookingsMade),
    },
    appointmentPerformance: {
      setter: setterPerformance.metrics,
      closer: closerPerformance.metrics,
    },
    repComparison,
    dailyVolume: Object.entries(dailyVolumeMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    outcomeCounts,
    appointmentOutcomeCounts: {
      setter: setterPerformance.outcomeCounts,
      closer: closerPerformance.outcomeCounts,
    },
    outboundDiagnostic,
    sales,
  };
}
