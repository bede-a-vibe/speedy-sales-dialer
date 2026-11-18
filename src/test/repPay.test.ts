import { describe, expect, it } from "vitest";
import { repPayThisMonth } from "@/lib/repPay";
import type { CompPlanRow, SetterFirstDeal } from "@/lib/funnelTracker";

const plans: CompPlanRow[] = [{ user_id: "ben", role: "setter", base_annual: 36_500, plan_key: "setter_2026_marginal", active_from: null }];
const deal = (id: string, amount: number, paid: [string, number][], over: Partial<SetterFirstDeal> = {}): SetterFirstDeal => ({
  deal_id: id, contact_id: id, business_name: id, setter_id: "ben", billing_period: "monthly", amount, start_date: "2026-11-01", status: "active",
  payments: paid.map(([paid_on, a], i) => ({ id: `${id}${i}`, paid_on, amount: a, note: null })), ...over,
});

describe("repPayThisMonth", () => {
  it("pays commission on this month's paid first-month cash and shows the next bracket", () => {
    const deals = [
      deal("a", 10_000, [["2026-11-03", 10_000]]),
      deal("b", 10_000, [["2026-11-10", 10_000]]), // $20k: $2k into the 15% bracket
      deal("c", 5_000, [["2026-11-12", 5_000]], { billing_period: "one_off" }), // 5% = $250
      deal("d", 4_000, []), // awaiting
      deal("e", 4_000, [["2026-10-20", 4_000]]), // last month
    ];
    const p = repPayThisMonth(deals, plans, "ben", "2026-11-01", "2026-11-18");
    expect(p.retainerPaid).toBe(20_000);
    expect(p.oneOffPaid).toBe(5_000);
    expect(p.commission).toBeCloseTo(300 + 250, 9);
    expect(p.currentRate).toBe(0.15);
    expect(p.nextBracket).toEqual({ from: 28_000, rate: 0.18, toGo: 8_000 });
    expect(p.baseToDate).toBeCloseTo(18 * 100, 9); // $36,500 / 365 = $100 a day, 1 to 18 Nov
    expect(p.payToDate).toBeCloseTo(1_800 + 550, 9);
    expect(p.awaiting.map((a) => a.deal_id)).toEqual(["d"]);
    expect(p.awaitingTotal).toBe(4_000);
  });

  it("starts base accrual on the plan's start date", () => {
    const late: CompPlanRow[] = [{ ...plans[0], active_from: "2026-11-11" }];
    expect(repPayThisMonth([], late, "ben", "2026-11-01", "2026-11-18").baseToDate).toBeCloseTo(8 * 100, 9);
  });
});
