import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getReportMetrics, shiftDateKey, todayDateKey, toDateKey, type ReportBookingItem, type ReportCallLog } from "@/lib/reportMetrics";
import { computeFunnel, filterFunnelLogs } from "@/lib/funnelMetrics";
import { tallyDialEconomics, type DialEconomicsDeal } from "@/hooks/useDialEconomics";
import { STAT_CATALOG_BY_ID } from "@/lib/funnelStatsCatalog";
import { EndToEndFunnel } from "@/components/funnel/EndToEndFunnel";

/**
 * Insights accuracy fixes, 17 Nov 2026 (audit of 9 to 17 Nov).
 * Times are local (built with new Date(y, m, d, h)) so the tests read the same
 * in any timezone the suite runs in.
 */
const local = (day: number, hour = 13, month = 10) => new Date(2026, month, day, hour, 0).toISOString();

let n = 0;
const meeting = (over: Partial<ReportBookingItem> = {}): ReportBookingItem => ({
  id: `m-${n++}`,
  contact_id: `c-${n}`,
  created_at: local(9, 9),
  created_by: "ben",
  assigned_user_id: "bede",
  scheduled_for: local(10),
  status: "open",
  appointment_outcome: null,
  deal_value: null,
  monthly_recurring_value: null,
  reschedule_count: 0,
  move_count: 0,
  is_qualified: null,
  resolved_bucket: null,
  ...over,
});

const run = (bookedItems: ReportBookingItem[], callLogs: ReportCallLog[] = [], from = "2026-11-09", to = "2026-11-17") =>
  getReportMetrics({ callLogs, bookedItems, from, to });

describe("1. Close Rate uses the closer's Pitched answer (wasPitched)", () => {
  const items = [
    meeting({ appointment_outcome: "showed_closed", resolved_bucket: "showed", monthly_recurring_value: 2000 }),
    // Ridge / ACDC: outcome says no close, closer said Not pitched.
    meeting({ appointment_outcome: "showed_no_close", pitched: false, resolved_bucket: "showed" }),
    meeting({ appointment_outcome: "showed_verbal_commitment", pitched: false, resolved_bucket: "showed" }),
    // Black Box: second meeting booked, but the closer pitched.
    meeting({ appointment_outcome: "second_meeting_booked", pitched: true, resolved_bucket: "showed" }),
    // Older row with no answer falls back to the outcome.
    meeting({ appointment_outcome: "showed_no_close", pitched: null, resolved_bucket: "showed" }),
  ];

  it("counts pitched from the field, the outcome only when the field is empty", () => {
    const s = run(items).appointmentPerformance.setter;
    expect(s.pitched).toBe(3);
    expect(s.closeRate).toBe(33); // 1 / 3, was 1 / 4 on the outcome rule
  });

  it("Qualified Lead Close Rate uses the same rule", () => {
    const q = items.map((i) => ({ ...i, is_qualified: true }));
    expect(run(q).appointmentPerformance.setter.qualifiedCloseRate).toBe(33);
  });
});

describe("2. Moved splits count real moves (movesOf), not entry errors", () => {
  const items = [
    // Two date-typo fixes, never really moved, showed.
    meeting({ reschedule_count: 2, move_count: 0, resolved_bucket: "showed", appointment_outcome: "showed_no_close" }),
    // Really moved once, then no-show (one entry error on top).
    meeting({ reschedule_count: 2, move_count: 1, resolved_bucket: "noshow", appointment_outcome: "no_show" }),
    // Really moved twice, showed.
    meeting({ reschedule_count: 3, move_count: 2, resolved_bucket: "showed", appointment_outcome: "showed_no_close" }),
  ];

  it("splits never moved / moved once / moved 2+ on move_count", () => {
    const s = run(items).appointmentPerformance.setter;
    expect(s.firstTimeShowUpRate).toBe(100); // 1 / 1 never moved
    expect(s.movedOnceShowUpRate).toBe(0); // 0 / 1
    expect(s.multiRescheduleShowUpRate).toBe(100); // 1 / 1
    expect(s.rescheduledShowUpRate).toBe(50); // 1 / 2 moved at least once
    expect(s.rescheduledSittings).toBe(2);
    expect(s.showUpByRescheduleCount.map((b) => b.sat)).toEqual([1, 1, 1, 0]);
  });

  it("falls back to reschedule_count only when move_count is missing (GHL-only rows)", () => {
    const ghl = meeting({ reschedule_count: 1, move_count: undefined, resolved_bucket: "showed", appointment_outcome: "showed_no_close" });
    expect(run([ghl]).appointmentPerformance.setter.movedOnceShowUpRate).toBe(100);
  });
});

