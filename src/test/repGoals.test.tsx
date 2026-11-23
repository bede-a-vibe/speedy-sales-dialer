import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GoalTargets } from "@/components/goals/GoalTargets";
import { WhatIfPlanner } from "@/components/goals/WhatIfPlanner";
import { observeEarnings, projectEarnings } from "@/lib/earningsPlan";
import { cleanKpis, GOAL_METRICS, improvementCurve, leverGains, metricOf, metricValue, mondayOf, monthlyCommission, niceTicks, parseMetric, sumFunnel, weeklyMetric, type FunnelDay } from "@/lib/repGoals";
import { DEFAULT_CONFIG, targetsFor } from "@/lib/teamTargets";
import type { SaleCommission } from "@/lib/funnelTracker";

const mutate = vi.fn();
vi.mock("@/hooks/useEarningsPlan", () => ({ useSaveRepGoal: () => ({ mutate, isPending: false }) }));

const counts = { dials: 17_000, active_days: 40, pickups: 3_800, first_bookings: 200, resolved: 190, sat: 66 };
const obs = observeEarnings(counts, 14, 14 * 3_000);
const own = obs.inputs;
const day = (d: string, over: Partial<FunnelDay> = {}): FunnelDay => ({ day: d, dials: 400, pickups: 80, first_bookings: 4, resolved: 4, sat: 1, ...over });

describe("goals maths", () => {
  it("reads what a rep types", () => {
    const pct = metricOf("sitRate");
    expect(parseMetric(pct, "40%")).toBeCloseTo(0.4);
    expect(parseMetric(pct, "")).toBeNull();
    expect(parseMetric(pct, "140")).toBeUndefined();
    expect(parseMetric(pct, "abc")).toBeUndefined();
    expect(parseMetric(metricOf("avgRetainer"), "$2,500")).toBe(2500);
    expect(cleanKpis({ sitRate: 0.4, closeRate: 3, junk: 1, dialsPerDay: "500" })).toEqual({ sitRate: 0.4, dialsPerDay: 500 });
    expect(cleanKpis(null)).toEqual({});
  });

  it("never calls a handful of results a rate", () => {
    const few = { ...counts, resolved: 2, sat: 2 };
    expect(metricValue("sitRate", few)).toBeNull();
    expect(metricValue("closeRate", few, 1)).toBeNull();
    expect(metricValue("sitRate", counts)).toBeCloseTo(66 / 190);
    expect(metricValue("dialsPerDay", { ...counts, active_days: 0 })).toBeNull();
  });

  it("rolls days into Monday weeks and leaves empty weeks blank", () => {
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    const w = weeklyMetric([day("2026-11-16"), day("2026-11-17", { sat: 3 }), day("2026-11-23", { dials: 500 })], "dialsPerDay", "2026-11-23", 3);
    expect(w.map((x) => x.week)).toEqual(["2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(w.map((x) => x.value)).toEqual([null, 400, 500]);
    expect(sumFunnel([day("a"), day("b", { dials: 0 })]).active_days).toBe(1);
  });

  it("draws the curve through the rep's own point, on the live brackets", () => {
    for (const m of GOAL_METRICS) {
      const c = improvementCurve(m.key, own, own, 55_000, "monthly", undefined, 400);
      expect(c[0].x).toBeLessThan(own[m.key]);
      expect(c[c.length - 1].x).toBeGreaterThan(own[m.key]);
      for (const p of [c[0], c[200], c[400]]) expect(p.now).toBeCloseTo(projectEarnings({ ...own, [m.key]: p.x }, 55_000).monthly, 6);
      if (m.kind === "pct") expect(c[c.length - 1].x).toBeLessThanOrEqual(1);
    }
    const none = observeEarnings(counts, 0, 0).inputs;
    const zero = improvementCurve("avgRetainer", none, none, 55_000, "monthly", undefined);
    expect(zero.every((p) => Number.isFinite(p.x) && Number.isFinite(p.now))).toBe(true);
  });

  it("values each lever on its own, to the target or one step up", () => {
    const g = leverGains(own, { sitRate: 0.5, dialsPerDay: 10 }, 55_000, "monthly");
    const sit = g.find((x) => x.key === "sitRate")!;
    expect(sit.toTarget).toBe(true);
    expect(sit.gain).toBeCloseTo(projectEarnings({ ...own, sitRate: 0.5 }, 55_000).monthly - projectEarnings(own, 55_000).monthly, 6);
    const dials = g.find((x) => x.key === "dialsPerDay")!;
    expect(dials.toTarget).toBe(false); // already past it
    expect(dials.to).toBeCloseTo(own.dialsPerDay + 50, 6);
    expect(leverGains(observeEarnings(counts, 0, 0).inputs, {}, 55_000, "clients").every((x) => x.gain === 0)).toBe(true);
  });

  it("lists every month from the first paid one, empty ones included", () => {
    const sale = (month: string, commission: number) => ({ month, commission, retainer: 1000, oneOff: 0 }) as SaleCommission;
    expect(monthlyCommission([sale("2026-10-01", 300), sale("2026-12-01", 50), sale("2026-12-01", 25)], "2026-09-28", "2027-01-01").map((m) => [m.month, m.commission, m.sales])).toEqual([
      ["2026-10-01", 300, 1], ["2026-11-01", 0, 0], ["2026-12-01", 75, 2], ["2027-01-01", 0, 0],
    ]);
    expect(monthlyCommission([], "2026-09-28", "2026-11-01").map((m) => m.month)).toEqual(["2026-11-01"]);
    expect(niceTicks(0.174, 0.72, 6)).toEqual([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    expect(niceTicks(4000, 14_200)).toEqual([5000, 7500, 10_000, 12_500]);
    expect(monthlyCommission([], null, "2026-11-01")).toHaveLength(1);
  });
});

describe("goals screens", () => {
  const props = {
    userId: "u", name: "Ben", goal: { monthly: 6000, kpis: { sitRate: 0.4 } }, observed: obs,
    month: { counts, clients: 2, retainerTotal: 5000 }, baseAnnual: 55_000, managerTargets: targetsFor(DEFAULT_CONFIG, "u").t,
    days: [], today: "2026-11-23", windowDays: 60,
  };

  it("saves the rep's own targets as fractions and blocks a bad one", () => {
    render(<GoalTargets {...props} canEdit />);
    const save = screen.getByRole("button", { name: "Save targets" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Bookings that sit target"), { target: { value: "140" } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Bookings that sit target"), { target: { value: "45" } });
    fireEvent.change(screen.getByLabelText("Dials a day target"), { target: { value: "500" } });
    fireEvent.click(save);
    expect(mutate).toHaveBeenCalledWith({ userId: "u", goal: { monthly: 6000, kpis: { sitRate: 0.45, dialsPerDay: 500 } } }, expect.anything());
  });

  it("is read only for a manager", () => {
    render(<GoalTargets {...props} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Save targets" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Ben's targets")).toBeInTheDocument();
  });

  it("applies the rep's targets to the what-if and resets", () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
    render(<WhatIfPlanner observed={obs} baseAnnual={55_000} goal={props.goal} />);
    expect(screen.getAllByText("at your current pace")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "My targets" }));
    expect(screen.queryByText("at your current pace")).toBeNull();
    expect(screen.getAllByText(/^was \$/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getAllByText("at your current pace")).toHaveLength(4);
  });
});
