import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * New clients in a date range: one row per client whose FIRST deal in the
 * revenue records starts in the range, credited to the contact's lead source
 * (public.get_new_clients). This is the single "won" rule for Insights: the
 * lead sources table, the call funnel's Closed, Dial economics and the Closing
 * tab's New clients row all read it, so they agree.
 */
export interface NewClient {
  contact_id: string;
  business_name: string | null;
  channel: string | null;
  source: string | null;
  first_start: string;
  mrr: number;
  one_off: number;
  dialled: boolean;
}

export function useNewClients(dateFrom?: string, dateTo?: string) {
  return useQuery({
    queryKey: ["new-clients", dateFrom, dateTo],
    enabled: !!dateFrom && !!dateTo,
    queryFn: async (): Promise<NewClient[]> => {
      const from = new Date(`${dateFrom}T00:00:00`);
      const to = new Date(`${dateTo}T00:00:00`);
      to.setDate(to.getDate() + 1);
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string, args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)("get_new_clients", { _from: from.toISOString(), _to: to.toISOString() });
      if (error) throw error;
      return ((data ?? []) as NewClient[]).map((r) => ({ ...r, mrr: Number(r.mrr) || 0, one_off: Number(r.one_off) || 0 }));
    },
  });
}
