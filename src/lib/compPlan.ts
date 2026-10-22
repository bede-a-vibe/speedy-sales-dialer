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
