import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EarningsPlanner } from "@/components/earnings/EarningsPlanner";
import { setterMarginalCommission } from "@/lib/compPlan";
import { clientsInWindow, observeEarnings, planForTarget, projectEarnings, retainerCashForCommission } from "@/lib/earningsPlan";
import type { SetterFirstDeal } from "@/lib/funnelTracker";

const mutate = vi.fn();
vi.mock("@/hooks/useEarningsPlan", () => ({ useSaveEarningTarget: () => ({ mutate, isPending: false }) }));

const counts = { dials: 4000, active_days: 10, pickups: 800, first_bookings: 80, resolved: 80, sat: 24 };
const obs = observeEarnings(counts, 6, 18_000);

const deal = (over: Partial<SetterFirstDeal>): SetterFirstDeal => ({
  deal_id: "d", contact_id: "c", business_name: null, setter_id: "ben", billing_period: "monthly", amount: 2000, start_date: "2026-11-05", status: "active", payments: [], ...over,
});

describe("earnings plan", () => {
  it("reproduces the observed month from the observed inputs", () => {
    const p = projectEarnings({ ...obs.inputs, daysPerMonth: 10 }, 55_000);
    expect(p.bookings).toBeCloseTo(80);
    expect(p.sittings).toBeCloseTo(24);
    expect(p.clients).toBeCloseTo(6);
    expect(p.retainerCash).toBeCloseTo(18_000);
  });

  it("pays on the live brackets: nothing on the first $18k, not the whole month", () => {
    const i = { ...obs.inputs, daysPerMonth: 10 };
    expect(projectEarnings(i, 55_000).commission).toBe(0);
    const p = projectEarnings({ ...i, avgRetainer: 20_738 / 6 }, 55_000);
    expect(p.commission).toBeCloseTo((20_738 - 18_000) * 0.15, 5);
    expect(p.monthly).toBeCloseTo(55_000 / 12 + p.commission, 5);
  });

  it("pays $5,820 on $49,680, not 25% of the whole month (Bede, 23 Nov)", () => {
    const i = { dialsPerDay: 600, pickupRate: 0.2, bookingRate: 0.06, sitRate: 0.4, closeRate: 13.8 / 66.24, avgRetainer: 3600, daysPerMonth: 23 };
    const p = projectEarnings(i, 55_000);
    expect(p.retainerCash).toBeCloseTo(49_680, 4);
    expect(p.commission).toBeCloseTo(5_820, 4);
  });

  it("inverts the brackets exactly", () => {
    for (const cash of [18_500, 28_000, 33_333, 38_000, 45_000, 60_000]) {
      expect(retainerCashForCommission(setterMarginalCommission(cash).total)).toBeCloseTo(cash, 6);
    }
    expect(retainerCashForCommission(0)).toBe(0);
  });

  it("works a target back to a plan that hits it", () => {
    const target = 7_000;
    const plan = planForTarget(target, obs.inputs, 55_000);
    expect(projectEarnings({ ...obs.inputs, dialsPerDay: plan.dialsPerDay! }, 55_000).monthly).toBeCloseTo(target, 6);
    const sit = plan.alone.find((a) => a.label === "Bookings that sit")!;
    if (sit.need != null) expect(projectEarnings({ ...obs.inputs, sitRate: sit.need }, 55_000).monthly).toBeCloseTo(target, 6);
    expect(planForTarget(4_000, obs.inputs, 55_000).commissionNeeded).toBe(0);
    expect(planForTarget(4_000, obs.inputs, 55_000).reached).toBe(true);
  });

  it("says a rate can't get there alone instead of going past 100%", () => {
    const low = { ...obs.inputs, avgRetainer: 500 };
    expect(planForTarget(12_000, low, 55_000).alone.find((a) => a.label === "Bookings that sit")!.need).toBeNull();
  });

  it("does not divide by zero for a rep with no clients", () => {
    const none = observeEarnings({ ...counts, sat: 0, resolved: 0 }, 0, 0);
    const p = projectEarnings(none.inputs, 55_000);
    expect(p.monthly).toBeCloseTo(55_000 / 12);
    const plan = planForTarget(8_000, none.inputs, 55_000);
    expect([plan.clients, plan.sittings, plan.dialsPerDay]).toEqual([null, null, null]);
    expect(none.noClients && none.thin).toBe(true);
  });

  it("counts the setter's own retainer clients in the window, first-month value, one-offs left out", () => {
    const r = clientsInWindow(
      [
        deal({ deal_id: "1", contact_id: "a" }),
        deal({ deal_id: "2", contact_id: "b", first_month_amount: 4000 }),
        deal({ deal_id: "3", contact_id: "c", billing_period: "one_off", amount: 9000 }),
        deal({ deal_id: "4", contact_id: "d", setter_id: "lachlan" }),
        deal({ deal_id: "5", contact_id: "e", start_date: "2026-08-01" }),
      ],
      "ben", "2026-09-24", "2026-11-23",
    );
    expect(r).toEqual({ clients: 2, retainerTotal: 6000 });
  });

  it("lets a rep save their own target and hides the editor from a manager", () => {
    const props = { userId: "u", observed: obs, baseAnnual: 55_000, pay: null, target: null, windowDays: 60 };
    const { unmount } = render(<EarningsPlanner {...props} canEditTarget />);
    fireEvent.change(screen.getByLabelText("Monthly take-home target"), { target: { value: "$7,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save target" }));
    expect(mutate).toHaveBeenCalledWith({ userId: "u", target: 7000 }, expect.anything());
    expect(screen.getByText("What $7,000 a month takes")).toBeInTheDocument();
    unmount();
    render(<EarningsPlanner {...props} target={6500} canEditTarget={false} />);
    expect(screen.queryByRole("button", { name: "Save target" })).toBeNull();
    expect(screen.getByText("$6,500")).toBeInTheDocument();
  });
});
