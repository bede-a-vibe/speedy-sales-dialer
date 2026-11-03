import { getReportMetrics, type ReportBookingItem, type ReportCallLog } from "@/lib/reportMetrics";

/** Same local-day key as reportMetrics' toDateKey. */
function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * One ReportMetrics per day, each computed over only the rows that can count
 * on that day: logs by created_at, bookings by created_at (bookings made) and
 * scheduled_for (appointment performance). getReportMetrics still applies its
 * own date filter, so a booking listed under both of its days is never double
 * counted.
 */
export function dailyReportMetrics(
  days: string[],
  callLogs: ReportCallLog[],
  bookedItems: ReportBookingItem[],
  repUserId?: string,
) {
  const logsByDay = new Map<string, ReportCallLog[]>();
  for (const log of callLogs) {
    const k = dayKey(log.created_at);
    if (!k) continue;
    (logsByDay.get(k) ?? logsByDay.set(k, []).get(k)!).push(log);
  }
  const bookingsByDay = new Map<string, ReportBookingItem[]>();
  for (const item of bookedItems) {
    const keys = new Set([dayKey(item.created_at), dayKey(item.scheduled_for)]);
    for (const k of keys) {
      if (!k) continue;
      (bookingsByDay.get(k) ?? bookingsByDay.set(k, []).get(k)!).push(item);
    }
  }
  return days.map((day) =>
    getReportMetrics({
      callLogs: logsByDay.get(day) ?? [],
      bookedItems: bookingsByDay.get(day) ?? [],
      from: day,
      to: day,
      repUserId,
    }),
  );
}
