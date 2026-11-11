import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Field name -> how many contacts have it captured, plus `total`. */
export type DetailCoverage = Record<string, number>;

/**
 * How many contacts have each captured-detail field set, from one server-side
 * scan (get_contact_detail_coverage). Fields come from the same whitelist the
 * queue filter uses. Pass `enabled` from the filters drawer so the dialer does
 * not run it on every load.
 */
export function useDetailCoverage(enabled = true) {
  return useQuery({
    queryKey: ["dialer-detail-coverage"],
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<DetailCoverage> => {
      const { data, error } = await supabase.rpc("get_contact_detail_coverage");
      if (error) throw error;
      return (data ?? {}) as DetailCoverage;
    },
  });
}
