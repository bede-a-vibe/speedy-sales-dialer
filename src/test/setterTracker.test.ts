import { describe, expect, it } from "vitest";
import { buildSetterDailyStats, sumSetterStats, type SetterCallLog } from "@/lib/setterTracker";
import type { NewClientWithCredit, TrackerItem } from "@/lib/funnelTracker";

const BEN = "ben";
const LACH = "lachlan";
// 01:00Z is midday in Melbourne.
const at = (day: string, hh = "01") => `${day}T${hh}:00:00Z`;
const call = (over: Partial<SetterCallLog>): SetterCallLog => ({
  contact_id: "c1", outcome: "no_answer", created_at: at("2026-11-10"), user_id: BEN,
  dialpad_talk_time_seconds: 0, reached_connection: false, reached_commitment: false, exit_reason_connection: null, ...over,
});
const booking = (over: Partial<TrackerItem>) =>
  ({
    id: Math.random().toString(36), contact_id: "c9", created_at: at("2026-11-10"), created_by: BEN, assigned_user_id: "bede",
    scheduled_for: at("2026-11-12"), appointment_outcome: null, outcome_recorded_at: null, status: "open", deal_value: null,
    monthly_recurring_value: null, reschedule_count: 0, move_count: 0, resolved_bucket: null, is_follow_up: false, ...over,
  }) as TrackerItem;

describe("setter tracker", () => {
  const days = ["2026-11-10", "2026-11-11", "2026-11-12"];
  const logs = [
    call({ contact_id: "a", created_at: at("2026-11-10", "22") }), // 9am Melbourne 11 Nov
    call({ contact_id: "a", outcome: "not_interested", dialpad_talk_time_seconds: 40, exit_reason_connection: "hung_up_immediately" }),
    call({ contact_id: "b", outcome: "booked", dialpad_talk_time_seconds: 400, reached_connection: true, reached_commitment: true }),
    call({ contact_id: "c", outcome: "disqualified", dialpad_talk_time_seconds: 60, reached_connection: true }),
    call({ contact_id: "d", outcome: "booked", user_id: LACH }),
  ];
  const items = [
    booking({ booking_method: "manual_set", resolved_bucket: "showed", appointment_outcome: "showed_no_close" } as Partial<TrackerItem>),
    booking({ resolved_bucket: "noshow", outcome_reason: "ns_missed_by_us" } as Partial<TrackerItem>),
    booking({ resolved_bucket: "noshow" }),
    booking({ created_by: LACH, resolved_bucket: "showed" }),
    booking({ is_follow_up: true, resolved_bucket: "showed" }),
  ];
  const newClients: NewClientWithCredit[] = [
    { contact_id: "c9", business_name: "X", channel: "Cold Call", source: null, first_start: "2026-11-12", mrr: 4000, one_off: 0, dialled: true, setter_id: BEN, tier: null },
  ];
  const stats = buildSetterDailyStats({
    days, setterIds: new Set([BEN]), callLogs: logs, items, newClients,
    inputs: [{ day: "2026-11-10", funnel: "cold", user_id: BEN, rostered_hours: 7.5, ad_spend: null, clicks: null, leads: null }],
    productiveHours: new Map([[BEN, new Map([["2026-11-10", 5]])]]),
  });

  it("counts one setter's calls on the day dialled", () => {
    const d10 = stats.get("2026-11-10")!;
    expect(d10.dials).toBe(3);
    expect(d10.leads.size).toBe(3);
    expect(d10.answers).toBe(3);
    expect(d10.convos).toBe(2);
    expect(d10.qualified).toBe(1);
    expect(d10.hangups).toBe(1);
    expect(d10.fdqs).toBe(1);
    expect(d10.bookedCalls).toBe(1);
    expect(d10.talkSeconds).toBe(500);
    expect(d10.rosteredHours).toBe(7.5);
    expect(d10.productiveHours).toBe(5);
    expect(d10.daysWorked).toBe(1);
    // A 22:00Z call is the next Melbourne day.
    expect(stats.get("2026-11-11")!.dials).toBe(1);
  });

  it("counts the setter's sets and how their first meetings ended, not other setters' or second meetings", () => {
    const d10 = stats.get("2026-11-10")!;
    expect(d10.sets).toBe(3);
    expect(d10.manualSets).toBe(1);
    const d12 = stats.get("2026-11-12")!;
    expect(d12.onCal).toBe(3);
    expect(d12.live).toBe(1);
    expect(d12.noShows).toBe(1);
    expect(d12.missedByUs).toBe(1);
    expect(d12.sold).toBe(1);
    expect(d12.cash).toBe(4000);
  });

  it("totals are sums of days; unique leads are a union; clock times stay on day rows", () => {
    const t = sumSetterStats(days.map((d) => stats.get(d)!));
    expect(t.dials).toBe(4);
    expect(t.leads.size).toBe(3);
    expect(t.daysWorked).toBe(2);
    expect(t.firstDial).toBeNull();
  });
});
