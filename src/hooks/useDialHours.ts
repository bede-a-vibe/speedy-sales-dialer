import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DialHourRow {
  hour_of_day: number;
  dials: number;
  leads_dialed: number;
  redials: number;
  connects: number;
  conv_2min: number;
  bookings: number;
  new_leads: number;
  contact_rate_pct: number | null;
  conv_rate_pct: number | null;
  book_rate_pct: number | null;
}

export function useDialHourStats(from: string, to: string, userId?: string) {
  return useQuery({
    queryKey: ["dial-hour-stats", from, to, userId],
    queryFn: async (): Promise<DialHourRow[]> => {
      const { data, error } = await supabase.rpc("get_dial_hour_stats", {
        _from: new Date(`${from}T00:00:00`).toISOString(),
        _to: new Date(`${to}T23:59:59.999`).toISOString(),
        _user_id: userId ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as DialHourRow[];
    },
    staleTime: 60_000,
  });
}

export interface HourVerdict {
  /** Hours worth dialling more: contact rate above average, volume below it. */
  underDialled: DialHourRow[];
  /** Hours absorbing heavy volume at a below-average contact rate. */
  overDialled: DialHourRow[];
  best: DialHourRow | null;
  worst: DialHourRow | null;
  avgContactRate: number | null;
  totalDials: number;
  /** Hours with real activity, used to spot where the day starts and stops. */
  firstActiveHour: number | null;
  lastActiveHour: number | null;
}

/**
 * A single hour proves nothing — three dials at 100% is noise, not a signal.
 * Hours below this many dials are excluded from best/worst and from the
 * over/under-dialled verdicts entirely.
 */
export const MIN_DIALS_FOR_VERDICT = 30;

export function analyseHours(rows: DialHourRow[]): HourVerdict {
  const active = rows.filter((r) => r.dials > 0);
  const rated = rows.filter((r) => r.dials >= MIN_DIALS_FOR_VERDICT && r.contact_rate_pct !== null);
  const totalDials = active.reduce((sum, r) => sum + r.dials, 0);

  if (rated.length === 0) {
    return {
      underDialled: [],
      overDialled: [],
      best: null,
      worst: null,
      avgContactRate: null,
      totalDials,
      firstActiveHour: active.length ? active[0].hour_of_day : null,
      lastActiveHour: active.length ? active[active.length - 1].hour_of_day : null,
    };
  }

  // Weighted by dials, not a mean of percentages: a 100% hour with 3 dials must
  // not drag the benchmark around.
  const totalRatedDials = rated.reduce((sum, r) => sum + r.dials, 0);
  const totalConnects = rated.reduce((sum, r) => sum + r.connects, 0);
  const avgContactRate = Math.round((1000 * totalConnects) / totalRatedDials) / 10;
  const avgDials = totalRatedDials / rated.length;

  const sorted = [...rated].sort(
    (a, b) => (b.contact_rate_pct ?? 0) - (a.contact_rate_pct ?? 0),
  );

  return {
    underDialled: rated
      .filter((r) => (r.contact_rate_pct ?? 0) > avgContactRate && r.dials < avgDials)
      .sort((a, b) => (b.contact_rate_pct ?? 0) - (a.contact_rate_pct ?? 0)),
    overDialled: rated
      .filter((r) => (r.contact_rate_pct ?? 0) < avgContactRate && r.dials > avgDials)
      .sort((a, b) => b.dials - a.dials),
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
    avgContactRate,
    totalDials,
    firstActiveHour: active.length ? active[0].hour_of_day : null,
    lastActiveHour: active.length ? active[active.length - 1].hour_of_day : null,
  };
}

export function formatHour(hour: number) {
  const suffix = hour < 12 ? "am" : "pm";
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
}

export function formatHourRange(hour: number) {
  return `${formatHour(hour)}–${formatHour((hour + 1) % 24)}`;
}
