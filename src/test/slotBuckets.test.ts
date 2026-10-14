import { describe, expect, it } from "vitest";
import { getReportMetrics } from "@/lib/reportMetrics";

const booking = (o: string | null, status = "completed") => ({
  id: Math.random().toString(36).slice(2),
  contact_id: "c1",
  created_at: "2026-10-14T01:00:00Z",
  created_by: "u1",
  assigned_user_id: "u1",
  scheduled_for: "2026-10-14T01:00:00Z",
  appointment_outcome: o,
  outcome_recorded_at: null,
  status,
  deal_value: null,
  monthly_recurring_value: null,
  reschedule_count: 0,
  is_qualified: null,
  contacts: null,
}) as never;

const run = (items: unknown[]) =>
  getReportMetrics({
    callLogs: [], bookedItems: items as never[],
    from: "2026-10-14", to: "2026-10-14", contacts: [],
  });

describe("a disqualification is a sitting, not a failed slot", () => {
  it("counts a DQ as showed", () => {
    const m = run([booking("disqualified")]);
    expect(m.appointmentPerformance.setter.showed).toBe(1);
  });

  it("does not also count it as cancelled", () => {
    const m = run([booking("disqualified")]);
    expect(m.appointmentPerformance.setter.showUpRate).toBe(100);
  });

  it("lets the outcome win when the row is also flagged canceled", () => {
    // Marking a DQ can leave the row's status as canceled; the outcome is the
    // truth about whether they turned up.
    const m = run([booking("disqualified", "canceled")]);
    expect(m.appointmentPerformance.setter.showed).toBe(1);
  });

  it("still treats a real cancellation as cancelled", () => {
    const m = run([booking("cancelled", "canceled")]);
    expect(m.appointmentPerformance.setter.showed).toBe(0);
  });

  it("gets the mixed day right", () => {
    // 3 DQs + 4 no-shows = 7 resolved, 3 showed.
    const m = run([
      booking("disqualified"), booking("disqualified"), booking("disqualified"),
      booking("no_show"), booking("no_show"), booking("no_show"), booking("no_show"),
    ]);
    expect(m.appointmentPerformance.setter.showed).toBe(3);
    expect(m.appointmentPerformance.setter.showUpRate).toBe(43);
  });
});
