import { describe, expect, it } from "vitest";
import { ANSWERED_OUTCOMES, getReportMetrics, type ReportCallLog } from "@/lib/reportMetrics";

describe("shared Insights and EOD answered-outcome definition", () => {
  it.each(["not_interested", "dnc", "follow_up", "booked", "gatekeeper"] as const)(
    "counts %s as a pick-up", (outcome) => {
      expect(ANSWERED_OUTCOMES.has(outcome)).toBe(true);
    },
  );
  it.each(["no_answer", "voicemail", "wrong_number", "disqualified"] as const)(
    "does not count %s as a pick-up", (outcome) => {
      expect(ANSWERED_OUTCOMES.has(outcome)).toBe(false);
    },
  );
  it("counts all logged attempts in the denominator, including voicemail", () => {
    const logs = ["booked", "gatekeeper", "voicemail", "no_answer"].map((outcome, i) => ({
      id: String(i), contact_id: String(i), user_id: "rep", outcome,
      created_at: "2026-11-11T02:00:00Z", dialpad_talk_time_seconds: 30,
      dialpad_total_duration_seconds: 40, reached_connection: false,
      reached_commitment: false, exit_reason_connection: null,
    })) as ReportCallLog[];
    const metrics = getReportMetrics({ callLogs: logs, bookedItems: [], contacts: [] });
    expect(metrics.dialer.pickUps).toBe(2);
    expect(metrics.dialer.pickUpRate).toBe(50);
  });
});