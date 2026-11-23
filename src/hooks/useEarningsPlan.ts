import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RepFunnelCounts } from "@/lib/earningsPlan";
import { cleanKpis, type FunnelDay, type RepGoal } from "@/lib/repGoals";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type TargetRow = { user_id: string; monthly_target: number | string | null; kpis: unknown };
type TargetTable = {
  select: (c: string) => Promise<{ data: TargetRow[] | null; error: unknown }>;
  upsert: (r: unknown, o: unknown) => Promise<{ error: unknown }>;
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

/** One setter's funnel per Melbourne day since `from`. */
export function useRepFunnelByDay(userId: string | undefined, from: string) {
  return useQuery({
    queryKey: ["rep-funnel-by-day", userId, from],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FunnelDay[]> => {
      const { data, error } = await (supabase.rpc as unknown as Rpc)("get_rep_funnel_by_day", { _user: userId, _from: from });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map((r) => {
        const n = (k: string) => Number(r[k]) || 0;
        return { day: String(r.day), dials: n("dials"), pickups: n("pickups"), first_bookings: n("first_bookings"), resolved: n("resolved"), sat: n("sat") };
      });
    },
  });
}

const monthlyOnly = (m: Map<string, RepGoal>) =>
  new Map([...m].flatMap(([id, g]) => (g.monthly == null ? [] : [[id, g.monthly] as const])));

const goalsQuery = {
  queryKey: ["rep-earning-targets"],
  staleTime: 60_000,
  queryFn: async (): Promise<Map<string, RepGoal>> => {
    const { data, error } = await targets().select("user_id, monthly_target, kpis");
    if (error) throw error;
    return new Map(
      (data ?? []).map((r) => [r.user_id, { monthly: r.monthly_target == null ? null : Number(r.monthly_target), kpis: cleanKpis(r.kpis) }] as const),
    );
  },
};

/** Goals the viewer may see: their own, or everyone's for admins and coaches. */
export function useRepGoals() {
  return useQuery(goalsQuery);
}

/** Just the monthly take-home targets, same visibility. */
export function useEarningTargets() {
  return useQuery({ ...goalsQuery, select: monthlyOnly });
}

function useSaveGoal<T extends { userId: string }>(row: (v: T) => Record<string, unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => {
      const { error } = await targets().upsert({ user_id: v.userId, ...row(v), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rep-earning-targets"] }),
  });
}

/** Save (or clear with null) the signed-in rep's own take-home target; KPI targets are left alone. */
export function useSaveEarningTarget() {
  return useSaveGoal<{ userId: string; target: number | null }>((v) => ({ monthly_target: v.target }));
}

/** Save the signed-in rep's own take-home and KPI targets together. */
export function useSaveRepGoal() {
  return useSaveGoal<{ userId: string; goal: RepGoal }>((v) => ({ monthly_target: v.goal.monthly, kpis: v.goal.kpis }));
}
