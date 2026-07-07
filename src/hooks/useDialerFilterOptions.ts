import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DialerFilterOption = { value: string; count: number };

export type DialerFilterOptions = {
  industries: DialerFilterOption[];
  channels: DialerFilterOption[];
  states: DialerFilterOption[];
};

const EMPTY: DialerFilterOptions = { industries: [], channels: [], states: [] };

/**
 * Distinct industry / channel / state values (with counts) present in the
 * dialable pool. Powers the dialer filter dropdowns so options always reflect
 * real data instead of a static list.
 */
export function useDialerFilterOptions() {
  return useQuery({
    queryKey: ["dialer-filter-options"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<DialerFilterOptions> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("get_dialer_filter_options");
      if (error) throw error;
      const d = (data ?? {}) as Partial<DialerFilterOptions>;
      return {
        industries: d.industries ?? [],
        channels: d.channels ?? [],
        states: d.states ?? [],
      };
    },
    placeholderData: EMPTY,
  });
}