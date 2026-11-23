import { describe, expect, it } from "vitest";
import { NO_CLOSE_REASONS, reasonsForOutcome } from "@/lib/appointments";

describe("objection on every sitting that didn't close", () => {
  it("asks for one on no close, no close follow-up and a second meeting booked", () => {
    for (const o of ["showed_no_close", "no_close_follow_up", "second_meeting_booked"] as const) {
      const allowed = reasonsForOutcome(o)!.map((r) => r.value);
      for (const r of NO_CLOSE_REASONS) expect(allowed).toContain(r.value);
    }
  });
  it("does not ask on a close or a verbal yes", () => {
    expect(reasonsForOutcome("showed_closed")).toBeNull();
    expect(reasonsForOutcome("showed_verbal_commitment")).toBeNull();
  });
  it("offers Fear as a no-close objection", () => {
    expect(NO_CLOSE_REASONS.map((r) => r.value)).toContain("fear");
  });
});
