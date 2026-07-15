import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DialpadCallStatRow {
  user_id: string | null;
  talk_time_seconds: number | null;
  total_duration_seconds: number | null;
  started_at: string | null;
  is_connected: boolean | null;
  direction: string | null;
}

/**
 * Raw Dialpad call rows (from the call-history pull) for talk-time analytics,
 * over the shared Insights date range (YYYY-MM-DD).
 * Admins/coaches see all reps' calls (per RLS); reps see their own.
 */
export function useDialpadCallStats(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["dialpad-call-stats", dateFrom, dateTo],
    staleTime: 60_000,
    queryFn: async () => {
      const fromIso = new Date(`${dateFrom}T00:00:00`).toISOString();
      const toIso = new Date(`${dateTo}T23:59:59.999`).toISOString();
      const { data, error } = await supabase
        .from("dialpad_calls")
        .select("user_id, talk_time_seconds, total_duration_seconds, started_at, is_connected, direction")
        .gte("started_at", fromIso)
        .lte("started_at", toIso)
        .not("started_at", "is", null)
        .limit(20000);
      if (error) throw error;
      return (data ?? []) as DialpadCallStatRow[];
    },
  });
}

/** Compact talk-time formatter: 3725 → "1h 2m", 95 → "1m 35s", 40 → "40s". */
export function formatTalk(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return rem > 0 && m < 10 ? `${m}m ${rem}s` : `${m}m`;
}
