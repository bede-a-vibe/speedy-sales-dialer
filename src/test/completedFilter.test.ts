import { describe, expect, it } from "vitest";
import { filterCompleted } from "@/lib/completedFilter";

const row = (id: string, appointment_outcome: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  contact_id: `c-${id}`,
  scheduled_for: "2026-11-10T00:00:00Z",
  appointment_outcome,
  outcome_reason: null as string | null,
  ...extra,
});
const rows = [
  row("a", "showed_no_close", { outcome_reason: "timing", is_qualified: true }),
  row("b", "no_close_follow_up", { outcome_reason: "price_budget", is_qualified: false }),
  row("c", "disqualified", { dq_reason: "dq_too_small", is_qualified: false }),
  row("d", "no_close_follow_up"),
  row("e", "showed_closed", { is_qualified: true }),
];
const ids = (r: { id: string }[]) => r.map((x) => x.id);

describe("Completed tab filters", () => {
  it("filters by reason, by outcome, and by both", () => {
    expect(ids(filterCompleted(rows, "all", "timing"))).toEqual(["a"]);
    expect(ids(filterCompleted(rows, "all", "dq_too_small"))).toEqual(["c"]);
    expect(ids(filterCompleted(rows, "no_close_follow_up", "none"))).toEqual(["d"]);
    expect(ids(filterCompleted(rows, "no_close_follow_up", "all"))).toEqual(["b", "d"]);
    expect(filterCompleted(rows, "all", "all")).toHaveLength(5);
  });

  it("groups didn't close the same way the trackers do", () => {
    expect(ids(filterCompleted(rows, "didnt_close", "all"))).toEqual(["a", "b", "d"]);
    expect(ids(filterCompleted(rows, "disqualified", "all"))).toEqual(["c"]);
  });

  it("filters by the qualified mark", () => {
    expect(ids(filterCompleted(rows, "all", "all", "yes"))).toEqual(["a", "e"]);
    expect(ids(filterCompleted(rows, "all", "all", "no"))).toEqual(["b", "c"]);
    expect(ids(filterCompleted(rows, "all", "all", "unmarked"))).toEqual(["d"]);
  });

  it("splits second meetings into still in play and next meeting held", () => {
    const seconds = [
      { id: "s1", contact_id: "x", scheduled_for: "2026-11-02T00:00:00Z", appointment_outcome: "second_meeting_booked" },
      { id: "s2", contact_id: "x", scheduled_for: "2026-11-09T00:00:00Z", appointment_outcome: "showed_verbal_commitment" },
      { id: "s3", contact_id: "y", scheduled_for: "2026-11-05T00:00:00Z", appointment_outcome: "second_meeting_booked" },
    ];
    expect(ids(filterCompleted(seconds, "still_in_play", "all"))).toEqual(["s3"]);
    expect(ids(filterCompleted(seconds, "second_done", "all"))).toEqual(["s1"]);
  });
});
