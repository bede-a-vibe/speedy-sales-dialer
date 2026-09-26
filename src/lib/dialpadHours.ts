import { supabase } from "@/integrations/supabase/client";
import { productiveHoursFromCalls } from "@/lib/kpiStandards";

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/** Per-user productive hours + days worked from Dialpad call records since `since`. */
export async function fetchDialpadHours(since: string): Promise<Map<string, { hours: number; days: number }>> {
  const rows: any[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from("dialpad_calls")
      .select("user_id, started_at, ended_at, total_duration_seconds")
      .gte("started_at", since).not("user_id", "is", null)
      .order("started_at", { ascending: true }).range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const byUserDay = new Map<string, Map<string, { start: number; end: number }[]>>();
  for (const r of rows) {
    const start = new Date(r.started_at).getTime();
    const end = r.ended_at ? new Date(r.ended_at).getTime() : start + (r.total_duration_seconds ?? 0) * 1000;
    const u = byUserDay.get(r.user_id) ?? byUserDay.set(r.user_id, new Map()).get(r.user_id)!;
    const k = dayKey(start);
    (u.get(k) ?? u.set(k, []).get(k)!).push({ start, end });
  }
  const out = new Map<string, { hours: number; days: number }>();
  for (const [uid, days] of byUserDay) {
    let hours = 0;
    for (const spans of days.values()) hours += productiveHoursFromCalls(spans);
    out.set(uid, { hours, days: days.size });
  }
  return out;
}
