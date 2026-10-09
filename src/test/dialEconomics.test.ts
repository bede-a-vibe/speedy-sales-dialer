import { describe, expect, it } from "vitest";
import { isAdsSourced } from "@/hooks/useDialEconomics";

const c = (lead_channel: string | null, utm_campaign: string | null = null) => ({ lead_channel, utm_campaign });

describe("isAdsSourced — keeps paid revenue out of cold-call $/dial", () => {
  it("treats a campaign tag as ads regardless of channel", () => {
    expect(isAdsSourced(c(null, "Odin Lucas Static Ads Broad Niche (1 June 2026)"))).toBe(true);
  });

  it("matches the real channel spellings in the data", () => {
    // All four of these appear on live contacts.
    for (const v of ["ads", "Ads", "meta ads", "FB/IG Ads"]) {
      expect(isAdsSourced(c(v))).toBe(true);
    }
  });

  it("does not treat a cold-list contact as ads", () => {
    // Cold contacts were deliberately left sourceless until they convert.
    expect(isAdsSourced(c(null))).toBe(false);
    expect(isAdsSourced(c("cold call"))).toBe(false);
    expect(isAdsSourced(c("referral"))).toBe(false);
    expect(isAdsSourced(null)).toBe(false);
  });

  it("does not match a channel that merely contains the letters by accident", () => {
    // Guard against a substring match on an unrelated word.
    expect(isAdsSourced(c("roadshow"))).toBe(false);
    expect(isAdsSourced(c("headspace"))).toBe(false);
  });
});
