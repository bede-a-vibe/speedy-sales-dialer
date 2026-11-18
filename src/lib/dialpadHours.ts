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

/**
 * Productive dialling hours per user per Melbourne day, between two day keys
 * (inclusive). Same definition and sources as fetchProductiveHours (Dialpad +
 * GHL calls, talk time, 5 minutes a booking), only split by day, for the
 * Funnel Flowthrough Tracker's daily rows.
 */
export async function fetchProductiveHoursByDay(
  fromDay: string,
  toDay: string,
): Promise<Map<string, Map<string, number>>> {
  // Fast path: the database adds it up per user per Melbourne day, one request
  // (~80 ms for the year). The browser used to page every call row, 1,000 a
  // request, one after another: 26 requests for the year so far (19 Nov).
  const { data, error } = await (supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>)("get_productive_activity_by_day", { _from_day: fromDay, _to_day: toDay });
  if (!error && Array.isArray(data)) return productiveHoursFromActivity(data as ProductiveActivityRow[]);
  return fetchProductiveHoursByDayFromRows(fromDay, toDay);
}

export interface ProductiveActivityRow {
  user_id: string;
  day: string;
  dials: number;
  talk_seconds: number | string;
  bookings: number;
}

/** Rows from get_productive_activity_by_day into hours per user per day. */
export function productiveHoursFromActivity(rows: ProductiveActivityRow[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    let days = out.get(r.user_id);
    if (!days) {
      days = new Map();
      out.set(r.user_id, days);
    }
    days.set(r.day, productiveDiallingHours(Number(r.dials) || 0, Number(r.talk_seconds) || 0, Number(r.bookings) || 0));
  }
  return out;
}

/** Fallback when the database function is unavailable: page the raw rows. */
async function fetchProductiveHoursByDayFromRows(
  fromDay: string,
  toDay: string,
): Promise<Map<string, Map<string, number>>> {
  // Pad a day each side for the UTC/Melbourne offset; the day key decides.
  const since = new Date(new Date(`${fromDay}T00:00:00Z`).getTime() - 86_400_000).toISOString();
  const until = new Date(new Date(`${toDay}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString();
  const [dialpad, ghlRows, profiles, bookingRows] = await Promise.all([
    pageAll<{ user_id: string; started_at: string | null; talk_time_seconds: number | null }>((from, to) =>
      supabase
        .from("dialpad_calls")
        .select("user_id, started_at, talk_time_seconds")
        .gte("started_at", since)
        .lt("started_at", until)
        .not("user_id", "is", null)
        .order("started_at", { ascending: true })
        .range(from, to),
    ),
    pageAll<{ ghl_user_id: string | null; occurred_at: string; duration_seconds: number | null }>((from, to) =>
      supabase
        .from("ghl_calls")
        .select("ghl_user_id, occurred_at, duration_seconds")
        .gte("occurred_at", since)
        .lt("occurred_at", until)
        .not("ghl_user_id", "is", null)
        .order("occurred_at", { ascending: true })
        .range(from, to),
    ),
    supabase.from("profiles").select("user_id, ghl_user_id"),
    pageAll<{ user_id: string | null; created_at: string }>((from, to) =>
      supabase
        .from("call_logs")
        .select("user_id, created_at")
        .eq("outcome", "booked")
        .gte("created_at", since)
        .lt("created_at", until)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);
  if (profiles.error) throw profiles.error;
  const byGhlUser = new Map<string, string>();
  for (const p of profiles.data ?? []) if (p.ghl_user_id) byGhlUser.set(p.ghl_user_id, p.user_id);

  interface Acc { dials: number; talk: number; bookings: number }
  const acc = new Map<string, Map<string, Acc>>();
  const get = (uid: string, ms: number) => {
    const day = melbourneDayKey(ms);
    let byDay = acc.get(uid);
    if (!byDay) { byDay = new Map(); acc.set(uid, byDay); }
    let a = byDay.get(day);
    if (!a) { a = { dials: 0, talk: 0, bookings: 0 }; byDay.set(day, a); }
    return a;
  };
  for (const r of dialpad) {
    if (!r.started_at) continue;
    const a = get(r.user_id, new Date(r.started_at).getTime());
    a.dials += 1;
    a.talk += r.talk_time_seconds ?? 0;
  }
  for (const r of ghlRows) {
    const uid = r.ghl_user_id ? byGhlUser.get(r.ghl_user_id) : undefined;
    if (!uid) continue;
    const a = get(uid, new Date(r.occurred_at).getTime());
    a.dials += 1;
    a.talk += r.duration_seconds ?? 0;
  }
  for (const b of bookingRows) {
    // Same as fetchProductiveHours: booking minutes only for users who placed calls.
    if (!b.user_id || !acc.has(b.user_id)) continue;
    get(b.user_id, new Date(b.created_at).getTime()).bookings += 1;
  }
  const out = new Map<string, Map<string, number>>();
  for (const [uid, byDay] of acc) {
    const days = new Map<string, number>();
    for (const [day, a] of byDay) {
      if (day < fromDay || day > toDay) continue;
      days.set(day, productiveDiallingHours(a.dials, a.talk, a.bookings));
    }
    out.set(uid, days);
  }
  return out;
}
