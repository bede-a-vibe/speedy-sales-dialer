import { describe, expect, it } from "vitest";
import { tierFor, NO_SHOW_REASONS, getOutcomeReasonLabel } from "@/lib/appointments";
import { setterMarginalCommission } from "@/lib/compPlan";
import {
  addsUp,
  bookingMethodOf,
  bookingTierOf,
  buildDailyTrackerStats,
  calendarBucketOf,
  creditNewClients,
  daysBetween,
  monthCommission,
  sumTrackerStats,
  type CompPlanRow,
  type NewClientWithCredit,
  type TrackerItem,
} from "@/lib/funnelTracker";
import { qualifierBookingFields, qualifierContactUpdate, resolveQualifier } from "@/components/pipelines/BookingQualifierFields";

const BEN = "7f855655-583c-4f70-afca-fafb327ef5db";
const LACHLAN = "79a0a291-c732-4a3f-91ff-000330d810d4";
const BEDE = "35a0fecd-0000-0000-0000-000000000000";

let seq = 0;
function booking(over: Partial<TrackerItem>): TrackerItem {
  seq += 1;
  return {
    id: `b${seq}`,
    contact_id: `c${seq}`,
    created_at: "2026-11-03T10:00:00+11:00",
    created_by: BEN,
    assigned_user_id: BEDE,
    scheduled_for: "2026-11-04T10:00:00+11:00",
    appointment_outcome: null,
    outcome_recorded_at: null,
    status: "open",
    deal_value: null,
    monthly_recurring_value: null,
    reschedule_count: 0,
    resolved_bucket: null,
    meeting_channel: "Cold Call",
    ...over,
  } as TrackerItem;
}

describe("tierFor (mirror of public.tier_for)", () => {
  it("Tier 1 needs 3+ on the tools AND $50k+ a month", () => {
    expect(tierFor(3, 50_000)).toBe("tier_1");
    expect(tierFor(8, 120_000)).toBe("tier_1");
    expect(tierFor(2, 200_000)).toBe("tier_2");
    expect(tierFor(5, 49_999)).toBe("tier_2");
  });
  it("unknown inputs stay unknown unless one input already rules Tier 1 out", () => {
    expect(tierFor(null, null)).toBeNull();
    expect(tierFor(4, null)).toBeNull();
    expect(tierFor(null, 80_000)).toBeNull();
    expect(tierFor(1, null)).toBe("tier_2");
    expect(tierFor(null, 20_000)).toBe("tier_2");
  });
});

describe("booking capture", () => {
  it("tier is auto from the inputs unless the setter overrides it", () => {
    const auto = resolveQualifier({ teamSize: "4", monthlyRevenue: "60000", tierOverride: null, method: "manual_set" });
    expect(auto.tier).toBe("tier_1");
    expect(auto.tierSource).toBe("auto");
    expect(qualifierBookingFields({ teamSize: "4", monthlyRevenue: "60000", tierOverride: "tier_2", method: "self_booked" }))
      .toEqual({ booking_tier: "tier_2", booking_tier_source: "setter", booking_method: "self_booked" });
    expect(qualifierBookingFields({ teamSize: "", monthlyRevenue: "", tierOverride: "unknown", method: "manual_set" }).booking_tier).toBeNull();
  });
  it("saves only changed contact values, with source setter and the team-size band", () => {
    const update = qualifierContactUpdate({ teamSize: "5", monthlyRevenue: "70000", tierOverride: null, method: "manual_set" }, { team_size: 5, monthly_revenue: null });
    expect(update.team_size).toBeUndefined();
    expect(update.monthly_revenue).toBe(70_000);
    expect(update.monthly_revenue_source).toBe("setter");
    const team = qualifierContactUpdate({ teamSize: "2", monthlyRevenue: "", tierOverride: null, method: "manual_set" }, null);
    expect(team.team_size).toBe(2);
    expect(team.team_size_source).toBe("setter");
    expect(team.business_size).toBe("One-man band (1-2)");
  });
  it("adds the missed-by-us no-show reason", () => {
    expect(NO_SHOW_REASONS.map((r) => r.value)).toContain("ns_missed_by_us");
    expect(getOutcomeReasonLabel("ns_missed_by_us")).toBe("We missed it (late / double-booked)");
  });
});

