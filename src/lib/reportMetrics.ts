import type { Tables } from "@/integrations/supabase/types";

export type ReportCallLog = Pick<
  Tables<"call_logs">,
  "id" | "contact_id" | "outcome" | "created_at" | "user_id" | "dialpad_talk_time_seconds" | "dialpad_total_duration_seconds"
>;
export type ReportBookingItem = Pick<
  Tables<"pipeline_items">,
  "id" | "contact_id" | "created_at" | "created_by" | "assigned_user_id" | "scheduled_for" | "status" | "appointment_outcome" | "deal_value" | "reschedule_count"
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

export interface ReportMetrics {
  dialer: {
    dials: number;
    uniqueLeadsDialed: number;
    pickUps: number;
    pickUpRate: number;
    callBacks: number;
    pickUpToFollowUpRate: number;
    totalTalkTimeSeconds: number;
    averageTalkTimePerDialSeconds: number;
    averageTalkTimePerPickupSeconds: number;
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
}

function toDateKey(value: string) {
  return value.slice(0, 10);
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

  for (const item of items) {
    if (item.appointment_outcome) {
      appointmentOutcomeCounts[item.appointment_outcome] += 1;
    }
  }

  const resolvedAppointments = items.filter((item) => !!item.appointment_outcome).length;
  const showed = appointmentOutcomeCounts.showed_closed + appointmentOutcomeCounts.showed_no_close + appointmentOutcomeCounts.showed_verbal_commitment;

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
      resolvedAppointments,
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
}: {
  callLogs: ReportCallLog[];
  bookedItems: ReportBookingItem[];
  from?: string;
  to?: string;
  repUserId?: string;
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

  const repIds = Array.from(
    new Set(
      [...bookedItems.flatMap((item) => [item.created_by, item.assigned_user_id]), ...callLogs.map((log) => log.user_id)].filter(Boolean),
    ),
  );

  const repComparison = repIds
    .map((repId) => {
      const setterItems = bookedItems.filter(
        (item) => item.created_by === repId && isInDateRange(item.scheduled_for, from, to),
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

  return {
    dialer: {
      dials: filteredCallLogs.length,
      uniqueLeadsDialed: new Set(filteredCallLogs.map((log) => log.contact_id)).size,
      pickUps,
      pickUpRate: toPercent(pickUps, filteredCallLogs.length),
      callBacks,
      pickUpToFollowUpRate: toPercent(callBacks, pickUps),
      totalTalkTimeSeconds,
      averageTalkTimePerDialSeconds: filteredCallLogs.length > 0 ? Math.round(totalTalkTimeSeconds / filteredCallLogs.length) : 0,
      averageTalkTimePerPickupSeconds: pickUps > 0 ? Math.round(totalTalkTimeSeconds / pickUps) : 0,
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
  };
}
