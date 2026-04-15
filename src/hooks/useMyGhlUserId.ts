import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Returns the current user's GHL user ID from their profile, or null. */
export function useMyGhlUserId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-ghl-user-id", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("ghl_user_id")
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.ghl_user_id ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
