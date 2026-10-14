export type ClientStream = "google_ads" | "meta_ads" | "seo" | "web" | "social" | "other";
export type BillingPeriod = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually" | "one_off";
export type ClientDealStatus = "active" | "paused" | "churned";

export const STREAM_LABELS: Record<ClientStream, string> = {
  google_ads: "Google Ads",
  meta_ads: "Meta Ads",
  seo: "SEO",
  web: "Web",
  social: "Social",
  other: "Other",
};

export const STREAM_ORDER: ClientStream[] = ["google_ads", "meta_ads", "seo", "web", "social", "other"];

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
  one_off: "One-off",
};

export interface ClientDealLike {
  amount: number | string;
  billing_period: BillingPeriod | string;
  status: ClientDealStatus | string;
  start_date: string;
  end_date: string | null;
  paused_at?: string | null;
}

export function toMonthly(amount: number, billing_period: BillingPeriod | string): number {
  const a = Number(amount) || 0;
  switch (billing_period) {
    case "weekly": return a * (52 / 12);
    case "fortnightly": return a * (26 / 12);
    case "monthly": return a;
    case "quarterly": return a / 3;
    case "annually": return a / 12;
    case "one_off": return 0;
    default: return 0;
  }
}

export function dealMrr(deal: ClientDealLike): number {
  // Churned = gone, paused = temporarily not billing — neither counts toward current MRR.
  if (deal.status === "churned" || deal.status === "paused") return 0;
  return toMonthly(Number(deal.amount) || 0, deal.billing_period);
}

/** Would-be monthly value ignoring churn status — used to total the MRR lost to churn. */
export function grossMonthly(deal: ClientDealLike): number {
  return toMonthly(Number(deal.amount) || 0, deal.billing_period);
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function monthsBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  const days = (db.getTime() - da.getTime()) / MS_PER_DAY;
  return Math.max(0, days / 30.44);
}

/** Whole calendar months from a→b, counting only anniversaries actually reached. */
export function calendarMonthsBetween(a: Date, b: Date): number {
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(0, months);
}

const PERIOD_DAYS: Partial<Record<BillingPeriod, number>> = { weekly: 7, fortnightly: 14 };
const PERIOD_MONTHS: Partial<Record<BillingPeriod, number>> = { monthly: 1, quarterly: 3, annually: 12 };

/**
 * How many times the client has actually been invoiced.
 *
 * Odin bills the first period UP FRONT: a client who signed this morning has
 * already paid once. Revenue was previously prorated by elapsed fraction of a
 * month, so a deal signed today reported $32 of a $4,000 retainer and one
 * signed three days ago reported $426. Those are not real numbers — nobody is
 * invoiced by the hour.
 *
 * The two ends mean different things, which is why they are counted
 * differently:
 *  - An ENDED deal's end_date is the day billing stopped, i.e. the day after
 *    the last paid period. Payments = whole periods between start and end.
 *  - A LIVE deal is inside a period it has already paid for, so payments =
 *    elapsed periods + 1.
 */
export function billedPeriods(deal: ClientDealLike, now: Date = new Date()): number {
  const start = new Date(deal.start_date);
  if (isNaN(start.getTime()) || start > now) return 0;

  const stops: Date[] = [now];
  if (deal.end_date) stops.push(new Date(deal.end_date));
  if ((deal.status === "paused" || deal.status === "churned") && deal.paused_at) {
    stops.push(new Date(deal.paused_at));
  }
  const valid = stops.filter((d) => !isNaN(d.getTime()));
  const effectiveEnd = valid.reduce((min, d) => (d < min ? d : min), now);
  const ended = effectiveEnd < now;

  const months = PERIOD_MONTHS[deal.billing_period as BillingPeriod];
  if (months) {
    const elapsed = Math.floor(calendarMonthsBetween(start, effectiveEnd) / months);
    return ended ? Math.max(1, elapsed) : elapsed + 1;
  }

  const days = PERIOD_DAYS[deal.billing_period as BillingPeriod];
  if (days) {
    const elapsed = Math.floor((effectiveEnd.getTime() - start.getTime()) / MS_PER_DAY / days);
    return ended ? Math.max(1, elapsed) : elapsed + 1;
  }

  return 1;
}

export function dealRevenueToDate(deal: ClientDealLike, now: Date = new Date()): number {
  const amount = Number(deal.amount) || 0;
  const start = new Date(deal.start_date);
  if (isNaN(start.getTime()) || start > now) return 0;
  // A one-off is collected once, on day one.
  if (deal.billing_period === "one_off") return amount;
  // amount is the per-period price, so this is cash invoiced — never normalise
  // to monthly here or a weekly deal's revenue silently quadruples.
  return amount * billedPeriods(deal, now);
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n || 0);
}

export function formatCurrencyCents(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n || 0);
}