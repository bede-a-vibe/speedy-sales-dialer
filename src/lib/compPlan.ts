/**
 * The Growth Consultant (setter) commission plan as issued in the Letter of Offer,
 * 26 Sep 2026. Commission is paid on month-one revenue, cash collected, and only once
 * the month clears the threshold. A tier is reached on deals OR its revenue equivalent,
 * whichever is met first, and the higher tier applies.
 */
export interface CommissionTier {
  minDeals: number;
  minRevenue: number;
  rate: number;
  label: string;
}

export interface CompPlan {
  name: string;
  baseSalary: number;
  /** Paid working days a month after public holidays and leave (223 / 12). */
  workingDaysPerMonth: number;
  tiers: CommissionTier[];
}

export const SETTER_PLAN: CompPlan = {
  name: "Growth Consultant (setter)",
  baseSalary: 55_000,
  workingDaysPerMonth: 18.6,
  tiers: [
    { minDeals: 10, minRevenue: 18_000, rate: 0.15, label: "10 to 15 deals" },
    { minDeals: 16, minRevenue: 28_800, rate: 0.18, label: "16 to 20 deals" },
    { minDeals: 21, minRevenue: 37_800, rate: 0.21, label: "21 to 25 deals" },
    { minDeals: 26, minRevenue: 46_800, rate: 0.25, label: "26+ deals" },
  ],
};

/** The tier a month lands in, or null below the threshold. */
export function tierFor(plan: CompPlan, deals: number, revenue: number): CommissionTier | null {
  let hit: CommissionTier | null = null;
  for (const t of plan.tiers) {
    if (deals >= t.minDeals || revenue >= t.minRevenue) hit = t;
  }
  return hit;
}

export function commissionFor(plan: CompPlan, deals: number, revenue: number) {
  const tier = tierFor(plan, deals, revenue);
  return { tier, commission: tier ? revenue * tier.rate : 0 };
}

/**
 * plan_key 'setter_2026_marginal' (rep_comp_plans), the way Bede pays it: each
 * band of the setter's first-month retainer cash in a calendar month earns its
 * own rate, so nothing is paid on the first $18k. One-off / project cash earns a
 * flat 5%. October 2026 check: $39,000 retainer + $5,000 project = $3,510 + $250.
 */
export const SETTER_2026_MARGINAL_BANDS: { from: number; to: number; rate: number }[] = [
  { from: 0, to: 18_000, rate: 0 },
  { from: 18_000, to: 28_000, rate: 0.15 },
  { from: 28_000, to: 38_000, rate: 0.18 },
  { from: 38_000, to: 48_000, rate: 0.21 },
  { from: 48_000, to: Number.POSITIVE_INFINITY, rate: 0.25 },
];
export const SETTER_2026_ONE_OFF_RATE = 0.05;

export function setterMarginalCommission(retainerCash: number, oneOffCash = 0) {
  let retainer = 0;
  for (const band of SETTER_2026_MARGINAL_BANDS) {
    if (retainerCash <= band.from) break;
    retainer += (Math.min(retainerCash, band.to) - band.from) * band.rate;
  }
  const oneOff = Math.max(0, oneOffCash) * SETTER_2026_ONE_OFF_RATE;
  return { retainer, oneOff, total: retainer + oneOff };
}
