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

      const [dialsRes, dealsRes] = await Promise.all([
        supabase
          .from("call_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabase
          .from("client_deals")
          .select(
            "contact_id, amount, billing_period, status, start_date, end_date, contacts:contacts!client_deals_contact_id_fkey(lead_channel, utm_campaign)",
          )
          .gte("start_date", dateFrom)
          .lte("start_date", dateTo),
      ]);
      if (dialsRes.error) throw dialsRes.error;
      if (dealsRes.error) throw dealsRes.error;

      const dials = dialsRes.count ?? 0;
      const deals = (dealsRes.data ?? []) as Array<{
        contact_id: string;
        amount: number;
        billing_period: BillingPeriod;
        status: ClientDealStatus;
        start_date: string;
        end_date: string | null;
        contacts: { lead_channel: string | null; utm_campaign: string | null } | null;
      }>;

      // Which of these contacts were ever actually dialled. One bounded query
      // rather than a per-deal count — the deal set in a range is small, and
      // call_logs is not.
      const contactIds = [...new Set(deals.map((d) => d.contact_id).filter(Boolean))];
      const dialled = new Set<string>();
      for (let i = 0; i < contactIds.length; i += 200) {
        const slice = contactIds.slice(i, i + 200);
        const { data, error } = await supabase
          .from("call_logs")
          .select("contact_id")
          .in("contact_id", slice);
        if (error) throw error;
        for (const row of data ?? []) if (row.contact_id) dialled.add(row.contact_id);
      }

      let newMrr = 0;
      let oneOffRevenue = 0;
      let dealsClosed = 0;
      let excludedDeals = 0;
      let excludedMrr = 0;

      for (const d of deals) {
        const fromDialling = dialled.has(d.contact_id) && !isAdsSourced(d.contacts);
        if (fromDialling) {
          dealsClosed += 1;
          newMrr += dealMrr(d);
          if (d.billing_period === "one_off") oneOffRevenue += Number(d.amount) || 0;
        } else {
          excludedDeals += 1;
          excludedMrr += dealMrr(d);
        }
      }

      return {
        dials,
        dealsClosed,
        newMrr,
        oneOffRevenue,
        mrrPerDial: dials > 0 ? newMrr / dials : 0,
        excludedDeals,
        excludedMrr,
      };
    },
  });
}
