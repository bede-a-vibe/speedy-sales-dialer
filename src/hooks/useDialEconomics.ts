import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dealMrr, type BillingPeriod, type ClientDealStatus } from "@/lib/clientRevenue";

export interface DialEconomics {
  dials: number;
  dealsClosed: number;
  newMrr: number;
  oneOffRevenue: number;
  mrrPerDial: number;
}

/**
 * Dollar-per-dial over a rolling window: new MRR won ÷ dials placed.
 * Dials = call_logs in the window; new MRR = client_deals that started in it.
 * Insights is admin/coach-gated, so all reps' dials + deals are visible.
 */
export function useDialEconomics(days: number) {
  return useQuery({
    queryKey: ["dial-economics", days],
    staleTime: 60_000,
    queryFn: async (): Promise<DialEconomics> => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceIso = since.toISOString();
      const sinceDate = sinceIso.slice(0, 10);

      const [dialsRes, dealsRes] = await Promise.all([
        supabase
          .from("call_logs")
          .select("id", { count: "exact", head: true })
          .gte("created_at", sinceIso),
        supabase
          .from("client_deals")
          .select("amount, billing_period, status, start_date, end_date")
          .gte("start_date", sinceDate),
      ]);
      if (dialsRes.error) throw dialsRes.error;
      if (dealsRes.error) throw dealsRes.error;

      const dials = dialsRes.count ?? 0;
      const deals = (dealsRes.data ?? []) as {
        amount: number; billing_period: BillingPeriod; status: ClientDealStatus;
        start_date: string; end_date: string | null;
      }[];

      let newMrr = 0;
      let oneOffRevenue = 0;
      for (const d of deals) {
        newMrr += dealMrr(d);
        if (d.billing_period === "one_off") oneOffRevenue += Number(d.amount) || 0;
      }

      return {
        dials,
        dealsClosed: deals.length,
        newMrr,
        oneOffRevenue,
        mrrPerDial: dials > 0 ? newMrr / dials : 0,
      };
    },
  });
}
