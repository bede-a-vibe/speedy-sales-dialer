import { describe, expect, it } from "vitest";
import { filterCompleted } from "@/lib/completedFilter";

const rows = [
  { id: "a", appointment_outcome: "showed_no_close", outcome_reason: "timing" },
  { id: "b", appointment_outcome: "no_close_follow_up", outcome_reason: "price_budget" },
  { id: "c", appointment_outcome: "disqualified", outcome_reason: null, dq_reason: "dq_too_small" },
  { id: "d", appointment_outcome: "no_close_follow_up", outcome_reason: null },
  { id: "e", appointment_outcome: "showed_closed", outcome_reason: null },
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
});
