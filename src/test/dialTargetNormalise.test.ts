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

describe("resolveDialTarget preferred owner mobile", () => {
  const lead = { phone: "+61 411 690 236", phone_type: "mobile", dm_phone: "+61412174299" };
  it("rings the preferred mobile ahead of a mobile main line", () => {
    const t = resolveDialTarget({ ...lead, dm_phone_preferred: "0412 174 299" });
    expect(t.number).toBe("+61412174299");
    expect(t.isDmDirect).toBe(true);
  });
  it("stops applying once the DM number is changed or removed by hand", () => {
    expect(resolveDialTarget({ ...lead, dm_phone: "0400 111 222", dm_phone_preferred: "+61412174299" }).number).toBe("+61411690236");
    expect(resolveDialTarget({ ...lead, dm_phone: null, dm_phone_preferred: "+61412174299" }).number).toBe("+61411690236");
    expect(resolveDialTarget({ ...lead, dm_phone: "0400 111 222", dm_phone_verified: true, dm_phone_preferred: "+61412174299" }).number).toBe("+61400111222");
  });
  it("leaves an ordinary scraped DM number on a mobile main line undialled", () => {
    expect(resolveDialTarget(lead).number).toBe("+61411690236");
  });
});
