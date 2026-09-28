import { supabase } from "@/integrations/supabase/client";
import { productiveDiallingHours } from "@/lib/kpiStandards";

const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/**
 * Per-user productive dialling hours + days worked from Dialpad call records since `since`.
 * Definition: (dials × 30 seconds) + connected talk time.
 */
export async function fetchDialpadHours(since: string): Promise<Map<string, { hours: number; days: number }>> {
  const rows: any[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from("dialpad_calls")
      .select("user_id, started_at, talk_time_seconds")
      .gte("started_at", since).not("user_id", "is", null)
      .order("started_at", { ascending: true }).range(page * 1000, page * 1000 + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const byUser = new Map<string, { dials: number; talk: number; days: Set<string> }>();
  for (const r of rows) {
    const u = byUser.get(r.user_id) ?? byUser.set(r.user_id, { dials: 0, talk: 0, days: new Set() }).get(r.user_id)!;
    u.dials += 1;
    u.talk += r.talk_time_seconds ?? 0;
    u.days.add(dayKey(new Date(r.started_at).getTime()));
  }
  const out = new Map<string, { hours: number; days: number }>();
  for (const [uid, u] of byUser) out.set(uid, { hours: productiveDiallingHours(u.dials, u.talk), days: u.days.size });
  return out;
}
