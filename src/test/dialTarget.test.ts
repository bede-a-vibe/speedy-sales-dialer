import { describe, expect, it } from "vitest";
import { isSwitchboardNumber, resolveDialTarget } from "@/lib/dialTarget";

// The number policy set 17 Sep 2026 (PR #72): main wins; an unverified DM
// number is only worth the risk when the main line is a switchboard; a
// confirmed DM number is always dialled; a DM number equal to main is noise.
const mobileMain = {
  phone: "+61 406 020 003",
  phone_type: "mobile",
  dm_phone: "0408 250 687",
  dm_phone_verified: false,
};

describe("resolveDialTarget", () => {
  it("dials the main mobile, not an unverified DM mobile, on a mobile-first business", () => {
    expect(resolveDialTarget(mobileMain)).toMatchObject({ number: "+61 406 020 003", isDmDirect: false });
  });

  it("dials an unverified DM mobile only to get past a switchboard main line", () => {
    expect(resolveDialTarget({ ...mobileMain, phone_type: "landline" })).toMatchObject({ number: "0408 250 687", isDmDirect: true });
    expect(resolveDialTarget({ ...mobileMain, phone_type: "business_line" })).toMatchObject({ number: "0408 250 687", isDmDirect: true });
  });

  it("always dials a rep-confirmed DM number", () => {
    expect(resolveDialTarget({ ...mobileMain, dm_phone_verified: true })).toMatchObject({ number: "0408 250 687", isDmDirect: true });
  });

  it("ignores a DM number that is the main number in another format", () => {
    expect(
      resolveDialTarget({ ...mobileMain, phone_type: "landline", dm_phone: "0406 020 003", dm_phone_verified: true }),
    ).toMatchObject({ number: "+61 406 020 003", isDmDirect: false });
  });

  it("falls back to the main number, or nothing, when there is no DM number", () => {
    expect(resolveDialTarget({ phone: "03 9000 0000", phone_type: "landline" })).toMatchObject({ number: "03 9000 0000", isDmDirect: false });
    expect(resolveDialTarget({ phone: "  ", dm_phone: null })).toMatchObject({ number: null, isDmDirect: false });
    expect(resolveDialTarget(null)).toMatchObject({ number: null, isDmDirect: false });
  });

  it("treats landlines and 1300/1800 lines as switchboards and mobiles as direct", () => {
    expect(isSwitchboardNumber("landline")).toBe(true);
    expect(isSwitchboardNumber("business_line")).toBe(true);
    expect(isSwitchboardNumber("mobile")).toBe(false);
    expect(isSwitchboardNumber(null)).toBe(false);
  });
});