describe("setter_2026_marginal commission", () => {
  it("pays nothing on the first $18k, then each band at its own rate", () => {
    expect(setterMarginalCommission(18_000).total).toBe(0);
    expect(setterMarginalCommission(27_120).total).toBeCloseTo(1_368, 6); // 15% of 9,120
    expect(setterMarginalCommission(39_000).total).toBeCloseTo(3_510, 6); // 1,500 + 1,800 + 210
    expect(setterMarginalCommission(50_000).total).toBeCloseTo(1_500 + 1_800 + 2_100 + 500, 6);
  });
  it("matches Bede's October method: $3,510 + 5% of a $5,000 project = $3,760", () => {
    const c = setterMarginalCommission(39_000, 5_000);
    expect(c.oneOff).toBeCloseTo(250, 6);
    expect(c.total).toBeCloseTo(3_760, 6);
  });
  it("credits the setter of the lead's first booking and sums the calendar month per setter", () => {
    const plans: CompPlanRow[] = [
      { user_id: BEN, role: "setter", base_annual: 55_000, plan_key: "setter_2026_marginal", active_from: null },
      { user_id: LACHLAN, role: "setter", base_annual: 55_000, plan_key: "setter_2026_marginal", active_from: null },
    ];
    const base = { business_name: null, source: null, channel: "Cold Call", dialled: true };
    const clients = creditNewClients(
      [
        { ...base, contact_id: "x1", first_start: "2026-10-03", mrr: 20_000, one_off: 5_000 },
        { ...base, contact_id: "x2", first_start: "2026-10-20", mrr: 19_000, one_off: 0 },
        { ...base, contact_id: "x3", first_start: "2026-10-21", mrr: 4_000, one_off: 0 },
        { ...base, contact_id: "x4", first_start: "2026-11-02", mrr: 30_000, one_off: 0 },
      ],
      [
        { id: "h1", contact_id: "x1", created_at: "2026-09-01T00:00:00Z", created_by: BEN, booking_tier: null },
        { id: "h2", contact_id: "x1", created_at: "2026-09-20T00:00:00Z", created_by: LACHLAN, booking_tier: "tier_1" },
        { id: "h3", contact_id: "x2", created_at: "2026-10-01T00:00:00Z", created_by: BEN, booking_tier: null },
        { id: "h4", contact_id: "x3", created_at: "2026-10-01T00:00:00Z", created_by: LACHLAN, booking_tier: "tier_2" },
        { id: "h5", contact_id: "x4", created_at: "2026-10-25T00:00:00Z", created_by: BEN, booking_tier: null },
      ],
    );
    expect(clients[0].setter_id).toBe(BEN);
    expect(clients[0].tier).toBe("tier_1"); // latest booking's tier
    const oct = monthCommission(clients, plans, "2026-10-01");
    expect(oct.perSetter.get(BEN)).toBeCloseTo(3_760, 6); // $39k retainer + $5k project
    expect(oct.perSetter.get(LACHLAN) ?? 0).toBe(0); // $4k is under the $18k threshold
    expect(monthCommission(clients, plans, "2026-10-01", LACHLAN).total).toBe(0);
  });
});

