import { describe, expect, it } from "vitest";
import { resolveDialTarget, toDialableAU } from "@/lib/dialTarget";

describe("toDialableAU", () => {
  it("turns the ways reps type AU numbers into +61", () => {
    // Stacey Electrical, 16 Nov 2026: the boss's mobile was saved as "+0412174299".
    expect(toDialableAU("+0412174299")).toBe("+61412174299");
    expect(toDialableAU("0412 174 299")).toBe("+61412174299");
    expect(toDialableAU("412174299")).toBe("+61412174299");
    expect(toDialableAU("+61 411 690 236")).toBe("+61411690236");
    expect(toDialableAU("61 (0) 412 174 299")).toBe("+61412174299");
    expect(toDialableAU("(03) 9555 1234")).toBe("+61395551234");
  });

  it("leaves 13/1300/1800 numbers alone and rejects blanks", () => {
    expect(toDialableAU("1300 123 456")).toBe("1300123456");
    expect(toDialableAU("13 12 34")).toBe("131234");
    expect(toDialableAU("  ")).toBeNull();
    expect(toDialableAU(null)).toBeNull();
  });
});

describe("resolveDialTarget dials a normalised number", () => {
  it("dials a confirmed DM mobile even when it was typed badly", () => {
    const t = resolveDialTarget({ phone: "+61 411 690 236", phone_type: "mobile", dm_phone: "+0412174299", dm_phone_verified: true });
    expect(t.number).toBe("+61412174299");
    expect(t.isDmDirect).toBe(true);
  });
});
