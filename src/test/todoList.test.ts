import { describe, expect, it } from "vitest";
import { buildTodo, dueCount, isUntouchedAuto, workingMorning, type TodoBookingRow, type TodoFollowUpRow } from "@/lib/todoList";

const now = new Date(2026, 10, 23, 10, 0).getTime(); // Mon 23 Nov 2026
const d = (days: number) => new Date(now + days * 86_400_000).toISOString();
const contact = (id: string, over = {}) => ({ id, business_name: id, status: "follow_up", is_dnc: false, ...over });
const booking = (id: string, over: Partial<TodoBookingRow> = {}): TodoBookingRow => ({
  id, contact_id: id, status: "completed", scheduled_for: d(-3), appointment_outcome: "no_show", outcome_reason: null,
  outcome_recorded_at: d(-3), reschedule_count: 0, created_by: "ben", created_at: d(-10), contacts: contact(id), ...over,
});
const follow = (id: string, contactId: string, over: Partial<TodoFollowUpRow> = {}): TodoFollowUpRow => ({
  id, contact_id: contactId, assigned_user_id: "ben", created_by: "ben", scheduled_for: d(-1), created_at: d(-2), notes: "", contacts: contact(contactId), ...over,
});
const build = (bookings: TodoBookingRow[], followUps: TodoFollowUpRow[] = [], ownerId: string | null = "ben", droppedAt = new Map<string, string>()) =>
  buildTodo({ bookings, followUps, ownerId, droppedAt, now });

describe("buildTodo", () => {
  it("gives a no-show to its setter once, even when the auto follow-up is the closer's", () => {
    const auto = follow("f", "a", { assigned_user_id: "bede", notes: "Auto follow-up: No show on Nov 20, 2026", created_at: d(-3), scheduled_for: d(-1) });
    expect(build([booking("a")], [auto]).map((i) => i.key)).toEqual(["b:a"]);
    expect(build([booking("a")], [auto], "bede")).toEqual([]);
    expect(build([booking("a")], [auto], null)).toHaveLength(1);
  });

  it("shows a fresh no-show straight away although its auto follow-up is due in two days", () => {
    const auto = follow("f", "a", { notes: "Auto follow-up: No show on Nov 23, 2026", created_at: d(0), scheduled_for: d(2) });
    expect(isUntouchedAuto(auto)).toBe(true);
    expect(build([booking("a", { scheduled_for: d(-0.1) })], [auto])[0].when).toBe("due");
  });

  it("hides a pushed-back no-show until its date", () => {
    const pushed = follow("f", "a", { notes: "Auto follow-up: No show on Nov 20, 2026", created_at: d(-3), scheduled_for: d(4) });
    expect(build([booking("a")], [pushed])[0].when).toBe("later");
  });

  it("brings an old no-show back as due when the date it was pushed to arrives", () => {
    const pushed = follow("f", "a", { created_at: d(-20), scheduled_for: d(0), notes: "Rebook no-show" });
    expect(build([booking("a", { scheduled_for: d(-45), outcome_recorded_at: d(-45), created_at: d(-50) })], [pushed])[0].when).toBe("due");
  });

  it("keeps a cancellation the database marked not interested, but not a real no", () => {
    const c = { contacts: contact("a", { status: "not_interested" }), appointment_outcome: "cancelled" };
    expect(build([booking("a", c)])[0].kind).toBe("cancelled");
    expect(build([booking("a", { ...c, outcome_reason: "cx_timing" })])).toHaveLength(1);
    expect(build([booking("a", { ...c, outcome_reason: "cx_not_interested" })])).toEqual([]);
    expect(build([booking("a", { ...c, outcome_reason: "cx_competitor" })])).toEqual([]);
    // Cancelled in GHL never sets that status, so a person did.
    expect(build([booking("a", { ...c, status: "canceled", appointment_outcome: null })])).toEqual([]);
  });

  it("drops a lead marked not interested from the list, until a later booking falls over", () => {
    const c = booking("a", { appointment_outcome: "cancelled", contacts: contact("a", { status: "not_interested" }) });
    expect(build([c], [], "ben", new Map([["a", d(-1)]]))).toEqual([]);
    expect(build([c], [], "ben", new Map([["a", d(-9)]]))).toHaveLength(1);
  });

  it("never lists DNC, closed or disqualified leads", () => {
    expect(build([booking("a", { contacts: contact("a", { is_dnc: true }) }), booking("b", { contacts: contact("b", { status: "closed" }) })])).toEqual([]);
    expect(build([], [follow("f", "a", { contacts: contact("a", { is_dnc: true }) })])).toEqual([]);
  });

  it("leaves a rebooked lead alone", () => {
    const fresh = booking("new", { contact_id: "a", status: "open", appointment_outcome: null, scheduled_for: d(2), created_at: d(-1) });
    expect(build([booking("a"), fresh], [follow("f", "a")])).toEqual([]);
  });

  it("keeps a follow-up made after the latest booking", () => {
    const sat = booking("a", { appointment_outcome: "no_close_follow_up", created_at: d(-10) });
    expect(build([sat], [follow("f", "a")]).map((i) => i.key)).toEqual(["f:f"]);
  });

  it("splits due, coming up and old, and only counts due", () => {
    const items = build([booking("z", { scheduled_for: d(-40) })], [
      follow("today", "a", { scheduled_for: d(0.2) }), follow("late", "b", { scheduled_for: d(-10) }),
      follow("next", "c", { scheduled_for: d(3) }), follow("ancient", "e", { scheduled_for: d(-90) }),
    ]);
    const when = Object.fromEntries(items.map((i) => [i.key, i.when]));
    expect(when).toEqual({ "b:z": "old", "f:today": "due", "f:late": "due", "f:next": "later", "f:ancient": "old" });
    expect(dueCount(items)).toBe(2);
  });

  it("puts no-shows first, then cancelled, then follow-ups", () => {
    const items = build([booking("c", { appointment_outcome: "cancelled" }), booking("n")], [follow("f", "x")]);
    expect(items.map((i) => i.kind)).toEqual(["no_show", "cancelled", "follow_up"]);
  });
});

it("workingMorning skips the weekend", () => {
  const fri = new Date(2026, 10, 27, 16, 0);
  expect(workingMorning(1, fri)).toEqual(new Date(2026, 10, 30, 9, 0));
});
