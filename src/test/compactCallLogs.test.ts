import { describe, expect, it } from "vitest";
import { expandCompactCallLogs } from "@/hooks/useCallLogs";

describe("get_call_logs_compact expansion", () => {
  it("rebuilds rows with their contact, in the SQL field order", () => {
    const row = ["l1", "c1", "u1", "booked", null, "2026-11-16T05:00:00+00:00", "dp1", null, 120, 140,
      true, true, false, false, null, null, null, null, null, null, null];
    const contact = ["NESCO", "Electricians", "Electrical", "VIC", "Team (3+)", "Mostly Commercial", "Tier 5",
      "Moderate", "mobile", null, "unknown", null, null, 0];
    const [out] = expandCompactCallLogs({ rows: [row], contacts: { c1: contact } });
    expect(out.id).toBe("l1");
    expect(out.outcome).toBe("booked");
    expect(out.dialpad_talk_time_seconds).toBe(120);
    expect(out.reached_problem_awareness).toBe(true);
    expect(out.exit_reason_booking).toBeNull();
    expect(out.contacts.business_name).toBe("NESCO");
    expect(out.contacts.state).toBe("VIC");
    expect(out.contacts.review_count).toBe(0);
  });
  it("leaves contacts null when the contact is not visible", () => {
    const [out] = expandCompactCallLogs({ rows: [["l2", "cX", "u1", "no_answer"]], contacts: {} });
    expect(out.contacts).toBeNull();
    expect(out.exit_reason_booking).toBeNull();
  });
});

import { eachDay } from "@/components/funnel/MetricTrendChart";
describe("trend chart days", () => {
  it("starts at the first day with data on All time", () => {
    const days = eachDay("2020-01-01", "2026-11-17", "2026-03-17");
    expect(days[0]).toBe("2026-03-17");
    expect(days[days.length - 1]).toBe("2026-11-17");
  });
  it("keeps the most recent 366 days of a longer range", () => {
    const days = eachDay("2024-01-01", "2026-11-17");
    expect(days.length).toBe(366);
    expect(days[days.length - 1]).toBe("2026-11-17");
  });
});
