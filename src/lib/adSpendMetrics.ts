/**
 * Paid-ad spend aggregation.
 *
 * Spend comes from `ad_spend` (Meta Ads Manager, daily × campaign). Outcomes
 * come from the CRM — never from the ads sheet, whose `Leads` column is 0 in
 * every row and whose `Closes` column under-records by 7.
 *
 * The two sides join on campaign name via `contacts.utm_campaign`. That field
 * is currently null for nearly every contact because the Meta destination URLs
 * carry no UTM parameters, so per-campaign revenue is mostly unknowable today.
 * That is surfaced in the UI rather than papered over with a zero — a zero
 * reads as "this campaign earned nothing", which is a different claim.
 */

export interface AdSpendRow {
  date: string;
  platform: string;
  brand: string;
  campaign_id: string | null;
  campaign_name: string;
  spend: number;
  impressions: number;
  link_clicks: number;
}

/** A client_deals row reduced to what attribution needs. */
export interface AttributedDeal {
  start_date: string;
  revenueToDate: number;
  mrr: number;
  campaign: string | null;
}

export interface AdTotals {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  clients: number;
  revenue: number;
  mrr: number;
  roas: number | null;
  cac: number | null;
}

export interface CampaignRollup {
  campaign: string;
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number | null;
  ctr: number | null;
  firstDate: string;
  lastDate: string;
  days: number;
  /** null — not 0 — when no deal could be attributed to this campaign. */
  clients: number | null;
  revenue: number | null;
  roas: number | null;
}

export interface MonthRollup {
  month: string;
  label: string;
  spend: number;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function safeDiv(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function dayCount(first: string, last: string): number {
  const a = Date.parse(first);
  const b = Date.parse(last);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Normalised for matching a deal's campaign against a spend row's campaign. */
function campaignKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function filterByBrand(rows: AdSpendRow[], brand: string): AdSpendRow[] {
  return rows.filter((r) => r.brand === brand);
}

export function computeAdTotals(rows: AdSpendRow[], deals: AttributedDeal[]): AdTotals {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  for (const r of rows) {
    spend += r.spend;
    impressions += r.impressions;
    clicks += r.link_clicks;
  }
  let revenue = 0;
  let mrr = 0;
  for (const d of deals) {
    revenue += d.revenueToDate;
    mrr += d.mrr;
  }
  return {
    spend,
    impressions,
    clicks,
    ctr: safeDiv(clicks, impressions),
    cpc: safeDiv(spend, clicks),
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    clients: deals.length,
    revenue,
    mrr,
    roas: safeDiv(revenue, spend),
    cac: safeDiv(spend, deals.length),
  };
}

export function rollupByCampaign(rows: AdSpendRow[], deals: AttributedDeal[]): CampaignRollup[] {
  // Deals that carry a campaign are the only ones that can be attributed.
  const dealsByCampaign = new Map<string, { clients: number; revenue: number }>();
  for (const d of deals) {
    if (!d.campaign) continue;
    const k = campaignKey(d.campaign);
    const cur = dealsByCampaign.get(k) ?? { clients: 0, revenue: 0 };
    cur.clients += 1;
    cur.revenue += d.revenueToDate;
    dealsByCampaign.set(k, cur);
  }

  const acc = new Map<string, CampaignRollup>();
  for (const r of rows) {
    const name = r.campaign_name.trim();
    let c = acc.get(name);
    if (!c) {
      c = {
        campaign: name,
        spend: 0,
        impressions: 0,
        clicks: 0,
        cpc: null,
        ctr: null,
        firstDate: r.date,
        lastDate: r.date,
        days: 0,
        clients: null,
        revenue: null,
        roas: null,
      };
      acc.set(name, c);
    }
    c.spend += r.spend;
    c.impressions += r.impressions;
    c.clicks += r.link_clicks;
    if (r.date < c.firstDate) c.firstDate = r.date;
    if (r.date > c.lastDate) c.lastDate = r.date;
  }

  const out = [...acc.values()];
  for (const c of out) {
    c.days = dayCount(c.firstDate, c.lastDate);
    c.cpc = safeDiv(c.spend, c.clicks);
    c.ctr = safeDiv(c.clicks, c.impressions);
    const matched = dealsByCampaign.get(campaignKey(c.campaign));
    if (matched) {
      c.clients = matched.clients;
      c.revenue = matched.revenue;
      c.roas = safeDiv(matched.revenue, c.spend);
    }
  }
  return out.sort((a, b) => b.spend - a.spend);
}

export function rollupByMonth(rows: AdSpendRow[]): MonthRollup[] {
  const acc = new Map<string, number>();
  for (const r of rows) {
    const month = r.date.slice(0, 7);
    acc.set(month, (acc.get(month) ?? 0) + r.spend);
  }
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, spend]) => {
      const mi = Number(month.slice(5, 7)) - 1;
      return {
        month,
        label: `${MONTH_LABELS[mi] ?? month.slice(5, 7)} ${month.slice(2, 4)}`,
        spend,
      };
    });
}

/** How many attributed deals carry a campaign — drives the UTM-gap warning. */
export function campaignCoverage(deals: AttributedDeal[]): { withCampaign: number; total: number } {
  return {
    withCampaign: deals.filter((d) => !!d.campaign).length,
    total: deals.length,
  };
}
