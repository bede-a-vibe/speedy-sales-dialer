import { describe, expect, it } from "vitest";
import { bestBucket, studyResult } from "./useCallStudy";

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
