import { describe, expect, it } from "vitest";
import { tierFor, NO_SHOW_REASONS, getOutcomeReasonLabel } from "@/lib/appointments";
import { setterMarginalCommission } from "@/lib/compPlan";
import {
  addsUp,
  awaitingPayment,
  paidCommissionCash,
  bookingMethodOf,
  bookingTierOf,
  buildDailyTrackerStats,
  calendarBucketOf,
  creditNewClients,
  daysBetween,
  defaultMonthOpen,
  defaultWeekOpen,
  bracketLabel,
  monthCommission,
  saleCommissions,
  splitAcrossBrackets,
  sumTrackerStats,
  tierSplitOf,
  trackerDefaultFrom,
  weeksOf,
  type CompPlanRow,
  objectionsAddUp,
  type NewClientWithCredit,
  type SetterFirstDeal,
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

describe("commission per sale", () => {
  const plans: CompPlanRow[] = [
    { user_id: BEN, role: "setter", base_annual: 36_500, plan_key: "setter_2026_marginal", active_from: null },
    { user_id: LACHLAN, role: "setter", base_annual: 36_500, plan_key: "setter_2026_marginal", active_from: null },
  ];
  const sale = (contact_id: string, first_start: string, mrr: number, one_off = 0, setter_id: string | null = BEN): NewClientWithCredit => ({
    contact_id, business_name: contact_id, channel: "Cold Call", source: null, first_start, mrr, one_off, dialled: true, setter_id, tier: null,
  });
  // Bede's October method for Ben: $39k retainer + one $5k project.
  const october = [
    sale("o1", "2026-10-02", 8_000),
    sale("o2", "2026-10-06", 8_000, 5_000),
    sale("o3", "2026-10-09", 4_000), // $16k to $20k: crosses into 15%
    sale("o4", "2026-10-14", 9_120),
    sale("o5", "2026-10-20", 6_880), // $29,120 to $36k: 18%
    sale("o6", "2026-10-28", 3_000), // $36k to $39k: crosses into 21%
  ];

  it("splits a sale that crosses a bracket line", () => {
    expect(splitAcrossBrackets(16_000, 4_000)).toEqual([{ rate: 0, amount: 2_000 }, { rate: 0.15, amount: 2_000 }]);
    const [, , o3] = saleCommissions(october, plans);
    expect(o3.runningBefore).toBe(16_000);
    expect(o3.runningAfter).toBe(20_000);
    expect(o3.commission).toBeCloseTo(300, 9); // 15% x $2k
    expect(bracketLabel(o3)).toBe("0% / 15%");
    const o6 = saleCommissions(october, plans)[5];
    expect(bracketLabel(o6)).toBe("18% / 21%");
    expect(o6.commission).toBeCloseTo(0.18 * 2_000 + 0.21 * 1_000, 9);
  });

  it("Bede's October fixture gives $3,760 and the sales add up to the month", () => {
    const sales = saleCommissions(october, plans);
    const retainer = sales.reduce((t, x) => t + x.retainerCommission, 0);
    const total = sales.reduce((t, x) => t + x.commission, 0);
    expect(retainer).toBeCloseTo(3_510, 9);
    expect(total).toBeCloseTo(3_760, 9);
    expect(monthCommission(october, plans, "2026-10-01").total).toBeCloseTo(total, 9);
    expect(setterMarginalCommission(39_000, 5_000).total).toBeCloseTo(total, 9);
  });

  it("per-sale amounts sum to the month total per setter, in date order whatever the input order", () => {
    const mixed = [...october].reverse().concat([sale("l1", "2026-10-05", 12_000, 0, LACHLAN), sale("l2", "2026-10-05", 10_000, 2_000, LACHLAN)]);
    const sales = saleCommissions(mixed, plans);
    expect(sales.filter((x) => x.setter_id === BEN).map((x) => x.contact_id)).toEqual(["o1", "o2", "o3", "o4", "o5", "o6"]);
    const month = monthCommission(mixed, plans, "2026-10-01");
    for (const uid of [BEN, LACHLAN]) {
      const perSale = sales.filter((x) => x.setter_id === uid).reduce((t, x) => t + x.commission, 0);
      expect(month.perSetter.get(uid)).toBeCloseTo(perSale, 9);
    }
    // Lachlan: same day, tie-break by contact id; $22k retainer + $2k one-off.
    expect(month.perSetter.get(LACHLAN)).toBeCloseTo(setterMarginalCommission(22_000, 2_000).total, 9);
    // A new month starts the running total again.
    const nov = saleCommissions([...october, sale("n1", "2026-11-02", 5_000)], plans).find((x) => x.contact_id === "n1")!;
    expect(nov.runningBefore).toBe(0);
    expect(nov.commission).toBe(0);
  });

  it("one-off cash earns 5% flat and does not move the running total", () => {
    const sales = saleCommissions(october, plans);
    const o2 = sales[1];
    expect(o2.runningBefore).toBe(8_000);
    expect(o2.runningAfter).toBe(16_000);
    expect(o2.oneOffCommission).toBeCloseTo(250, 9);
    expect(o2.commission).toBeCloseTo(250, 9); // its retainer is all under $18k
    expect(bracketLabel(o2)).toBe("0% + 5% one-off");
    const projectOnly = saleCommissions([sale("p1", "2026-10-01", 0, 5_000), sale("p2", "2026-10-02", 20_000)], plans);
    expect(projectOnly[0].runningAfter).toBe(0);
    expect(projectOnly[1].commission).toBeCloseTo(300, 9); // 15% of $2k past $18k
  });

  it("paid marker: commission follows cash paid, capped at the first month, in the month it lands", () => {
    const deal = (id: string, contact: string, start: string, amount: number, payments: [string, number][], extra: Partial<SetterFirstDeal> = {}): SetterFirstDeal => ({
      deal_id: id, contact_id: contact, business_name: contact, setter_id: BEN, billing_period: "monthly", amount, start_date: start, status: "active",
      payments: payments.map(([paid_on, amt], i) => ({ id: `${id}-${i}`, paid_on, amount: amt, note: null })), ...extra,
    });
    // Ben's October as paid: $39k first-month retainer cash + the $5k project.
    const deals = [
      deal("astec", "astec", "2026-09-30", 2_000, [["2026-10-19", 2_000]]),
      deal("hope", "hope", "2026-10-05", 2_000, [["2026-10-05", 2_000]]),
      deal("lotron", "lotron", "2026-10-05", 4_000, [["2026-10-05", 4_000]]),
      deal("falconer", "falconer", "2026-10-09", 4_000, [], { status: "churned" }),
      deal("infuse", "infuse", "2026-10-09", 4_000, [["2026-10-09", 4_000]]),
      deal("tt", "tt", "2026-10-12", 5_000, [["2026-10-12", 5_000]], { billing_period: "one_off" }),
      deal("adelaide", "adelaide", "2026-10-12", 2_000, [["2026-10-12", 2_000]]),
      deal("pcf", "pcf", "2026-10-12", 4_000, [["2026-10-19", 4_000]]),
      deal("jrd1", "jrd", "2026-10-13", 2_000, [["2026-10-16", 2_000]]),
      deal("jrd2", "jrd", "2026-10-13", 2_000, []),
      deal("legacy", "legacy", "2026-10-13", 4_000, [["2026-10-14", 4_000]]),
      deal("bright", "bright", "2026-10-16", 2_000, []),
      deal("otolec", "otolec", "2026-10-23", 2_000, [["2026-10-23", 2_000]]),
      deal("electrolite", "electrolite", "2026-10-26", 4_000, [["2026-10-26", 4_000]]),
      deal("coat", "coat", "2026-10-29", 4_000, [["2026-10-29", 4_000]]),
      deal("select", "select", "2026-10-30", 5_000, [["2026-10-30", 5_000]]),
    ];
    const cash = paidCommissionCash(deals);
    const oct = monthCommission(cash, plans, "2026-10-01");
    expect(oct.total).toBeCloseTo(3_760, 9);
    expect(monthCommission(cash, plans, "2026-09-01").total).toBe(0); // ASTEC lands in October, when it was paid
    const astec = saleCommissions(cash, plans).find((x) => x.contact_id === "astec")!;
    expect(astec.day).toBe("2026-10-19");
    expect(astec.sale_start).toBe("2026-09-30");

    // Owed: JR Dixon's second $2k and Bright Future; churned Falconer is left out.
    const owed = awaitingPayment(deals, plans);
    expect(owed.map((x) => x.deal_id)).toEqual(["jrd2", "bright"]);
    expect(owed.reduce((t, x) => t + x.outstanding, 0)).toBe(4_000);

    // JR Dixon's second instalment paid in November lands in November.
    const later = deals.map((d) => (d.deal_id === "jrd2" ? { ...d, payments: [{ id: "p", paid_on: "2026-11-20", amount: 2_000, note: null }] } : d));
    const laterCash = paidCommissionCash(later);
    expect(monthCommission(laterCash, plans, "2026-10-01").total).toBeCloseTo(3_760, 9);
    expect(saleCommissions(laterCash, plans).find((x) => x.contact_id === "jrd" && x.month === "2026-11-01")!.retainer).toBe(2_000);

    // Payments past the first month are later months' fees: capped.
    const over = paidCommissionCash([deal("x", "x", "2026-10-01", 4_000, [["2026-10-01", 4_000], ["2026-10-31", 4_000]])]);
    expect(over.reduce((t, r) => t + r.mrr, 0)).toBe(4_000);
    // A higher first month (Bright Future: $4k, then $2k/mo) counts in full.
    const bright = deal("bf", "bf", "2026-10-16", 2_000, [["2026-11-17", 4_000]], { first_month_amount: 4_000 });
    expect(paidCommissionCash([bright])[0].mrr).toBe(4_000);
    expect(awaitingPayment([bright], plans)).toEqual([]);
    expect(awaitingPayment([{ ...bright, payments: [] }], plans)[0].outstanding).toBe(4_000);
    // Reps not on the plan are not listed.
    expect(awaitingPayment([deal("y", "y", "2026-10-01", 2_000, [], { setter_id: "someone-else" })], plans)).toEqual([]);
  });

  it("day-row commission sums to the month row, and setter cost on a day is base + that day's commission", () => {
    const days = daysBetween("2026-10-01", "2026-10-31");
    const daily = buildDailyTrackerStats({
      days, funnel: "cold", tier: "all", callLogs: [], items: [], inputs: [], productiveHours: new Map(), newClients: october, commissionCash: october, compPlans: plans,
    });
    expect(daily.get("2026-10-09")!.commission).toBeCloseTo(300, 9);
    expect(daily.get("2026-10-10")!.commission).toBe(0);
    const month = sumTrackerStats(days.map((d) => daily.get(d)!));
    expect(month.commission).toBeCloseTo(3_760, 9);
    expect(month.commission).toBeCloseTo(monthCommission(october, plans, "2026-10-01").total, 9);
    const d9 = daily.get("2026-10-09")!;
    expect(d9.setterBase + d9.commission).toBeCloseTo(200 + 300, 9); // two setters at $100 a day + $300
    // Rep filter and the ads view.
    const lachlan = buildDailyTrackerStats({
      days, funnel: "cold", tier: "all", repId: LACHLAN, callLogs: [], items: [], inputs: [], productiveHours: new Map(), newClients: october, commissionCash: october, compPlans: plans,
    });
    expect(sumTrackerStats(days.map((d) => lachlan.get(d)!)).commission).toBe(0);
    const ads = buildDailyTrackerStats({
      days, funnel: "ads", tier: "all", callLogs: [], items: [], inputs: [], productiveHours: new Map(), newClients: october, commissionCash: october, compPlans: plans,
    });
    expect(sumTrackerStats(days.map((d) => ads.get(d)!)).commission).toBe(0);
  });

  it("a range starting mid-month still runs the total from the 1st", () => {
    const days = daysBetween("2026-10-09", "2026-10-31");
    const daily = buildDailyTrackerStats({
      days, funnel: "cold", tier: "all", callLogs: [], items: [], inputs: [], productiveHours: new Map(), newClients: october, commissionCash: october, compPlans: plans,
    });
    expect(daily.get("2026-10-09")!.commission).toBeCloseTo(300, 9);
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

  it("counts qualified and not-qualified live calls, unmarked in neither", () => {
    const d = build({
      items: [
        ...items,
        booking({ scheduled_for: "2026-11-04T14:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "disqualified", is_qualified: false }),
        booking({ scheduled_for: "2026-11-04T15:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "showed_no_close", is_qualified: null }),
      ],
    }).get("2026-11-04")!;
    expect(d.live).toBe(3);
    expect(d.qualifiedLive).toBe(1);
    expect(d.notQualifiedLive).toBe(1);
  });

  it("breaks live calls that didn't close down by objection", () => {
    const d = build({
      items: [
        booking({ scheduled_for: "2026-11-04T14:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "showed_no_close", outcome_reason: "price_budget" }),
        booking({ scheduled_for: "2026-11-04T15:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "second_meeting_booked", outcome_reason: "fear" }),
        booking({ scheduled_for: "2026-11-04T16:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "no_close_follow_up", outcome_reason: "dq_too_small" }),
        booking({ scheduled_for: "2026-11-04T17:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "no_close_follow_up", outcome_reason: null }),
        booking({ scheduled_for: "2026-11-04T18:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "showed_verbal_commitment" }),
      ],
    }).get("2026-11-04")!;
    // The dq_too_small no-close is in the DQ pile, not in didn't close.
    expect(d.didntClose).toBe(2);
    expect(d.stillInPlay).toBe(1);
    expect([d.whyPrice, d.whyFear, d.whyBlank, d.whyTiming]).toEqual([1, 0, 1, 0]);
    expect(objectionsAddUp(d)).toBe(false);
  });

  it("keeps not-qualified sittings out of didn't close, and ticks when every objection is logged", () => {
    const d = build({
      items: [
        booking({ scheduled_for: "2026-11-04T14:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "showed_no_close", outcome_reason: "timing", is_qualified: true }),
        booking({ scheduled_for: "2026-11-04T15:00:00+11:00", resolved_bucket: "showed", appointment_outcome: "no_close_follow_up", outcome_reason: "price_budget", is_qualified: false }),
      ],
    }).get("2026-11-04")!;
    expect(d.notQualifiedLive).toBe(1);
    expect(d.didntClose).toBe(1);
    expect(d.whyTiming).toBe(1);
    expect(d.whyPrice).toBe(0);
    expect(objectionsAddUp(d)).toBe(true);
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

describe("tier split", () => {
  const days = daysBetween("2026-11-03", "2026-11-05");
  // Sets on 3 and 4 Nov; meetings on 4 and 5 Nov.
  const items: TrackerItem[] = [
    // Tier 1: three sets, two on the calendar sit, one cancels.
    booking({ booking_tier: "tier_1", contact_id: "t1a", created_at: "2026-11-03T10:00:00+11:00", scheduled_for: "2026-11-04T10:00:00+11:00", resolved_bucket: "showed" }),
    booking({ booking_tier: "tier_1", contact_id: "t1b", created_at: "2026-11-03T11:00:00+11:00", scheduled_for: "2026-11-04T11:00:00+11:00", resolved_bucket: "showed" }),
    booking({ booking_tier: "tier_1", contact_id: "t1c", created_at: "2026-11-04T11:00:00+11:00", scheduled_for: "2026-11-05T11:00:00+11:00", resolved_bucket: "cancelled" }),
    // Tier 2: one saved on the booking, one from the contact's team size (fallback). One sits, one no-shows.
    booking({ booking_tier: "tier_2", contact_id: "t2a", created_at: "2026-11-03T12:00:00+11:00", scheduled_for: "2026-11-04T12:00:00+11:00", resolved_bucket: "showed" }),
    booking({ booking_tier: null, contacts: { team_size: 1, monthly_revenue: null } as never, contact_id: "t2b", created_at: "2026-11-04T12:00:00+11:00", scheduled_for: "2026-11-05T12:00:00+11:00", resolved_bucket: "noshow", outcome_reason: "ns_ghosted" }),
    // Unknown: no tier and no contact details. Sits.
    booking({ booking_tier: null, contact_id: "u1", created_at: "2026-11-04T13:00:00+11:00", scheduled_for: "2026-11-05T13:00:00+11:00", resolved_bucket: "showed" }),
  ];
  const clients: NewClientWithCredit[] = [
    { contact_id: "t1a", business_name: null, channel: "Cold Call", source: null, first_start: "2026-11-04", mrr: 4_000, one_off: 2_000, dialled: true, setter_id: BEN, tier: "tier_1" },
    { contact_id: "t1b", business_name: null, channel: "Cold Call", source: null, first_start: "2026-11-05", mrr: 2_000, one_off: 0, dialled: true, setter_id: BEN, tier: "tier_1" },
    { contact_id: "t2a", business_name: null, channel: "Cold Call", source: null, first_start: "2026-11-05", mrr: 2_000, one_off: 0, dialled: true, setter_id: BEN, tier: "tier_2" },
    { contact_id: "u1", business_name: null, channel: "Cold Call", source: null, first_start: "2026-11-05", mrr: 1_500, one_off: 0, dialled: true, setter_id: BEN, tier: null },
  ];
  const daily = buildDailyTrackerStats({
    days, funnel: "cold", tier: "all", callLogs: [], items, inputs: [], productiveHours: new Map(), newClients: clients, compPlans: [],
  });
  const month = sumTrackerStats(days.map((d) => daily.get(d)!));

  it("Tier 1 + Tier 2 + unknown sets = total sets, and the percents are of total sets", () => {
    for (const d of days) {
      const s = daily.get(d)!;
      expect(s.setsT1 + s.setsT2 + s.setsUnknownTier).toBe(s.totalSets);
    }
    expect(daily.get("2026-11-03")!.setsT1).toBe(2);
    expect(daily.get("2026-11-03")!.setsT2).toBe(1);
    expect(daily.get("2026-11-04")!.setsUnknownTier).toBe(1);
    expect([month.totalSets, month.setsT1, month.setsT2, month.setsUnknownTier]).toEqual([6, 3, 2, 1]);
    expect(month.setsT1 + month.setsT2 + month.setsUnknownTier).toBe(month.totalSets);
    // 3 of 6 = 50%, 2 of 6 = 33.3%; unknown makes up the rest.
    expect((100 * month.setsT1) / month.totalSets).toBeCloseTo(50, 9);
    expect((100 * month.setsT2) / month.totalSets).toBeCloseTo(33.333, 2);
  });

  it("tier filter narrows the tier counts too", () => {
    const t1 = sumTrackerStats(days.map((d) => buildDailyTrackerStats({
      days, funnel: "cold", tier: "tier_1", callLogs: [], items, inputs: [], productiveHours: new Map(), newClients: clients, compPlans: [],
    }).get(d)!));
    expect([t1.totalSets, t1.setsT1, t1.setsT2, t1.setsUnknownTier]).toEqual([3, 3, 0, 0]);
  });

  it("works out show rate, set-to-close, live-call-to-close and cash per set within each tier", () => {
    const t1 = tierSplitOf(month, "tier_1");
    expect(t1.sets).toBe(3);
    expect(t1.bookingsOnCal).toBe(3);
    expect(t1.live).toBe(2);
    expect(t1.showRate).toBeCloseTo(66.667, 2); // 2 live of 3 on the calendar
    expect(t1.newClients).toBe(2);
    expect(t1.setToClose).toBeCloseTo(66.667, 2); // 2 clients of 3 sets
    expect(t1.liveToClose).toBe(100); // 2 clients of 2 live calls
    expect(t1.cash).toBe(8_000);
    expect(t1.avgCash).toBe(4_000);
    expect(t1.cashPerSet).toBeCloseTo(2_666.667, 2);

    const t2 = tierSplitOf(month, "tier_2");
    expect([t2.sets, t2.bookingsOnCal, t2.live, t2.newClients, t2.cash]).toEqual([2, 2, 1, 1, 2_000]);
    expect(t2.showRate).toBe(50);
    expect(t2.setToClose).toBe(50);
    expect(t2.liveToClose).toBe(100);
    expect(t2.avgCash).toBe(2_000);
    expect(t2.cashPerSet).toBe(1_000);
  });

  it("leaves unknown tier out of both columns", () => {
    expect(month.live).toBe(4);
    expect(month.liveT1 + month.liveT2).toBe(3);
    expect(month.newClients).toBe(4);
    expect(month.newClientsT1 + month.newClientsT2).toBe(3);
    expect(month.cash).toBe(11_500);
    expect(month.cashT1 + month.cashT2).toBe(10_000); // the unknown-tier $1,500 is in neither
  });

  it("divides by zero as '-' (null)", () => {
    const empty = tierSplitOf(daily.get("2026-11-03")!, "tier_2");
    expect(empty.showRate).toBeNull(); // nothing on the calendar on 3 Nov
    expect(empty.liveToClose).toBeNull();
    expect(empty.avgCash).toBeNull();
  });

  it("month totals equal the sum of their days for the new count columns", () => {
    for (const key of ["setsT1", "setsT2", "setsUnknownTier", "bookingsOnCalT1", "bookingsOnCalT2", "liveT1", "liveT2", "newClientsT1", "newClientsT2", "cashT1", "cashT2"] as const) {
      expect(month[key]).toBe(days.reduce((sum, d) => sum + daily.get(d)![key], 0));
    }
  });
});

describe("week totals", () => {
  it("splits a month into Sunday-to-Saturday weeks that stay inside the month", () => {
    const weeks = weeksOf(daysBetween("2026-11-01", "2026-11-30"));
    expect(weeks.map((w) => [w[0], w[w.length - 1]])).toEqual([
      ["2026-11-01", "2026-11-07"],
      ["2026-11-08", "2026-11-14"],
      ["2026-11-15", "2026-11-21"],
      ["2026-11-22", "2026-11-28"],
      ["2026-11-29", "2026-11-30"],
    ]);
    // October 2026 starts on a Thursday: a short first week.
    expect(weeksOf(daysBetween("2026-10-01", "2026-10-10")).map((w) => w.length)).toEqual([3, 7]);
    // A range starting mid-week starts its own week.
    expect(weeksOf(daysBetween("2026-11-03", "2026-11-09")).map((w) => w.length)).toEqual([5, 2]);
    expect(weeksOf([])).toEqual([]);
  });

  it("opens only the current week by default, or a month's only week", () => {
    expect(defaultWeekOpen("2026-11-15", "2026-11-21", "2026-11-17", 3)).toBe(true);
    expect(defaultWeekOpen("2026-11-08", "2026-11-14", "2026-11-17", 3)).toBe(false);
    expect(defaultWeekOpen("2026-09-29", "2026-09-30", "2026-11-17", 1)).toBe(true);
  });
});

describe("month stacking", () => {
  it("default range starts 1 Jan, or the first month with data if later", () => {
    expect(trackerDefaultFrom("2026-11-17")).toBe("2026-03-01"); // dials start March 2026
    expect(trackerDefaultFrom("2027-02-10")).toBe("2027-01-01");
  });
  it("months start collapsed except the current one, or a lone month", () => {
    expect(defaultMonthOpen("2026-11-01", "2026-11-01", 9)).toBe(true);
    expect(defaultMonthOpen("2026-10-01", "2026-11-01", 9)).toBe(false);
    expect(defaultMonthOpen("2026-10-01", "2026-11-01", 1)).toBe(true);
  });
});
