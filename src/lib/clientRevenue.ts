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
  billing_period: BillingPeriod;
  status: ClientDealStatus;
  start_date: string;
  end_date: string | null;
}

export function toMonthly(amount: number, billing_period: BillingPeriod): number {
  const a = Number(amount) || 0;
  switch (billing_period) {
    case "weekly": return a * (52 / 12);
    case "fortnightly": return a * (26 / 12);
    case "monthly": return a;
    case "quarterly": return a / 3;
    case "annually": return a / 12;
    case "one_off": return 0;
  }
}

export function dealMrr(deal: ClientDealLike): number {
  if (deal.status === "churned") return 0;
  return toMonthly(Number(deal.amount) || 0, deal.billing_period);
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function monthsBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  const days = (db.getTime() - da.getTime()) / MS_PER_DAY;
  return Math.max(0, days / 30.44);
}

export function dealRevenueToDate(deal: ClientDealLike, now: Date = new Date()): number {
  const amount = Number(deal.amount) || 0;
  const start = new Date(deal.start_date);
  if (isNaN(start.getTime()) || start > now) return 0;
  const end = deal.end_date ? new Date(deal.end_date) : now;
  const effectiveEnd = end > now ? now : end;
  if (deal.billing_period === "one_off") {
    return amount;
  }
  const monthly = toMonthly(amount, deal.billing_period);
  return monthly * monthsBetween(start, effectiveEnd);
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n || 0);
}

export function formatCurrencyCents(n: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n || 0);
}