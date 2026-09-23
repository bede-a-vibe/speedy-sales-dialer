import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * ghl-calls-sync — pulls call activity placed from GoHighLevel's built-in phone
 * into `public.ghl_calls`.
 *
 * Reps dial from two systems: the dialer (Dialpad) and GHL's own phone. The
 * dialer only ever saw Dialpad, so the End of Day report understated real dials
 * and talk time. This function closes that gap.
 *
 * GHL has no calls/reporting endpoint — `/calls`, `/phone-system/calls` and
 * `/reporting/calls` all 404. Call activity lives inside conversations:
 *   1. GET /conversations/search?lastMessageType=TYPE_CALL  -> call conversations
 *   2. GET /conversations/{id}/messages?type=TYPE_CALL      -> the call messages
 *
 * We store one raw row per call and aggregate at query time (see
 * public.get_rep_ghl_call_metrics). No pre-computed daily totals — a stored
 * total goes stale and nobody notices.
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

// Cloudflare in front of GHL answers 403 (error 1010) without a browser UA.
// Same constant the other GHL-calling functions use.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SYNC_KEY = "ghl_calls_sync";

/** Re-read this far behind the cursor so a conversation that ticked over at the
 *  exact cursor millisecond is never skipped. Upsert on alt_id makes it free. */
const CURSOR_OVERLAP_MS = 10 * 60 * 1000;

/** With no cursor at all (first ever run) only look back this far. A full
 *  backfill is an explicit opt-in via `lookbackDays` / `sinceMs`. */
const DEFAULT_LOOKBACK_DAYS = 2;

/** Leave headroom inside the edge function wall clock. When we run out we stop
 *  cleanly, save the cursor we actually reached, and report has_more. */
const TIME_BUDGET_MS = 100_000;

const CONVERSATION_PAGE_SIZE = 100;
const MESSAGE_PAGE_SIZE = 100;
const MAX_MESSAGE_PAGES = 20;
const CONVERSATION_CONCURRENCY = 4;
const UPSERT_BATCH = 500;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ghlHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    Version: GHL_VERSION,
    "User-Agent": UA,
  };
}

