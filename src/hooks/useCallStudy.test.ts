import { describe, expect, it } from "vitest";
import { bestBucket, meetingsFromCall, studyResult } from "./useCallStudy";

describe("call study results", () => {
  it("takes the best meeting, not the last", () => expect(bestBucket(["no_show", "closed", "cancelled"])).toBe("closed"));
  it("has no bucket without a meeting", () => expect(bestBucket([])).toBeNull());
  it.each([
    ["booked", "closed", "closed"],
    ["booked", "no_close", "showed"],
    ["booked", "no_show", "booked"],
    ["booked", null, "booked"],
    ["not_interested", "closed", "not_booked"],
  ] as const)("%s + %s -> %s", (o, b, want) => expect(studyResult(o, b)).toBe(want));
});

describe("meetingsFromCall", () => {
  const early = { scheduled_for: "2026-04-01T00:00:00+00:00" };
  const late = { scheduled_for: "2026-05-01T00:00:00+00:00" };
  it("takes the meetings after the call", () => expect(meetingsFromCall([early, late], "2026-04-15T00:00:00Z", true)).toEqual([late]));
  it("falls back for a first call logged late", () => expect(meetingsFromCall([early], "2026-04-15T00:00:00Z", true)).toEqual([early]));
  it("does not credit a later call with an earlier meeting", () => expect(meetingsFromCall([early], "2026-04-15T00:00:00Z", false)).toEqual([]));
  it("ignores undated slots", () => expect(meetingsFromCall([{ scheduled_for: null }], "2026-04-15T00:00:00Z", true)).toEqual([]));
});
