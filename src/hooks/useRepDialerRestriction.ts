import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Manager-set dialling scope per rep.
 *
 * A new setter starts on one industry. The restriction is enforced in the
 * database — both claim_dialer_leads and get_dialer_queue_count intersect
 * whatever the client sends with this allow-list — so the UI here is about
 * making the scope visible, not about enforcing it.
 */
export interface RepDialerRestriction {
  user_id: string;
  allowed_industries: string[];
  active: boolean;
  note: string | null;
  updated_at: string;
}

/** The signed-in rep's own scope, or null when unrestricted. */
export function useMyDialerRestriction() {
  return useQuery({
    queryKey: ["my-dialer-restriction"],
    staleTime: 60_000,
    queryFn: async (): Promise<RepDialerRestriction | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data, error } = await supabase
        .from("rep_dialer_restrictions")
        .select("user_id, allowed_industries, active, note, updated_at")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data || !data.active || (data.allowed_industries ?? []).length === 0) return null;
      return data as RepDialerRestriction;
    },
  });
}

/** Every rep's scope — managers only (RLS returns nothing for others). */
export function useAllDialerRestrictions() {
  return useQuery({
    queryKey: ["all-dialer-restrictions"],
    staleTime: 30_000,
    queryFn: async (): Promise<RepDialerRestriction[]> => {
      const { data, error } = await supabase
        .from("rep_dialer_restrictions")
        .select("user_id, allowed_industries, active, note, updated_at");
      if (error) throw error;
      return (data ?? []) as RepDialerRestriction[];
    },
  });
}

export function useSetDialerRestriction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { user_id: string; allowed_industries: string[]; active: boolean; note?: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("rep_dialer_restrictions").upsert(
        {
          user_id: r.user_id,
          allowed_industries: r.allowed_industries,
          active: r.active,
          note: r.note ?? null,
          updated_by: auth.user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-dialer-restrictions"] });
      qc.invalidateQueries({ queryKey: ["my-dialer-restriction"] });
    },
  });
}
