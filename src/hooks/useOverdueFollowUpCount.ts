import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Open follow-ups assigned to this user that are past their due time. Drives the sidebar badge. */
export function useOverdueFollowUpCount(userId: string | undefined) {
  return useQuery({
    queryKey: ["overdue-follow-up-count", userId],
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pipeline_items")
        .select("id", { count: "exact", head: true })
        .eq("pipeline_type", "follow_up")
        .eq("status", "open")
        .eq("assigned_user_id", userId as string)
        .lt("scheduled_for", new Date().toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });
}
