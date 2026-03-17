import type { Tables } from "@/integrations/supabase/types";

export type ReportCallLog = Pick<Tables<"call_logs">, "id" | "contact_id" | "outcome" | "created_at">;
export type ReportBookingItem = Pick<
  Tables<"pipeline_items">,
  "id" | "contact_id" | "created_at" | "scheduled_for" | "status" | "appointment_outcome"
>;

const ANSWERED_OUTCOMES = new Set<ReportCallLog["outcome"]>([
  "not_interested",
  "dnc",
  "follow_up",
  "booked",
  "wrong_number",
]);

const APPOINTMENT_OUTCOME_KEYS = ["no_show", "rescheduled", "showed_closed", "showed_no_close"] as const;

type AppointmentOutcomeKey = (typeof APPOINTMENT_OUTCOME_KEYS)[number];

type OutcomeCounts = Record<ReportCallLog["outcome"], number>;
type AppointmentOutcomeCounts = Record<AppointmentOutcomeKey, number>;

export interface ReportMetrics {
  dialer: {
    dials: number;
    uniqueLeadsDialed: number;
    pickUps: number;
    pickUpRate: number;
    callBacks: number;
    pickUpToFollowUpRate: number;
  };
  bookingsMade: {
    totalBookingsMade: number;
    rebooked: number;
    newBookings: number;
    pickUpsToBookingRate: number;
    sameDayNextDayBookings: number;
    sameDayNextDayRate: number;
  };
  appointmentsScheduled: {
    appointmentsScheduled: number;
    noShows: number;
    rescheduled: number;
    showedClosed: number;
    showedNoClose: number;
    appointmentCloseRate: number;
    resolvedAppointments: number;
  };
  dailyVolume: Array<{ date: string; count: number }>;
  outcomeCounts: OutcomeCounts;
  appointmentOutcomeCounts: AppointmentOutcomeCounts;
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
    wrong_number: 0,
  };
}

function createAppointmentOutcomeCounts(): AppointmentOutcomeCounts {
  return {
    no_show: 0,
    rescheduled: 0,
    showed_closed: 0,
    showed_no_close: 0,
  };
}

function isSameOrNextDayBooking(item: ReportBookingItem) {
  if (!item.scheduled_for) return false;
  const createdDate = toDateKey(item.created_at);
  const scheduledDate = toDateKey(item.scheduled_for);
  const dayDifference = getWholeDayDifference(createdDate, scheduledDate);
  return dayDifference === 0 || dayDifference === 1;
}

export function getReportMetrics({
  callLogs,
  bookedItems,
  from,
  to,
}: {
  callLogs: ReportCallLog[];
  bookedItems: ReportBookingItem[];
  from?: string;
  to?: string;
}): ReportMetrics {
  const outcomeCounts = createOutcomeCounts();
  const dailyVolumeMap: Record<string, number> = {};

  for (const log of callLogs) {
    outcomeCounts[log.outcome] += 1;
    const dateKey = toDateKey(log.created_at);
    dailyVolumeMap[dateKey] = (dailyVolumeMap[dateKey] ?? 0) + 1;
  }

  const sortedBookings = [...bookedItems].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );

  const firstBookingIdByContact = new Map<string, string>();
  for (const item of sortedBookings) {
    if (!firstBookingIdByContact.has(item.contact_id)) {
      firstBookingIdByContact.set(item.contact_id, item.id);
    }
  }

  const bookingsMadeInRange = sortedBookings.filter((item) => isInDateRange(item.created_at, from, to));
  const appointmentsScheduledInRange = sortedBookings.filter((item) => isInDateRange(item.scheduled_for, from, to));

  const pickUps = callLogs.filter((log) => ANSWERED_OUTCOMES.has(log.outcome)).length;
  const callBacks = outcomeCounts.follow_up;
  const totalBookingsMade = bookingsMadeInRange.length;
  const newBookings = bookingsMadeInRange.filter(
    (item) => firstBookingIdByContact.get(item.contact_id) === item.id,
  ).length;
  const rebooked = totalBookingsMade - newBookings;
  const sameDayNextDayBookings = bookingsMadeInRange.filter(isSameOrNextDayBooking).length;

  const appointmentOutcomeCounts = createAppointmentOutcomeCounts();
  for (const item of appointmentsScheduledInRange) {
    if (item.appointment_outcome) {
      appointmentOutcomeCounts[item.appointment_outcome] += 1;
    }
  }

  const resolvedAppointments = appointmentsScheduledInRange.filter(
    (item) => !!item.appointment_outcome,
  ).length;

  return {
    dialer: {
      dials: callLogs.length,
      uniqueLeadsDialed: new Set(callLogs.map((log) => log.contact_id)).size,
      pickUps,
      pickUpRate: toPercent(pickUps, callLogs.length),
      callBacks,
      pickUpToFollowUpRate: toPercent(callBacks, pickUps),
    },
    bookingsMade: {
      totalBookingsMade,
      rebooked,
      newBookings,
      pickUpsToBookingRate: toPercent(totalBookingsMade, pickUps),
      sameDayNextDayBookings,
      sameDayNextDayRate: toPercent(sameDayNextDayBookings, totalBookingsMade),
    },
    appointmentsScheduled: {
      appointmentsScheduled: appointmentsScheduledInRange.length,
      noShows: appointmentOutcomeCounts.no_show,
      rescheduled: appointmentOutcomeCounts.rescheduled,
      showedClosed: appointmentOutcomeCounts.showed_closed,
      showedNoClose: appointmentOutcomeCounts.showed_no_close,
      appointmentCloseRate: toPercent(appointmentOutcomeCounts.showed_closed, resolvedAppointments),
      resolvedAppointments,
    },
    dailyVolume: Object.entries(dailyVolumeMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count })),
    outcomeCounts,
    appointmentOutcomeCounts,
  };
}
