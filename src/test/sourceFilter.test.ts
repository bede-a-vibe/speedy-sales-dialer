import { describe, expect, it } from "vitest";
import { filterBookingsBySource } from "@/lib/sourceFunnelTotals";

describe("lead source filter on bookings", () => {
  const items = [
    { id: "a", meeting_channel: "Cold Call" },
    { id: "b", meeting_channel: "Referral" },
    { id: "c", meeting_channel: "Ads" },
    { id: "d", meeting_channel: null },
  ];
  it("keeps everything on All sources", () => {
    expect(filterBookingsBySource(items, "all", "all")).toHaveLength(4);
  });
  it("keeps one source by its picker slug", () => {
    expect(filterBookingsBySource(items, "cold-call", "all").map((i) => i.id)).toEqual(["a"]);
    expect(filterBookingsBySource(items, "referral", "all").map((i) => i.id)).toEqual(["b"]);
  });
  it("treats a missing channel as Unattributed", () => {
    expect(filterBookingsBySource(items, "unattributed", "all").map((i) => i.id)).toEqual(["d"]);
  });
});

import { tallyNewClients } from "@/hooks/useDialEconomics";
describe("dial economics from new clients", () => {
  it("counts Cold Call new clients and reports the rest as excluded", () => {
    const r = tallyNewClients([
      { contact_id: "a", channel: "Cold Call", mrr: "2000", one_off: 0 },
      { contact_id: "b", channel: "Cold Call", mrr: 4000, one_off: 500 },
      { contact_id: "c", channel: "Referral", mrr: 4000, one_off: 0 },
      { contact_id: "d", channel: "Ads", mrr: 6000, one_off: 0 },
    ], 1000);
    expect(r.dealsClosed).toBe(2);
    expect(r.newMrr).toBe(6000);
    expect(r.oneOffRevenue).toBe(500);
    expect(r.excludedDeals).toBe(2);
    expect(r.excludedMrr).toBe(10000);
    expect(r.mrrPerDial).toBe(6);
  });
});
