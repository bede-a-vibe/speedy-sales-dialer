import { addDays, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

/**
 * One date window for the Dashboard's week and month cards (My goals' week,
 * My numbers' this month), loaded once and sliced by each card. Before, each
 * card loaded its own call logs, bookings and reschedules, every one of them
 * with its own follow-up lookups (19 Nov). A day of padding each side keeps
 * cards that work out "today" slightly differently inside it.
 */
export function dashboardWindow(now: Date = new Date()): { from: string; to: string } {
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const from = monthStart < weekStart ? monthStart : weekStart;
  const to = weekEnd > now ? weekEnd : now;
  return { from: format(addDays(from, -1), "yyyy-MM-dd"), to: format(addDays(to, 1), "yyyy-MM-dd") };
}
