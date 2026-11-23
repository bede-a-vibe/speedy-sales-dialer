import { ANSWERED_OUTCOMES, getReportMetrics, type ReportBookingItem, type ReportCallLog } from "@/lib/reportMetrics";

const DAY = 86_400_000;

export interface CoachRow { user_id: string; stage: string | null; pillars: Record<string, number | null> | null; created_at: string }
export interface RoundRow { user_id: string; mode: string; passed: boolean | null; created_at: string }
export interface WindowStats { dials: number; pickups: number; conv2: number; bookings: number }

export function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((100 * n) / d) : null;
}

/** Dials, pickups, 2-minute conversations and bookings for one rep (null = the team) in [fromMs, toMs). */
export function statsFor(logs: ReportCallLog[], userId: string | null, fromMs: number, toMs: number): WindowStats {
  const s: WindowStats = { dials: 0, pickups: 0, conv2: 0, bookings: 0 };
  for (const l of logs) {
    if (userId && l.user_id !== userId) continue;
    const t = Date.parse(l.created_at);
    if (t < fromMs || t >= toMs) continue;
    s.dials += 1;
    if (ANSWERED_OUTCOMES.has(l.outcome)) s.pickups += 1;
    // Real talk time only: total duration counts ringing.
    if ((l.dialpad_talk_time_seconds ?? 0) >= 120) s.conv2 += 1;
    if (l.outcome === "booked") s.bookings += 1;
  }
  return s;
}

/** Show rate on the first meetings this rep set, on the one attendance rule Insights uses. */
export function setterShowRate(bookings: ReportBookingItem[], slots: ReportBookingItem[], userId: string, from: string, to: string) {
  const m = getReportMetrics({ callLogs: [], bookedItems: bookings, rescheduleSlots: slots, from, to, repUserId: userId }).appointmentPerformance.setter;
  return { showed: m.firstMeetingShowed, resolved: m.firstMeetingSat, rate: pct(m.firstMeetingShowed, m.firstMeetingSat) };
}
