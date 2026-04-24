import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EnrichmentCoverage = {
  prospect_tier: number;
  buying_signal_strength: number;
  gbp_rating: number;
  review_count: number;
  work_type: number;
  business_size: number;
  dm_phone: number;
  has_google_ads_known: number;
  has_facebook_ads_known: number;
  total: number;
};

const ZERO: EnrichmentCoverage = {
  prospect_tier: 0,
  buying_signal_strength: 0,
  gbp_rating: 0,
  review_count: 0,
  work_type: 0,
  business_size: 0,
  dm_phone: 0,
  has_google_ads_known: 0,
  has_facebook_ads_known: 0,
  total: 0,
};

/**
 * Returns counts of how many contacts have each enrichment column populated.
 * Used by AdvancedFilters to show "0 contacts have this set yet" hints
 * so reps don't pick a filter that would silently zero the queue.
 *
 * Cached for 10 minutes — coverage changes slowly as enrichment data lands.
 */
export function useEnrichmentCoverage() {
  return useQuery({
    queryKey: ["dialer-filter-enrichment-coverage"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<EnrichmentCoverage> => {
      // Use a single PostgREST head request per column to get exact counts
      // without pulling rows. We run them in parallel.
      const countWhere = async (
        column: string,
        op: "not.is" | "gt" | "neq",
        value: string,
      ) => {
        let q = supabase.from("contacts").select("id", { count: "exact", head: true });
        if (op === "not.is") q = q.not(column, "is", null);
        else if (op === "gt") q = q.gt(column, value);
        else if (op === "neq") q = q.neq(column, value);
        const { count, error } = await q;
        if (error) throw error;
        return count ?? 0;
      };

      const totalQ = supabase.from("contacts").select("id", { count: "exact", head: true });

      const [
        total,
        prospect_tier,
        buying_signal_strength,
        gbp_rating,
        review_count,
        work_type,
        business_size,
        dm_phone,
        has_google_ads_known,
        has_facebook_ads_known,
      ] = await Promise.all([
        totalQ.then(({ count, error }) => {
          if (error) throw error;
          return count ?? 0;
        }),
        countWhere("prospect_tier", "not.is", ""),
        countWhere("buying_signal_strength", "not.is", ""),
        countWhere("gbp_rating", "not.is", ""),
        countWhere("review_count", "gt", "0"),
        countWhere("work_type", "not.is", ""),
        countWhere("business_size", "not.is", ""),
        countWhere("dm_phone", "not.is", ""),
        countWhere("has_google_ads", "neq", "unknown"),
        countWhere("has_facebook_ads", "neq", "unknown"),
      ]);

      return {
        total,
        prospect_tier,
        buying_signal_strength,
        gbp_rating,
        review_count,
        work_type,
        business_size,
        dm_phone,
        has_google_ads_known,
        has_facebook_ads_known,
      };
    },
    placeholderData: ZERO,
  });
}
