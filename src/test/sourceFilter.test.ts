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
