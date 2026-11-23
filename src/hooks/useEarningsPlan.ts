import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RepFunnelCounts } from "@/lib/earningsPlan";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type TargetTable = {
  select: (c: string) => Promise<{ data: Array<{ user_id: string; monthly_target: number | string }> | null; error: unknown }>;
  upsert: (r: unknown, o: unknown) => Promise<{ error: unknown }>;
  delete: () => { eq: (k: string, v: string) => Promise<{ error: unknown }> };
};
const targets = () => (supabase.from as unknown as (t: string) => TargetTable)("rep_earning_targets");

/** One setter's funnel counts for the window, counted on the server. */
export function useRepFunnelCounts(userId: string | undefined, days: number) {
  return useQuery({
    queryKey: ["rep-funnel-counts", userId, days],
    enabled: !!userId,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<RepFunnelCounts> => {
      const { data, error } = await (supabase.rpc as unknown as Rpc)("get_rep_funnel_counts", { _user: userId, _days: days });
      if (error) throw error;
      const r = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
      const n = (k: string) => Number(r[k]) || 0;
      return {
        dials: n("dials"), active_days: n("active_days"), pickups: n("pickups"),
        first_bookings: n("first_bookings"), resolved: n("resolved"), sat: n("sat"),
      };
    },
  });
}

/** Monthly take-home targets the viewer may see: their own, or everyone's for admins and coaches. */
export function useEarningTargets() {
  return useQuery({
    queryKey: ["rep-earning-targets"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await targets().select("user_id, monthly_target");
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.user_id, Number(r.monthly_target)] as const));
    },
  });
}

/** Save (or clear with null) the signed-in rep's own target. */
export function useSaveEarningTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, target }: { userId: string; target: number | null }) => {
      const { error } = target == null
        ? await targets().delete().eq("user_id", userId)
        : await targets().upsert({ user_id: userId, monthly_target: target, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rep-earning-targets"] }),
  });
}
