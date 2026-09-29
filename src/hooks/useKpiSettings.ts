import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RAMP, type RampBand } from "@/lib/kpiStandards";

const KEY = "ramp_bands";
type Editable = Pick<RampBand, "hoursPerDay" | "booksPerHour" | "setsPerDay" | "showRate" | "dialsPerDay" | "pickupRate" | "closeRate">;

/** Ramp bands with any admin overrides (stored by band label) applied over the defaults. */
export function useRampBands() {
  return useQuery({
    queryKey: ["kpi-settings", KEY],
    staleTime: 60_000,
    queryFn: async (): Promise<{ bands: RampBand[]; customised: boolean }> => {
      const { data, error } = await (supabase as any).from("kpi_settings").select("value").eq("key", KEY).maybeSingle();
      if (error) throw error;
      const overrides = (data?.value ?? null) as Record<string, Partial<Editable>> | null;
      if (!overrides) return { bands: RAMP, customised: false };
      return { bands: RAMP.map((b) => ({ ...b, ...(overrides[b.label] ?? {}) })), customised: true };
    },
  });
}

export function useSaveRampBands() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (overrides: Record<string, Editable> | null) => {
      const db = (supabase as any).from("kpi_settings");
      if (!overrides) {
        const { error } = await db.delete().eq("key", KEY);
        if (error) throw error;
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.upsert({ key: KEY, value: overrides, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kpi-settings"] }),
  });
}
