import { useMemo } from "react";
import { useRepFunnelCounts } from "@/hooks/useEarningsPlan";
import { useSetterFirstDeals } from "@/hooks/useFunnelTracker";
import { clientsInWindow, observeEarnings } from "@/lib/earningsPlan";
import { dayKeyOf } from "@/lib/funnelTracker";

/** A setter's observed funnel and clients over the window; undefined until loaded. */
export function useObservedEarnings(userId: string | undefined, days: number) {
  const counts = useRepFunnelCounts(userId, days);
  const deals = useSetterFirstDeals(!!userId);
  const observed = useMemo(() => {
    if (!userId || !counts.data || !deals.data) return undefined;
    const today = dayKeyOf(new Date().toISOString());
    const since = dayKeyOf(new Date(Date.now() - days * 86_400_000).toISOString());
    const { clients, retainerTotal } = clientsInWindow(deals.data, userId, since, today);
    return observeEarnings(counts.data, clients, retainerTotal);
  }, [userId, counts.data, deals.data, days]);
  return { observed, failed: counts.isError || deals.isError };
}
