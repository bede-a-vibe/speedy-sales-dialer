import { describe, it, expect } from "vitest";
import { getReportMetrics, type ReportBookingItem, type ReportCallLog } from "@/lib/reportMetrics";
import { dailyReportMetrics } from "@/lib/dailyReportMetrics";
import { STAT_CATALOG } from "@/lib/funnelStatsCatalog";

// Deterministic pseudo-random so the fixture is stable.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const DAYS = Array.from({ length: 31 }, (_, i) => {
  const d = new Date(2026, 9, 1 + i);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});
const REPS = ["rep-a", "rep-b", "rep-c"];
const CALL_OUTCOMES = ["no_answer", "voicemail", "not_interested", "dnc", "follow_up", "booked", "gatekeeper"] as const;
const APPT_OUTCOMES = [null, "no_show", "rescheduled", "showed_closed", "showed_no_close", "showed_verbal_commitment", "cancelled", "disqualified"] as const;

function fixture() {
  const r = rng(42);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  // Spread across the month plus a few days either side, at all hours.
  const at = () => new Date(2026, 8, 28 + Math.floor(r() * 38), Math.floor(r() * 24), Math.floor(r() * 60)).toISOString();
  const logs: ReportCallLog[] = Array.from({ length: 1500 }, (_, i) => {
    const outcome = pick(CALL_OUTCOMES);
    const talk = outcome === "no_answer" || outcome === "voicemail" ? 0 : Math.floor(r() * 2400);
    return {
      id: `log-${i}`,
      contact_id: `c-${Math.floor(r() * 400)}`,
      user_id: pick(REPS),
      outcome,
      created_at: at(),
      dialpad_talk_time_seconds: talk,
      dialpad_total_duration_seconds: talk + 20,
      exit_reason_connection: r() < 0.1 ? "hung_up_immediately" : null,
      reached_connection: r() < 0.4,
      reached_commitment: r() < 0.1,
    } as ReportCallLog;
  });
  const bookings: ReportBookingItem[] = Array.from({ length: 220 }, (_, i) => ({
    id: `b-${i}`,
    contact_id: `c-${Math.floor(r() * 400)}`,
    created_at: at(),
    created_by: pick(REPS),
    assigned_user_id: pick(REPS),
    scheduled_for: r() < 0.95 ? at() : null,
    status: "open",
    appointment_outcome: pick(APPT_OUTCOMES),
    deal_value: r() < 0.3 ? Math.floor(r() * 5000) : null,
    monthly_recurring_value: r() < 0.3 ? Math.floor(r() * 4000) : null,
    reschedule_count: Math.floor(r() * 3),
    is_qualified: r() < 0.5 ? r() < 0.7 : null,
    is_follow_up: r() < 0.1,
  }) as ReportBookingItem);
  return { logs, bookings };
}

describe("dailyReportMetrics", () => {
  const { logs, bookings } = fixture();

  for (const repUserId of [undefined, "rep-b"]) {
    it(`matches a full per-day report for every charted stat (${repUserId ?? "team"})`, () => {
      const fast = dailyReportMetrics(DAYS, logs, bookings, repUserId);
      DAYS.forEach((day, i) => {
        const full = getReportMetrics({ callLogs: logs, bookedItems: bookings, from: day, to: day, repUserId });
        for (const stat of STAT_CATALOG) {
          expect({ day, stat: stat.id, v: stat.raw(fast[i]) }).toEqual({ day, stat: stat.id, v: stat.raw(full) });
        }
      });
    });
  }
});
