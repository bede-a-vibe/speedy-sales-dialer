import { describe, expect, it } from "vitest";
import { closeStartDate } from "@/lib/closeStartDate";

describe("closeStartDate", () => {
  it("uses the Melbourne day of the meeting, not the UTC day", () => {
    // 8am Thu 19 Nov in Melbourne is 9pm Wed 18 Nov UTC.
    expect(closeStartDate("2026-11-18T21:00:00+00:00")).toBe("2026-11-19");
    // 4pm Wed 18 Nov in Melbourne.
    expect(closeStartDate("2026-11-18T05:00:00+00:00")).toBe("2026-11-18");
  });
});