describe("tracker rows", () => {
  const days = daysBetween("2026-11-03", "2026-11-05");
  const items: TrackerItem[] = [
    booking({ scheduled_for: "2026-11-04T10:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "showed_no_close", is_qualified: true }),
    booking({ scheduled_for: "2026-11-04T11:00:00+11:00", resolved_bucket: "noshow", appointment_outcome: "no_show", outcome_reason: "ns_ghosted" }),
    booking({ scheduled_for: "2026-11-04T12:00:00+11:00", resolved_bucket: "noshow", appointment_outcome: "no_show", outcome_reason: "ns_missed_by_us" }),
    booking({ scheduled_for: "2026-11-04T13:00:00+11:00", resolved_bucket: "cancelled", appointment_outcome: "cancelled" }),
    booking({ scheduled_for: "2026-11-05T09:00:00+11:00", resolved_bucket: "pending", created_at: "2026-11-04T09:00:00+11:00" }),
    booking({ scheduled_for: "2026-11-05T14:00:00+11:00", is_reschedule_slot: true, resolved_bucket: "rescheduled", appointment_outcome: "rescheduled", created_at: "2026-11-04T09:00:00+11:00" }),
    // A second meeting is not a set and not on the first-meeting calendar.
    booking({ scheduled_for: "2026-11-05T15:00:00+11:00", is_follow_up: true, resolved_bucket: "showed" }),
    // Ads booking, self-booked: only in the ads view.
    booking({ meeting_channel: "Ads", booking_method: "self_booked", booking_tier: "tier_1", scheduled_for: "2026-11-05T16:00:00+11:00" }),
  ];
  const callLogs = [
    { contact_id: "k1", outcome: "no_answer" as const, created_at: "2026-11-03T09:00:00+11:00", user_id: BEN },
    { contact_id: "k1", outcome: "booked" as const, created_at: "2026-11-03T15:00:00+11:00", user_id: BEN },
    { contact_id: "k2", outcome: "gatekeeper" as const, created_at: "2026-11-04T09:00:00+11:00", user_id: LACHLAN },
    { contact_id: "k3", outcome: "voicemail" as const, created_at: "2026-11-04T10:00:00+11:00", user_id: LACHLAN },
  ];
  const build = (over: Partial<Parameters<typeof buildDailyTrackerStats>[0]> = {}) =>
    buildDailyTrackerStats({
      days, funnel: "cold", tier: "all", callLogs, items, inputs: [], productiveHours: new Map(), newClients: [], compPlans: [], ...over,
    });

  it("missed by us is its own count, not a no-show", () => {
    const d = build().get("2026-11-04")!;
    expect(d.noShows).toBe(1);
    expect(d.missedByUs).toBe(1);
    expect(calendarBucketOf({ resolved_bucket: "noshow", outcome_reason: "ns_missed_by_us" })).toBe("missed_by_us");
  });

  it("every first-meeting slot lands in one bucket, so the day adds up", () => {
    const daily = build();
    const d4 = daily.get("2026-11-04")!;
    expect(d4.bookingsOnCal).toBe(4);
    expect([d4.live, d4.cancels, d4.noShows, d4.missedByUs, d4.pending, d4.reschedules]).toEqual([1, 1, 1, 1, 0, 0]);
    expect(addsUp(d4)).toBe(true);
    const d5 = daily.get("2026-11-05")!;
    expect(d5.bookingsOnCal).toBe(2); // pending + reschedule slot; the second meeting and the ads booking are out
    expect(d5.pending).toBe(1);
    expect(d5.reschedules).toBe(1);
    expect(addsUp(d5)).toBe(true);
    expect(addsUp({ ...d5, bookingsOnCal: 3 })).toBe(false);
  });

  it("month total is the sum of the days for counts", () => {
    const plans: CompPlanRow[] = [{ user_id: BEN, role: "setter", base_annual: 36_500, plan_key: "setter_2026_marginal", active_from: null }];
    const daily = build({
      compPlans: plans,
      inputs: [
        { day: "2026-11-03", funnel: "cold", user_id: BEN, rostered_hours: 7.5, ad_spend: null, clicks: null, leads: null },
        { day: "2026-11-04", funnel: "cold", user_id: LACHLAN, rostered_hours: 6, ad_spend: null, clicks: null, leads: null },
      ],
    });
    const month = sumTrackerStats(days.map((d) => daily.get(d)!));
    for (const key of ["dials", "answers", "totalSets", "manualSets", "bookingsOnCal", "live", "noShows", "missedByUs", "cancels", "pending", "reschedules", "rosteredHours", "availability", "setterBase"] as const) {
      expect(month[key]).toBeCloseTo(days.reduce((sum, d) => sum + daily.get(d)![key], 0), 9);
    }
    expect(month.dials).toBe(4);
    expect(month.answers).toBe(2); // booked + gatekeeper
    expect(month.leadsDialled.size).toBe(3); // a union, not a sum
    expect(month.rosteredHours).toBe(13.5);
    expect(month.setterBase).toBeCloseTo(300, 9); // $100 a day x 3 days
    expect(addsUp(month)).toBe(true);
  });

  it("blank booking method on a cold booking counts as a manual set; ads sets split by method", () => {
    expect(bookingMethodOf({ booking_method: null, meeting_channel: "Cold Call" })).toBe("manual_set");
    expect(bookingMethodOf({ booking_method: null, meeting_channel: "Ads" })).toBeNull();
    const cold = build().get("2026-11-03")!;
    expect(cold.totalSets).toBe(4);
    expect(cold.manualSets).toBe(4);
    const ads = build({ funnel: "ads" });
    const adsDay = ads.get("2026-11-03")!;
    expect(adsDay.dbsCreated).toBe(1);
    expect(adsDay.tier1Leads).toBe(1);
    expect(adsDay.dials).toBe(0); // dials sit on the cold view
  });

  it("tier filter applies to bookings, with the contact as the fallback", () => {
    expect(bookingTierOf({ booking_tier: null, contacts: { team_size: 2, monthly_revenue: null } })).toBe("tier_2");
    const t1 = build({ tier: "tier_1" }).get("2026-11-04")!;
    expect(t1.bookingsOnCal).toBe(0);
    const t1Dials = build({ tier: "tier_1" }).get("2026-11-03")!;
    expect(t1Dials.dials).toBe(2); // dials are not split by tier
  });

  it("new clients land on their first deal start day, by funnel and tier", () => {
    const clients: NewClientWithCredit[] = [
      { contact_id: "n1", business_name: null, channel: "Cold Call", source: null, first_start: "2026-11-04", mrr: 4_000, one_off: 1_000, dialled: true, setter_id: BEN, tier: "tier_1" },
      { contact_id: "n2", business_name: null, channel: "Ads", source: null, first_start: "2026-11-04", mrr: 2_000, one_off: 0, dialled: false, setter_id: null, tier: null },
    ];
    const cold = build({ newClients: clients }).get("2026-11-04")!;
    expect(cold.newClients).toBe(1);
    expect(cold.cash).toBe(5_000);
    expect(build({ newClients: clients, funnel: "ads" }).get("2026-11-04")!.newClients).toBe(1);
    expect(build({ newClients: clients, tier: "tier_2" }).get("2026-11-04")!.newClients).toBe(0);
  });
});
