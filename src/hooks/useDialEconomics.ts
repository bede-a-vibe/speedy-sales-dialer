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
 * Dollar-per-dial over a date range: new MRR won ÷ dials placed.
 * Dials = call_logs in the range; new MRR = client_deals that started in it.
 * Insights is admin/coach-gated, so all reps' dials + deals are visible.
 */
export function useDialEconomics(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["dial-economics", dateFrom, dateTo],
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
          .select("amount, billing_period, status, start_date, end_date")
          .gte("start_date", dateFrom)
          .lte("start_date", dateTo),
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
