import { describe, expect, it } from "vitest";
import { getReportMetrics } from "@/lib/reportMetrics";

/**
 * The RULE for how a slot resolved now lives in exactly one place:
 * public.resolve_meeting_bucket() in the database. It is verified against a
 * truth table in the migration that creates it, and surfaced to the app as the
 * `resolved_bucket` computed column.
 *
 * What is worth testing here is the CONTRACT: the app honours whatever the
 * database said, keeps pending/upcoming out of every denominator, and never
 * second-guesses it from appointment_outcome.
 */
const booking = (resolved_bucket: string | null, appointment_outcome: string | null = null, status = "completed") => ({
  id: Math.random().toString(36).slice(2),
  contact_id: "c1",
  created_at: "2026-10-14T01:00:00Z",
  created_by: "u1",
  assigned_user_id: "u1",
  scheduled_for: "2026-10-14T01:00:00Z",
  appointment_outcome,
  outcome_recorded_at: null,
  status,
  deal_value: null,
  monthly_recurring_value: null,
  reschedule_count: 0,
  is_qualified: null,
  resolved_bucket,
  contacts: null,
}) as never;

const run = (items: unknown[]) =>
  getReportMetrics({ callLogs: [], bookedItems: items as never[], from: "2026-10-14", to: "2026-10-14", contacts: [] })
    .appointmentPerformance.setter;

describe("the app honours the database's bucket", () => {
  it("counts a slot the database called showed", () => {
    expect(run([booking("showed")]).showed).toBe(1);
  });

  it("does not re-derive from appointment_outcome", () => {
    // A disqualification resolves to 'showed' in SQL. If the app still had its
    // own opinion it would read the enum and call this cancelled.
    expect(run([booking("showed", "disqualified")]).showed).toBe(1);
  });

  it("ignores a stale canceled status when the database said showed", () => {
    expect(run([booking("showed", "disqualified", "canceled")]).showed).toBe(1);
  });

  it("keeps a real cancellation out of showed", () => {
    const m = run([booking("cancelled", "cancelled", "canceled")]);
    expect(m.showed).toBe(0);
    expect(m.showUpRate).toBe(0);
  });

  it("leaves pending and upcoming out of the denominator entirely", () => {
    // 1 showed, 1 no-show, plus two slots with no verdict yet: 50%, not 25%.
    const m = run([booking("showed"), booking("noshow"), booking("pending"), booking("upcoming")]);
    expect(m.showed).toBe(1);
    expect(m.showUpRate).toBe(50);
  });

  it("treats a missing bucket as unresolved rather than guessing", () => {
    const m = run([booking("showed"), booking(null, "no_show")]);
    expect(m.showed).toBe(1);
    expect(m.showUpRate).toBe(100);
  });

  it("ignores a bucket value it does not recognise", () => {
    const m = run([booking("showed"), booking("something_new")]);
    expect(m.showUpRate).toBe(100);
  });

  it("gets a mixed day right", () => {
    const m = run([
      booking("showed"), booking("showed"), booking("showed"),
      booking("noshow"), booking("noshow"), booking("noshow"), booking("noshow"),
    ]);
    expect(m.showed).toBe(3);
    expect(m.showUpRate).toBe(43);
  });
});
