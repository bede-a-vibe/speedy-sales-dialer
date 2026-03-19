import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useStreak(userId?: string) {
  return useQuery({
    queryKey: ["streak", userId],
    queryFn: async () => {
      if (!userId) return 0;

      // Get distinct dates with calls for this user, last 365 days
      const since = new Date();
      since.setDate(since.getDate() - 365);

      const { data, error } = await supabase
        .from("call_logs")
        .select("created_at")
        .eq("user_id", userId)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false });

      if (error || !data) return 0;

      const uniqueDays = new Set(
        data.map((r) => r.created_at.slice(0, 10))
      );

      // Count consecutive days backwards from today
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 60; i++) {
        const key = d.toISOString().slice(0, 10);
        if (uniqueDays.has(key)) {
          streak++;
        } else if (i > 0) {
          // skip today if no calls yet (allow streak to survive)
          break;
        }
        d.setDate(d.getDate() - 1);
      }

      return streak;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });
}