describe("3. End-to-End funnel: Showed is first meetings by meeting date", () => {
  const items = [
    meeting({ resolved_bucket: "showed", appointment_outcome: "showed_no_close" }),
    meeting({ resolved_bucket: "noshow", appointment_outcome: "no_show" }),
    meeting({ resolved_bucket: "showed", appointment_outcome: "showed_closed", is_follow_up: true }),
  ];
  const metrics = run(items);

  it("first-meeting showed and all sittings are separate stats", () => {
    const s = metrics.appointmentPerformance.setter;
    expect(s.showed).toBe(2);
    expect(s.firstMeetingShowed).toBe(1);
    expect(STAT_CATALOG_BY_ID.get("showed")?.label).toBe("Sittings (all meetings)");
    expect(STAT_CATALOG_BY_ID.get("first_meeting_showed")?.raw(metrics)).toBe(1);
    // The qualification show-up rates are ~100% by construction and are gone.
    expect(STAT_CATALOG_BY_ID.has("qualified_show_up_rate")).toBe(false);
    expect(STAT_CATALOG_BY_ID.has("unqualified_show_up_rate")).toBe(false);
    expect(STAT_CATALOG_BY_ID.get("showed_qualified_rate")?.label).toBe("Qualified share of shows");
  });

  it("renders Showed from first meetings with its own show-up rate, and Call Commitment", () => {
    render(<EndToEndFunnel metrics={metrics} funnel={computeFunnel([])} />);
    expect(screen.getByText("Call Commitment")).toBeTruthy();
    expect(screen.queryByText("Verbal Commitment")).toBeNull();
    expect(screen.getByText("first meetings, by meeting date")).toBeTruthy();
    // label div -> label column -> the stage row
    const showedRow = screen.getByText("Showed").parentElement!.parentElement!;
    // 1 showed of 2 first meetings resolved = 50%, not 1 ÷ bookings made.
    expect(showedRow.textContent).toContain("50%");
    expect(screen.getByText("Meetings held in the range")).toBeTruthy();
  });
});

describe("5. Sales Efficiency counts closes by meeting date", () => {
  it("counts a close whose booking was made before the window", () => {
    // Sean Emmerson: booked 6 Nov, closed 9 Nov at $2k/mo.
    const sean = meeting({ created_at: local(6), scheduled_for: local(9), appointment_outcome: "showed_closed", resolved_bucket: "showed", monthly_recurring_value: 2000 });
    const s = run([sean]).sales;
    expect(s.closes).toBe(1);
    expect(s.monthlyRecurring).toBe(2000);
    expect(s.firstYearValue).toBe(24000);
  });

  it("does not count a close booked in the window but held after it", () => {
    const later = meeting({ created_at: local(10), scheduled_for: local(20), appointment_outcome: "showed_closed", resolved_bucket: "showed", monthly_recurring_value: 2000 });
    expect(run([later]).sales.closes).toBe(0);
  });
});

describe("8. Qualified Booking Rate is over resolved first-meeting sittings", () => {
  it("ignores upcoming and second meetings in the denominator", () => {
    const items = [
      meeting({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", is_qualified: true }),
      meeting({ resolved_bucket: "noshow", appointment_outcome: "no_show" }),
      meeting({ resolved_bucket: "upcoming" }),
      meeting({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", is_qualified: true, is_follow_up: true }),
    ];
    expect(run(items).appointmentPerformance.setter.qualifiedRate).toBe(50); // 1 / 2
  });
});

describe("4. Local dates, not UTC", () => {
  it("keeps a dial at 8am local on the start day in the funnel", () => {
    const logs = [{ id: "l1", user_id: "ben", outcome: "booked", created_at: local(9, 8), reached_connection: true, reached_problem_awareness: true, reached_solution_awareness: true, reached_commitment: true }];
    expect(filterFunnelLogs(logs as never, { from: "2026-11-09", to: "2026-11-09" })).toHaveLength(1);
  });

  it("today and shifted keys are local calendar dates", () => {
    const now = new Date();
    expect(todayDateKey()).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
    // Previous period for 9 to 17 Nov (9 days) is 31 Oct to 8 Nov.
    const previousTo = shiftDateKey("2026-11-09", -1);
    expect(previousTo).toBe("2026-11-08");
    expect(shiftDateKey(previousTo, -8)).toBe("2026-10-31");
    expect(toDateKey(local(9, 0))).toBe("2026-11-09");
  });
});

describe("10. Daily Call Volume fills days with no dials", () => {
  it("returns every day in the range", () => {
    const log = (day: number) => ({ id: `d${day}`, contact_id: "c", user_id: "ben", outcome: "no_answer", created_at: local(day), dialpad_talk_time_seconds: 0, dialpad_total_duration_seconds: 0, exit_reason_connection: null, reached_connection: false, reached_commitment: false }) as ReportCallLog;
    const m = run([], [log(9), log(9), log(11)], "2026-11-09", "2026-11-12");
    expect(m.dailyVolume).toEqual([
      { date: "2026-11-09", count: 2 },
      { date: "2026-11-10", count: 0 },
      { date: "2026-11-11", count: 1 },
      { date: "2026-11-12", count: 0 },
    ]);
  });
});

describe("6. Dial economics counts clients, not client_deals rows", () => {
  it("a retainer plus a one-off for one client is one deal", () => {
    const deal = (contact_id: string, billing_period: DialEconomicsDeal["billing_period"], amount: number): DialEconomicsDeal => ({
      contact_id, amount, billing_period, status: "active" as DialEconomicsDeal["status"], start_date: "2026-11-10", end_date: null, contacts: null,
    });
    const out = tallyDialEconomics(
      [deal("jr", "monthly", 2000), deal("jr", "monthly", 1000), deal("reach", "monthly", 2000), deal("reach", "one_off", 1500)],
      new Set(["jr", "reach"]),
      1000,
    );
    expect(out.dealsClosed).toBe(2);
    expect(out.oneOffRevenue).toBe(1500);
  });
});
