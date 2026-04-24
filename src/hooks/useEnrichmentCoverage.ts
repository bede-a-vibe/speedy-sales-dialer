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
      const countNotNull = async (column: string): Promise<number> => {
        const { count, error } = await (supabase
          .from("contacts")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id", { count: "exact", head: true }) as any)
          .not(column, "is", null);
        if (error) throw error;
        return count ?? 0;
      };
      const countGt = async (column: string, value: number): Promise<number> => {
        const { count, error } = await (supabase
          .from("contacts")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id", { count: "exact", head: true }) as any)
          .gt(column, value);
        if (error) throw error;
        return count ?? 0;
      };
      const countNeq = async (column: string, value: string): Promise<number> => {
        const { count, error } = await (supabase
          .from("contacts")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("id", { count: "exact", head: true }) as any)
          .neq(column, value);
        if (error) throw error;
        return count ?? 0;
      };
      const countAll = async (): Promise<number> => {
        const { count, error } = await supabase
          .from("contacts")
          .select("id", { count: "exact", head: true });
        if (error) throw error;
        return count ?? 0;
      };

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
        countAll(),
        countNotNull("prospect_tier"),
        countNotNull("buying_signal_strength"),
        countNotNull("gbp_rating"),
        countGt("review_count", 0),
        countNotNull("work_type"),
        countNotNull("business_size"),
        countNotNull("dm_phone"),
        countNeq("has_google_ads", "unknown"),
        countNeq("has_facebook_ads", "unknown"),
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
