import { supabase } from "@/integrations/supabase/client";
import { melbourneDayKey, productiveDiallingHours } from "@/lib/kpiStandards";


/** Pages a select() to completion; PostgREST caps a single request at 1000 rows. */
async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await build(page * 1000, page * 1000 + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface ProductiveHoursRow {
  hours: number;
  days: number;
  /** Split out so the UI can show when a rep's GHL calls are carrying the number. */
  dialpadDials: number;
  ghlDials: number;
}

/**
 * Per-user productive dialling hours + days worked, since `since`.
 *
 * Definition (locked, see AGENTS.md):
 *   (dials × 25 seconds) + connected talk time + (bookings × 5 minutes)
 *
 * Reps place calls from TWO systems — Dialpad and GoHighLevel's built-in phone —
 * and both count. Reading only `dialpad_calls` understated dials and talk time
 * for anyone working out of GHL, which is the same undercount the ghl_calls
 * ingest was built to fix; leaving it here meant it fed straight into the
 * commission KPI.
 *
 * The two tables have no shared key (GHL stores a Twilio SID, Dialpad its own
 * call id), so a union cannot be deduped. They are separate providers, so the
 * same call should never appear twice — but that is an assumption this code
 * cannot verify, and it is the thing to check first if hours ever look doubled.
 *
 * Inbound calls are treated exactly as Dialpad already treated them: every call
 * row earns the 25-second dial allowance regardless of direction. That is
 * questionable for a closer taking inbound (they did not dial), but changing it
 * would move a live contractual number, so it stays consistent across both
 * sources and is flagged rather than quietly altered.
 */
export async function fetchProductiveHours(since: string): Promise<Map<string, ProductiveHoursRow>> {
  const [dialpad, ghlRows, profiles, bookingRows] = await Promise.all([
    pageAll<{ user_id: string; started_at: string | null; talk_time_seconds: number | null }>((from, to) =>
      supabase
        .from("dialpad_calls")
        .select("user_id, started_at, talk_time_seconds")
        .gte("started_at", since)
        .not("user_id", "is", null)
        .order("started_at", { ascending: true })
        .range(from, to),
    ),
    pageAll<{ ghl_user_id: string | null; occurred_at: string; duration_seconds: number | null }>((from, to) =>
      supabase
        .from("ghl_calls")
        .select("ghl_user_id, occurred_at, duration_seconds")
        .gte("occurred_at", since)
        .not("ghl_user_id", "is", null)
        .order("occurred_at", { ascending: true })
        .range(from, to),
    ),
    supabase.from("profiles").select("user_id, ghl_user_id"),
    pageAll<{ user_id: string | null }>((from, to) =>
      supabase
        .from("call_logs")
        .select("user_id")
        .eq("outcome", "booked")
        .gte("created_at", since)
        // Offset paging needs a unique, stable sort or rows silently shift
        // between pages. id is the primary key, so it cannot tie.
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (profiles.error) throw profiles.error;

  // GHL identifies the caller by its own user id; map it onto the dialer user.
  // Calls from an unmapped GHL user are dropped here rather than attributed to
  // nobody — ghl_sync_state.last_unmapped is where that gap is meant to surface.
  const byGhlUser = new Map<string, string>();
  for (const p of profiles.data ?? []) {
    if (p.ghl_user_id) byGhlUser.set(p.ghl_user_id, p.user_id);
  }

  const bookings = new Map<string, number>();
  for (const b of bookingRows) {
    if (b.user_id) bookings.set(b.user_id, (bookings.get(b.user_id) ?? 0) + 1);
  }

  interface Acc { dials: number; talk: number; dialpadDials: number; ghlDials: number; days: Set<string> }
  const byUser = new Map<string, Acc>();
  const acc = (uid: string): Acc => {
    let a = byUser.get(uid);
    if (!a) {
      a = { dials: 0, talk: 0, dialpadDials: 0, ghlDials: 0, days: new Set() };
      byUser.set(uid, a);
    }
    return a;
  };

  for (const r of dialpad) {
    if (!r.started_at) continue;
    const a = acc(r.user_id);
    a.dials += 1;
    a.dialpadDials += 1;
    a.talk += r.talk_time_seconds ?? 0;
    a.days.add(melbourneDayKey(new Date(r.started_at).getTime()));
  }

  for (const r of ghlRows) {
    const uid = r.ghl_user_id ? byGhlUser.get(r.ghl_user_id) : undefined;
    if (!uid) continue;
    const a = acc(uid);
    a.dials += 1;
    a.ghlDials += 1;
    a.talk += r.duration_seconds ?? 0;
    a.days.add(melbourneDayKey(new Date(r.occurred_at).getTime()));
  }

  const out = new Map<string, ProductiveHoursRow>();
  for (const [uid, a] of byUser) {
    out.set(uid, {
      hours: productiveDiallingHours(a.dials, a.talk, bookings.get(uid) ?? 0),
      days: a.days.size,
      dialpadDials: a.dialpadDials,
      ghlDials: a.ghlDials,
    });
  }
  return out;
}
