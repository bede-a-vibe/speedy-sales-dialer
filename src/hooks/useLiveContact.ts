import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live view of the current lead's row so the dialer card reflects mid-call
 * captures (DM number, gatekeeper flag, marketing answers) and external
 * updates without waiting for the lead to be re-served.
 *
 * Display-only: the dial engine keeps the claim-time snapshot on purpose —
 * a DM number captured mid-call must not change the in-flight dial target.
 */
export function useLiveContact(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ["live-contact", contactId],
    enabled: Boolean(contactId),
    refetchInterval: 5_000,
    staleTime: 3_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contactId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
