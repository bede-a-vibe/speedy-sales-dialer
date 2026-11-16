import { describe, expect, it } from "vitest";
import { melbourneToday, nextBusinessDayAt10 } from "@/lib/appointments";

describe("proposal task dates", () => {
  it("Friday rolls to Monday 10am", () => {
    const d = new Date(nextBusinessDayAt10(new Date(2026, 10, 20, 15, 0)));
    expect(d.getDay()).toBe(1);
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(10);
  });
  it("Monday goes to Tuesday", () => {
    expect(new Date(nextBusinessDayAt10(new Date(2026, 10, 16, 15, 0))).getDate()).toBe(17);
  });
  it("Melbourne date, not UTC", () => {
    // 16 Nov 14:00 UTC is 17 Nov 01:00 in Melbourne (AEDT).
    expect(melbourneToday(new Date("2026-11-16T14:00:00Z"))).toBe("2026-11-17");
  });
});