async function ghlFetch(
  path: string,
  apiKey: string,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = new URL(`${GHL_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }

  let lastError = "";
  // GHL rate-limits per location; a couple of short retries beats losing a day.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url.toString(), { method: "GET", headers: ghlHeaders(apiKey) });
    if (res.ok) return (await res.json()) as Record<string, unknown>;

    const text = await res.text();
    lastError = `GHL ${res.status}: ${text.slice(0, 300)}`;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === 2) break;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(lastError);
}

interface GhlConversation {
  id?: string;
  contactId?: string;
  lastMessageDate?: number;
}

interface GhlCallMessage {
  id?: string;
  altId?: string;
  conversationId?: string;
  contactId?: string;
  userId?: string;
  direction?: string;
  status?: string;
  dateAdded?: string;
  messageType?: string;
  meta?: { call?: { duration?: number; status?: string } };
}

interface GhlCallRow {
  alt_id: string;
  ghl_message_id: string | null;
  ghl_user_id: string | null;
  ghl_contact_id: string | null;
  conversation_id: string | null;
  direction: string | null;
  status: string | null;
  duration_seconds: number;
  occurred_at: string;
  raw: GhlCallMessage;
  updated_at: string;
}

/**
 * One page of call conversations newer than `startAfterMs`.
 *
 * `sort=asc&sortBy=last_message_date` + `startAfterDate` is the incremental
 * cursor: it returns only conversations whose last message is strictly newer
 * than the given epoch-ms, oldest first, so paging is just "advance the cursor
 * to the last row you saw". The `total` in the response is the unfiltered
 * location total (4,404 today) — it is NOT the count of the filtered page, so
 * never use it to decide whether to keep paging.
 */
async function searchCallConversations(
  apiKey: string,
  locationId: string,
  startAfterMs: number,
): Promise<GhlConversation[]> {
  const data = await ghlFetch("/conversations/search", apiKey, {
    locationId,
    lastMessageType: "TYPE_CALL",
    sort: "asc",
    sortBy: "last_message_date",
    limit: String(CONVERSATION_PAGE_SIZE),
    startAfterDate: String(startAfterMs),
  });
  return (data.conversations as GhlConversation[] | undefined) ?? [];
}

/** Every TYPE_CALL message in a conversation that happened at/after `sinceMs`. */
async function fetchCallMessages(
  apiKey: string,
  conversationId: string,
  sinceMs: number,
): Promise<GhlCallMessage[]> {
  const out: GhlCallMessage[] = [];
  let lastMessageId = "";

  for (let page = 0; page < MAX_MESSAGE_PAGES; page++) {
    // Response shape is { messages: { messages: [...], nextPage, lastMessageId } }.
    const data = await ghlFetch(`/conversations/${conversationId}/messages`, apiKey, {
      limit: String(MESSAGE_PAGE_SIZE),
      type: "TYPE_CALL",
      ...(lastMessageId ? { lastMessageId } : {}),
    });
    const envelope = (data.messages ?? {}) as {
      messages?: GhlCallMessage[];
      nextPage?: boolean;
      lastMessageId?: string;
    };
    const batch = envelope.messages ?? [];
    if (batch.length === 0) break;

    // Messages come back newest first, so once a page ends older than the
    // window there is nothing left worth walking.
    let reachedOlder = false;
    for (const msg of batch) {
      if (msg.messageType !== "TYPE_CALL") continue;
      const at = msg.dateAdded ? Date.parse(msg.dateAdded) : NaN;
      if (!Number.isFinite(at)) continue;
      if (at < sinceMs) {
        reachedOlder = true;
        continue;
      }
      out.push(msg);
    }

    if (reachedOlder || !envelope.nextPage || !envelope.lastMessageId) break;
    lastMessageId = envelope.lastMessageId;
  }

  return out;
}

function toRow(msg: GhlCallMessage): GhlCallRow | null {
  const occurredMs = msg.dateAdded ? Date.parse(msg.dateAdded) : NaN;
  if (!Number.isFinite(occurredMs)) return null;

  // altId is the Twilio call SID and the natural unique key. A call message
  // without one is rare; fall back to the GHL message id so the row is still
  // stored (and still deduped) rather than silently dropped.
  const altId = msg.altId || (msg.id ? `ghlmsg:${msg.id}` : null);
  if (!altId) return null;

  const duration = Number(msg.meta?.call?.duration ?? 0);

  return {
    alt_id: altId,
    ghl_message_id: msg.id ?? null,
    ghl_user_id: msg.userId ?? null,
    ghl_contact_id: msg.contactId ?? null,
    conversation_id: msg.conversationId ?? null,
    direction: msg.direction ?? null,
    status: msg.status ?? msg.meta?.call?.status ?? null,
    duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0,
    occurred_at: new Date(occurredMs).toISOString(),
    raw: msg,
    updated_at: new Date().toISOString(),
  };
}

/** Runs `worker` over `items` with a small fixed concurrency, in order. */
async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

type SupaClient = ReturnType<typeof createClient>;

interface SyncParams {
  sinceMs?: number;
  lookbackDays?: number;
  maxConversations?: number;
}

async function syncGhlCalls(supabase: SupaClient, params: SyncParams) {
  const startedAt = Date.now();
  const apiKey = Deno.env.get("GHL_API_KEY");
  const locationId = Deno.env.get("GHL_LOCATION_ID");
  if (!apiKey || !locationId) {
    throw new Error("GHL_API_KEY or GHL_LOCATION_ID is not configured");
  }

  const { data: state } = await supabase
    .from("ghl_sync_state")
    .select("last_synced_at")
    .eq("key", SYNC_KEY)
    .maybeSingle();

  // Resolve the window start. Explicit overrides win, then the stored cursor
  // (rewound by the overlap), then the conservative default lookback.
  let sinceMs: number;
  if (typeof params.sinceMs === "number" && Number.isFinite(params.sinceMs)) {
    sinceMs = params.sinceMs;
  } else if (typeof params.lookbackDays === "number" && params.lookbackDays > 0) {
    sinceMs = startedAt - params.lookbackDays * 24 * 60 * 60 * 1000;
  } else {
    const storedMs = state?.last_synced_at ? Date.parse(state.last_synced_at as string) : NaN;
    sinceMs = Number.isFinite(storedMs)
      ? storedMs - CURSOR_OVERLAP_MS
      : startedAt - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  }

  const maxConversations = params.maxConversations ?? 2000;

  // Rep mapping: profiles.ghl_user_id -> platform user. Used only to LOG
  // unmapped callers. Every call is stored regardless — a missing mapping must
  // never silently lose a rep's whole day.
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, ghl_user_id")
    .not("ghl_user_id", "is", null);
  const mappedGhlUserIds = new Set<string>();
  for (const p of profiles ?? []) {
    if (p.ghl_user_id) mappedGhlUserIds.add(p.ghl_user_id as string);
  }

  let cursorMs = sinceMs;
  let conversationsScanned = 0;
  let callsSeen = 0;
  let hasMore = false;
  const errors: string[] = [];
  const rowsByAltId = new Map<string, GhlCallRow>();
  const unmappedCounts = new Map<string, number>();

  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      hasMore = true;
      break;
    }
    if (conversationsScanned >= maxConversations) {
      hasMore = true;
      break;
    }

    let page: GhlConversation[];
    try {
      page = await searchCallConversations(apiKey, locationId, cursorMs);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      hasMore = true;
      break;
    }
    if (page.length === 0) break;

    const messagesPerConversation = await mapLimit(page, CONVERSATION_CONCURRENCY, async (conv) => {
      if (!conv.id) return [] as GhlCallMessage[];
      try {
        return await fetchCallMessages(apiKey, conv.id, sinceMs);
      } catch (e) {
        errors.push(`conversation ${conv.id}: ${e instanceof Error ? e.message : String(e)}`);
        return [] as GhlCallMessage[];
      }
    });

    for (const messages of messagesPerConversation) {
      for (const msg of messages) {
        callsSeen++;
        const row = toRow(msg);
        if (!row) continue;
        rowsByAltId.set(row.alt_id, row);
        if (row.ghl_user_id && !mappedGhlUserIds.has(row.ghl_user_id)) {
          unmappedCounts.set(row.ghl_user_id, (unmappedCounts.get(row.ghl_user_id) ?? 0) + 1);
        } else if (!row.ghl_user_id) {
          unmappedCounts.set("(no userId)", (unmappedCounts.get("(no userId)") ?? 0) + 1);
        }
      }
    }

    conversationsScanned += page.length;

    // Advance the cursor to the newest conversation on this page. If the page
    // gave us nothing usable to advance to, stop rather than loop forever.
    let maxDate = cursorMs;
    for (const conv of page) {
      const d = Number(conv.lastMessageDate ?? 0);
      if (Number.isFinite(d) && d > maxDate) maxDate = d;
    }
    if (maxDate <= cursorMs) break;
    cursorMs = maxDate;

    if (page.length < CONVERSATION_PAGE_SIZE) break;
  }

  // Upsert on alt_id — re-running the sync is always safe.
  const rows = Array.from(rowsByAltId.values());
  let stored = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from("ghl_calls")
      .upsert(batch, { onConflict: "alt_id" });
    if (error) {
      errors.push(`upsert: ${error.message}`);
      break;
    }
    stored += batch.length;
  }

  const unmapped = Array.from(unmappedCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ghl_user_id, calls]) => ({ ghl_user_id, calls }));
  if (unmapped.length > 0) {
    console.warn(
      `[ghl-calls-sync] ${unmapped.length} unmapped GHL user(s) — their calls ARE stored but won't ` +
        `reach a rep until profiles.ghl_user_id is set: ${JSON.stringify(unmapped)}`,
    );
  }

  // Only move the cursor forward on a clean pass. If anything failed we would
  // rather re-read a window than lose calls inside it.
  const cursorToStore = errors.length === 0 ? Math.min(cursorMs, startedAt) : sinceMs;

  await supabase.from("ghl_sync_state").upsert(
    {
      key: SYNC_KEY,
      last_synced_at: new Date(cursorToStore).toISOString(),
      last_run_at: new Date().toISOString(),
      last_pulled: rows.length,
      last_stored: stored,
      last_unmapped: unmapped,
      last_error: errors.length ? errors.slice(0, 5).join(" | ") : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  const summary = {
    ok: errors.length === 0,
    since: new Date(sinceMs).toISOString(),
    cursor: new Date(cursorToStore).toISOString(),
    conversations_scanned: conversationsScanned,
    calls_seen: callsSeen,
    calls_stored: stored,
    unmapped_ghl_users: unmapped,
    has_more: hasMore,
    elapsed_ms: Date.now() - startedAt,
    errors: errors.slice(0, 5),
  };
  console.log(`[ghl-calls-sync] ${JSON.stringify(summary)}`);
  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const action = (body.action as string) ?? url.searchParams.get("action") ?? "sync";

    if (action === "status") {
      const { data } = await supabase
        .from("ghl_sync_state")
        .select("*")
        .eq("key", SYNC_KEY)
        .maybeSingle();
      return json({ ok: true, state: data ?? null });
    }

    if (action !== "sync") return json({ ok: false, error: `Unknown action: ${action}` }, 400);

    const result = await syncGhlCalls(supabase, {
      sinceMs: typeof body.sinceMs === "number" ? body.sinceMs : undefined,
      lookbackDays: typeof body.lookbackDays === "number" ? body.lookbackDays : undefined,
      maxConversations: typeof body.maxConversations === "number" ? body.maxConversations : undefined,
    });
    return json(result, result.ok ? 200 : 207);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[ghl-calls-sync] failed", message);
    return json({ ok: false, error: message }, 500);
  }
});
