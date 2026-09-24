import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dealMrr, dealRevenueToDate } from "@/lib/clientRevenue";
import type { AdSpendRow, AttributedDeal } from "@/lib/adSpendMetrics";

/**
 * Spend rows for a date range, or lifetime when `from`/`to` are omitted.
 * Row count is small (one per campaign per day — a few hundred), so the whole
 * range is fetched and aggregated client-side rather than via an RPC.
 */
export function useAdSpend(from?: string, to?: string) {
  return useQuery({
    queryKey: ["ad-spend", from ?? "lifetime", to ?? "lifetime"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AdSpendRow[]> => {
      let q = supabase
        .from("ad_spend")
        .select("date, platform, brand, campaign_id, campaign_name, spend, impressions, link_clicks")
        .order("date", { ascending: true });
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((r) => ({
        date: r.date,
        platform: r.platform,
        brand: r.brand,
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        // numeric(12,2) arrives as a string over PostgREST.
        spend: Number(r.spend) || 0,
        impressions: Number(r.impressions) || 0,
        link_clicks: Number(r.link_clicks) || 0,
      }));
    },
  });
}

/**
 * Meta-sourced client deals reduced to what attribution needs.
 *
 * Cohort semantics: a deal belongs to the range if it STARTED in it, and its
 * revenue is everything that deal has produced to date — not just revenue
 * billed inside the range. Clipping revenue to the window would make every
 * recent cohort look like a failure purely because it hasn't had time to bill.
 */
export function useMetaAttributedDeals(from?: string, to?: string) {
  // Queried directly rather than through useClientDeals — the shared hook does
  // not select utm_campaign, and widening it would pull the field into every
  // other consumer for no reason.
  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["meta-attributed-deals"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_deals")
        .select("amount, billing_period, status, start_date, end_date, paused_at, contact:contacts(utm_campaign)")
        .eq("stream", "meta_ads");
      if (error) throw error;
      return data ?? [];
    },
  });

  const attributed = useMemo<AttributedDeal[]>(() => {
    return deals
      .filter((d) => {
        if (!from && !to) return true;
        if (from && d.start_date < from) return false;
        if (to && d.start_date > to) return false;
        return true;
      })
      .map((d) => ({
        start_date: d.start_date,
        revenueToDate: dealRevenueToDate(d),
        mrr: dealMrr(d),
        // Populated once Meta destination URLs carry utm_campaign.
        campaign:
          (d.contact as { utm_campaign?: string | null } | null)?.utm_campaign?.trim() || null,
      }));
  }, [deals, from, to]);

  return { deals: attributed, isLoading };
}
