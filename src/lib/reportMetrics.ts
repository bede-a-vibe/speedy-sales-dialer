import type { Tables } from "@/integrations/supabase/types";
import { CONVERSATION_TAGGING_LAUNCH_DATE } from "@/data/constants";

export type ReportCallLog = Pick<
  Tables<"call_logs">,
  "id" | "contact_id" | "outcome" | "created_at" | "user_id" | "dialpad_talk_time_seconds" | "dialpad_total_duration_seconds" | "exit_reason_connection" | "reached_connection"
>;
export type ReportBookingItem = Pick<
  Tables<"pipeline_items">,
  "id" | "contact_id" | "created_at" | "created_by" | "assigned_user_id" | "scheduled_for" | "status" | "appointment_outcome" | "deal_value" | "reschedule_count"
>;

export type ReportContact = Pick<
  Tables<"contacts">,
  "id" | "call_attempt_count"
>;

export const ANSWERED_OUTCOMES = new Set<ReportCallLog["outcome"]>([
  "not_interested",
  "dnc",
  "follow_up",
  "booked",
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
  showed: number;
  showUpRate: number;
  closeRate: number;
  verbalCommitmentRate: number;
  rescheduleRate: number;
  resolvedAppointments: number;
  pendingOutcome: number;
  cashCollected: number;
  averageDealValue: number;
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
  };
}

function createAppointmentOutcomeCounts(): AppointmentOutcomeCounts {
  return {
    no_show: 0,
    rescheduled: 0,
    showed_closed: 0,
    showed_no_close: 0,
    showed_verbal_commitment: 0,
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

function buildAppointmentPerformance(items: ReportBookingItem[]) {
  const appointmentOutcomeCounts = createAppointmentOutcomeCounts();

  let cashCollected = 0;

  for (const item of items) {
    if (item.appointment_outcome) {
      appointmentOutcomeCounts[item.appointment_outcome] += 1;
    }
    if (item.appointment_outcome === "showed_closed" && item.deal_value != null) {
      cashCollected += item.deal_value;
    }
  }

  const resolvedAppointments = items.filter((item) => !!item.appointment_outcome).length;
  const showed = appointmentOutcomeCounts.showed_closed + appointmentOutcomeCounts.showed_no_close + appointmentOutcomeCounts.showed_verbal_commitment;
  const pendingOutcome = items.filter(
    (item) => !item.appointment_outcome && item.scheduled_for && new Date(item.scheduled_for) < new Date(),
  ).length;

  return {
    metrics: {
      appointmentsScheduled: items.length,
      noShows: appointmentOutcomeCounts.no_show,
      rescheduled: appointmentOutcomeCounts.rescheduled,
      showedClosed: appointmentOutcomeCounts.showed_closed,
      showedNoClose: appointmentOutcomeCounts.showed_no_close,
      showedVerbalCommitment: appointmentOutcomeCounts.showed_verbal_commitment,
      showed,
      showUpRate: toPercent(showed, items.length),
      closeRate: toPercent(appointmentOutcomeCounts.showed_closed, showed),
      verbalCommitmentRate: toPercent(appointmentOutcomeCounts.showed_verbal_commitment, showed),
      rescheduleRate: toPercent(appointmentOutcomeCounts.rescheduled, items.length),
      resolvedAppointments,
      pendingOutcome,
      cashCollected,
      averageDealValue: appointmentOutcomeCounts.showed_closed > 0 ? Math.round(cashCollected / appointmentOutcomeCounts.showed_closed) : 0,
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
  const filteredCallLogs = repUserId ? callLogs.filter((log) => log.user_id === repUserId) : callLogs;
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
  };
}
