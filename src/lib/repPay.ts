/**
 * A setter's pay for one calendar month, for the Dashboard: commission on
 * first-month cash paid in the month (setter_2026_marginal, same maths as the
 * Tracker's Commission by sale), how far to the next bracket, base accrued to
 * date, and the first deals still owed first-month cash.
 */
import { SETTER_2026_MARGINAL_BANDS } from "@/lib/compPlan";
import {
  awaitingPayment,
  daysBetween,
  lastDayOfMonth,
  paidCommissionCash,
  saleCommissions,
  type AwaitingPayment,
  type CompPlanRow,
  type SaleCommission,
  type SetterFirstDeal,
} from "@/lib/funnelTracker";

export interface RepPaySummary {
  setterId: string;
  /** First-month retainer cash paid this month (drives the brackets). */
  retainerPaid: number;
  /** One-off / project cash paid this month (5% flat). */
  oneOffPaid: number;
  commission: number;
  sales: SaleCommission[];
  /** Rate on the next retainer dollar. */
  currentRate: number;
  /** The next bracket up, and the paid retainer cash still needed to reach it. */
  nextBracket: { from: number; rate: number; toGo: number } | null;
  baseToDate: number;
  payToDate: number;
  awaiting: AwaitingPayment[];
  awaitingTotal: number;
}

export function repPayThisMonth(
  deals: SetterFirstDeal[],
  plans: CompPlanRow[],
  setterId: string,
  month: string,
  today: string,
): RepPaySummary {
  const plan = plans.find((p) => p.user_id === setterId);
  const sales = saleCommissions(paidCommissionCash(deals), plans, setterId).filter((s) => s.month === month);
  const retainerPaid = sales.reduce((t, s) => t + s.retainer, 0);
  const oneOffPaid = sales.reduce((t, s) => t + s.oneOff, 0);
  const commission = sales.reduce((t, s) => t + s.commission, 0);

  const band = SETTER_2026_MARGINAL_BANDS.find((b) => retainerPaid >= b.from && retainerPaid < b.to) ?? SETTER_2026_MARGINAL_BANDS[0];
  const next = SETTER_2026_MARGINAL_BANDS.find((b) => b.from > retainerPaid) ?? null;

  // Base accrues a day at a time (base ÷ 365), from the 1st or the plan start, to today.
  let baseToDate = 0;
  if (plan) {
    const from = plan.active_from && plan.active_from > month ? plan.active_from : month;
    const to = today < lastDayOfMonth(month) ? today : lastDayOfMonth(month);
    const days = from <= to ? daysBetween(from, to).length : 0;
    baseToDate = ((Number(plan.base_annual) || 0) / 365) * days;
  }

  const awaiting = awaitingPayment(deals, plans, setterId);
  return {
    setterId,
    retainerPaid,
    oneOffPaid,
    commission,
    sales,
    currentRate: band.rate,
    nextBracket: next ? { from: next.from, rate: next.rate, toGo: next.from - retainerPaid } : null,
    baseToDate,
    payToDate: baseToDate + commission,
    awaiting,
    awaitingTotal: awaiting.reduce((t, a) => t + a.outstanding, 0),
  };
}
