import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dealMrr, type BillingPeriod, type ClientDealStatus } from "@/lib/clientRevenue";

export interface DialEconomics {
  dials: number;
  dealsClosed: number;
  newMrr: number;
  oneOffRevenue: number;
  mrrPerDial: number;
  /** Deals that started in range but were NOT produced by dialling. */
  excludedDeals: number;
  excludedMrr: number;
}

/** An ads-sourced contact. Either marker alone is enough. */
export function isAdsSourced(c: { lead_channel: string | null; utm_campaign: string | null } | null): boolean {
  if (!c) return false;
  if (c.utm_campaign) return true;
  // Word-bounded: a bare /ads/ also matches "roadshow" and "headspace".
  return !!c.lead_channel && /\bads\b/i.test(c.lead_channel);
}

/**
 * Dollar-per-dial for COLD CALLING specifically.
 *
 * The denominator has always been cold dials, but the numerator used to be
 * every deal that started in the range — including Meta-sourced clients nobody
 * had dialled. That credits cold calling with revenue the ads bought, and the
 * error grows exactly when paid is working.
 *
 * A deal counts as produced by dialling only if the contact was actually
 * dialled at least once AND carries no ads marker. Checked against the full
 * deal set: 19 cold-call deals, every one with dials and no ads marker; 20
 * other-source deals, every one with zero dials. No overlap.
 *
 * Deals from other sources are not silently dropped — they come back as
 * excludedDeals/excludedMrr so the card can show what was left out and why.
 */
export function useDialEconomics(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["dial-economics-cold", dateFrom, dateTo],
    staleTime: 60_000,
    queryFn: async (): Promise<DialEconomics> => {
      const fromIso = new Date(`${dateFrom}T00:00:00`).toISOString();
      const toIso = new Date(`${dateTo}T23:59:59.999`).toISOString();

      const nextDay = new Date(`${dateTo}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      // Wins come from public.get_new_clients, the one "won" rule on Insights
      // (first deal starts in the range, by the contact's lead source), so this
      // card, the lead sources table and the funnel's Closed always agree. An
      // existing client adding a service is not a new deal won from dialling.
      const [dialsRes, winsRes] = await Promise.all([
        supabase
          .from("call_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
          "get_new_clients", { _from: fromIso, _to: nextDay.toISOString() },
        ),
      ]);
      if (dialsRes.error) throw dialsRes.error;
      if (winsRes.error) throw winsRes.error;
      return tallyNewClients((winsRes.data ?? []) as NewClientRow[], dialsRes.count ?? 0);
    },
  });
}

export interface DialEconomicsDeal {
  contact_id: string;
  amount: number;
  billing_period: BillingPeriod;
  status: ClientDealStatus;
  start_date: string;
  end_date: string | null;
  contacts: { lead_channel: string | null; utm_campaign: string | null } | null;
}

/**
 * Sum the deals into the card's numbers. "Deals closed" counts CLIENTS
 * (distinct contact_id), not client_deals rows: a retainer plus a one-off on
 * the same day, or two monthly lines (JR Dixon, 13 Oct), is one deal won.
 */
export function tallyDialEconomics(deals: DialEconomicsDeal[], dialled: Set<string>, dials: number): DialEconomics {
  let newMrr = 0;
  let oneOffRevenue = 0;
  let excludedMrr = 0;
  const closedContacts = new Set<string>();
  const excludedContacts = new Set<string>();

  for (const d of deals) {
    const fromDialling = dialled.has(d.contact_id) && !isAdsSourced(d.contacts);
    if (fromDialling) {
      closedContacts.add(d.contact_id);
      newMrr += dealMrr(d);
      if (d.billing_period === "one_off") oneOffRevenue += Number(d.amount) || 0;
    } else {
      excludedContacts.add(d.contact_id);
      excludedMrr += dealMrr(d);
    }
  }

  return {
    dials,
    dealsClosed: closedContacts.size,
    newMrr,
    oneOffRevenue,
    mrrPerDial: dials > 0 ? newMrr / dials : 0,
    excludedDeals: excludedContacts.size,
    excludedMrr,
  };
}

export interface NewClientRow { contact_id: string; channel: string | null; mrr: number | string; one_off: number | string }

/** Cold-call wins are new clients whose lead source is Cold Call; everything else is shown as excluded. */
export function tallyNewClients(rows: NewClientRow[], dials: number): DialEconomics {
  let newMrr = 0, oneOffRevenue = 0, excludedMrr = 0, closed = 0, excluded = 0;
  for (const r of rows) {
    const mrr = Number(r.mrr) || 0;
    if (r.channel === "Cold Call") {
      closed += 1;
      newMrr += mrr;
      oneOffRevenue += Number(r.one_off) || 0;
    } else {
      excluded += 1;
      excludedMrr += mrr;
    }
  }
  return { dials, dealsClosed: closed, newMrr, oneOffRevenue, mrrPerDial: dials > 0 ? newMrr / dials : 0, excludedDeals: excluded, excludedMrr };
}
