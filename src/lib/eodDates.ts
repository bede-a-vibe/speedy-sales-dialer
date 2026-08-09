/**
 * Date helpers for the End of Day report. The report day is a Melbourne
 * calendar day — a rep finishing at 6pm and a manager reviewing at 9pm must
 * agree on which day "today" is, regardless of the browser's timezone.
 *
 * Extracted from EodReportPage so the dashboard entry-point card resolves the
 * exact same report date as the report page itself.
 */

export const MELBOURNE_TZ = "Australia/Melbourne";

/** Today's calendar date in Melbourne as YYYY-MM-DD. */
export function melbourneTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MELBOURNE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Shifts a YYYY-MM-DD date by whole days, staying on calendar dates. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "Saturday, 9 August 2026" from a YYYY-MM-DD date. */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "5:42 pm" from an ISO timestamp, in the rep's local clock. */
export function formatSubmittedTime(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
}
