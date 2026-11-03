import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ReportContact } from "@/lib/reportMetrics";

/**
 * Contacts by call attempt count, for the lead-age penetration buckets.
 *
 * Aggregated in the database (get_contact_attempt_counts). The previous client
 * select of every contact with call_attempt_count > 0 was silently cut to 1000
 * rows by the API cap while ~14k contacts had been called, so the buckets were
 * a random sample. Expanded back to ReportContact rows so getReportMetrics is
 * unchanged; the rows are tiny and only the count field is read.
 */
export function useContactAttemptCounts() {
  return useQuery({
    queryKey: ["contacts-attempt-counts"],
    queryFn: async (): Promise<ReportContact[]> => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{
        data: { call_attempt_count: number; contacts: number }[] | null;
        error: Error | null;
      }>)("get_contact_attempt_counts");
      if (error) throw error;
      const out: ReportContact[] = [];
      for (const row of data ?? []) {
        const n = Number(row.contacts) || 0;
        for (let i = 0; i < n; i += 1) out.push({ id: "", call_attempt_count: row.call_attempt_count });
      }
      return out;
    },
    staleTime: 5 * 60_000,
  });
}
