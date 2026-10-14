import { describe, expect, it } from "vitest";
import { billedPeriods, calendarMonthsBetween, dealRevenueToDate } from "@/lib/clientRevenue";

const NOW = new Date("2026-10-09T12:00:00+11:00");
const deal = (o: Partial<Parameters<typeof dealRevenueToDate>[0]> = {}) => ({
  amount: 4000, billing_period: "monthly", status: "active",
  start_date: "2026-10-09", end_date: null, ...o,
}) as Parameters<typeof dealRevenueToDate>[0];

describe("first period is billed up front", () => {
  it("a client who signed today has already paid once", () => {
    // Was $32 on the Clients page — a prorated fraction of a day.
    expect(dealRevenueToDate(deal(), NOW)).toBe(4000);
  });

  it("three days in is still one payment, not a third of one", () => {
    expect(dealRevenueToDate(deal({ start_date: "2026-10-06" }), NOW)).toBe(4000);
  });

  it("bills again only once the monthly anniversary is reached", () => {
    // 8 Sep → 9 Oct: anniversary passed, so two invoices.
    expect(dealRevenueToDate(deal({ start_date: "2026-09-08" }), NOW)).toBe(8000);
    // 10 Sep → 9 Oct: one day short, so still one.
    expect(dealRevenueToDate(deal({ start_date: "2026-09-10" }), NOW)).toBe(4000);
  });
});

describe("ended deals count paid periods, not elapsed-plus-one", () => {
  it("end_date is the day billing stopped, so it is exclusive", () => {
    // Two months paid from 1 Jun means paid through 31 Jul, stops 1 Aug.
    const churned = deal({
      amount: 2200, start_date: "2026-06-01", end_date: "2026-08-01", status: "churned",
    });
    expect(billedPeriods(churned, NOW)).toBe(2);
    expect(dealRevenueToDate(churned, NOW)).toBe(4400);
  });

  it("a client who churned inside their first month still paid once", () => {
    const churned = deal({ start_date: "2026-09-20", end_date: "2026-10-01", status: "churned" });
    expect(dealRevenueToDate(churned, NOW)).toBe(4000);
  });

  it("a paused deal stops accruing at paused_at", () => {
    const paused = deal({
      amount: 1000, start_date: "2026-06-01", status: "paused", paused_at: "2026-08-01",
    });
    expect(dealRevenueToDate(paused, NOW)).toBe(2000);
  });
});

describe("cadences other than monthly", () => {
  it("a weekly deal bills weekly and is never normalised to months", () => {
    // 4 whole weeks elapsed + the up-front week = 5 invoices of $500.
    expect(dealRevenueToDate(
      deal({ amount: 500, billing_period: "weekly", start_date: "2026-09-11" }), NOW,
    )).toBe(2500);
  });

  it("a quarterly deal bills once per three months", () => {
    expect(billedPeriods(
      deal({ billing_period: "quarterly", start_date: "2026-04-09" }), NOW,
    )).toBe(3);
  });

  it("a one-off is collected once regardless of age", () => {
    expect(dealRevenueToDate(
      deal({ amount: 9900, billing_period: "one_off", start_date: "2025-01-01" }), NOW,
    )).toBe(9900);
  });
});

describe("edges", () => {
  it("a future start has not been invoiced", () => {
    expect(dealRevenueToDate(deal({ start_date: "2026-12-01" }), NOW)).toBe(0);
    expect(billedPeriods(deal({ start_date: "2026-12-01" }), NOW)).toBe(0);
  });

  it("an unparseable date yields zero rather than NaN", () => {
    const r = dealRevenueToDate(deal({ start_date: "not-a-date" }), NOW);
    expect(Number.isNaN(r)).toBe(false);
    expect(r).toBe(0);
  });

  it("counts only anniversaries actually reached", () => {
    expect(calendarMonthsBetween(new Date("2026-01-31"), new Date("2026-02-28"))).toBe(0);
    expect(calendarMonthsBetween(new Date("2026-01-15"), new Date("2026-03-15"))).toBe(2);
    expect(calendarMonthsBetween(new Date("2026-03-15"), new Date("2026-01-15"))).toBe(0);
  });
});
