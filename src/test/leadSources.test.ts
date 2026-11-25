import { describe, expect, it } from "vitest";
import { changeLeadSource, leadSourceFields, leadSourceOf } from "@/lib/leadSources";

describe("lead sources", () => {
  it("keeps cold calls cold and everything else inbound", () => {
    expect(leadSourceFields("Cold Call")).toEqual({ lead_channel: "Cold Call", lead_type: "cold", lead_source: null });
    expect(leadSourceFields("Referral", " James Gram ")).toEqual({ lead_channel: "Referral", lead_type: "inbound", lead_source: "James Gram" });
  });
  it("moves the dial pool only when crossing cold and not cold", () => {
    expect(changeLeadSource({ lead_type: "warm" }, "SEO")).toEqual({ lead_channel: "SEO" });
    expect(changeLeadSource({ lead_type: "cold" }, "SEO")).toEqual({ lead_channel: "SEO", lead_type: "inbound" });
    expect(changeLeadSource({ lead_type: "cold" }, "Cold Call")).toEqual({ lead_channel: "Cold Call" });
    expect(changeLeadSource({ lead_type: "inbound" }, "Cold Call")).toEqual({ lead_channel: "Cold Call", lead_type: "cold" });
  });
  it("reads older contacts", () => {
    expect(leadSourceOf({ lead_channel: null, lead_type: "cold" })).toBe("Cold Call");
    expect(leadSourceOf({ lead_channel: "meta ads", lead_type: "cold" })).toBe("Meta Ads");
    expect(leadSourceOf({ lead_channel: "ads", lead_type: "inbound" })).toBe("ads");
    expect(leadSourceOf({ lead_channel: null, lead_type: "inbound" })).toBe("");
  });
});
