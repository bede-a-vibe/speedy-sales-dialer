import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const FATHOM = "https://api.fathom.ai/external/v1";
const WINDOW_MS = 90 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type FathomMeeting = {
  recording_id?: number | string;
  url?: string;
  share_url?: string;
  title?: string;
  meeting_title?: string;
  created_at?: string;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
  recording_start_time?: string;
  recording_end_time?: string;
  calendar_invitees?: { name?: string; email?: string; is_external?: boolean }[];
  default_summary?: { markdown_formatted?: string } | null;
};

async function fetchMeetings(apiKey: string, since?: string, maxPages = 10) {
  const out: FathomMeeting[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const u = new URL(`${FATHOM}/meetings`);
    if (since) u.searchParams.set("created_after", since);
    u.searchParams.set("include_summary", "true");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u, { headers: { "X-Api-Key": apiKey } });
    if (!r.ok) throw new Error(`Fathom [${r.status}]: ${(await r.text()).slice(0, 300)}`);
    const body = await r.json();
    out.push(...(body.items ?? []));
    cursor = body.next_cursor;
    if (!cursor) break;
  }
  return out;
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/pty|ltd|electrical|services|group|[^a-z0-9]/g, "");

async function processMeetings(userId: string, meetings: FathomMeeting[]) {
  let matched = 0;
  for (const m of meetings) {
    const id = String(m.recording_id ?? m.url ?? "");
    if (!id) continue;
    const start = m.recording_start_time ?? m.scheduled_start_time ?? m.created_at ?? null;
    const attendees = (m.calendar_invitees ?? []).filter((a) => a.email);
    const row: Record<string, unknown> = {
      fathom_id: id,
      user_id: userId,
      title: m.title ?? m.meeting_title ?? null,
      start_at: start,
      end_at: m.recording_end_time ?? m.scheduled_end_time ?? null,
      attendees,
      share_url: m.share_url ?? m.url ?? null,
      summary: m.default_summary?.markdown_formatted ?? null,
    };

    const { data: existing } = await admin.from("fathom_meetings").select("pipeline_item_id, match_confidence").eq("fathom_id", id).maybeSingle();
    if (existing?.match_confidence === "unlinked" || existing?.pipeline_item_id) {
      await admin.from("fathom_meetings").upsert(row);
      continue;
    }

    let itemId: string | null = null;
    let confidence: string | null = null;
    if (start) {
      const t = new Date(start).getTime();
      const { data: items } = await admin
        .from("pipeline_items")
        .select("id, recording_url, scheduled_for, contacts(business_name, email, dm_email)")
        .eq("assigned_user_id", userId)
        .eq("pipeline_type", "booked")
        .gte("scheduled_for", new Date(t - WINDOW_MS).toISOString())
        .lte("scheduled_for", new Date(t + WINDOW_MS).toISOString());
      const emails = attendees.map((a) => a.email!.toLowerCase());
      const title = norm(row.title as string);
      const scored = (items ?? []).map((it: any) => {
        const c = it.contacts ?? {};
        let s = 0;
        if ([c.email, c.dm_email].some((e: string | null) => e && emails.includes(e.toLowerCase()))) s += 3;
        const bn = norm(c.business_name);
        if (bn.length >= 3 && title.includes(bn)) s += 2;
        return { it, s };
      }).sort((a, b) => b.s - a.s);
      if (scored.length === 1) {
        itemId = scored[0].it.id;
        confidence = scored[0].s > 0 ? "high" : "time";
      } else if (scored.length > 1 && scored[0].s > 0 && scored[0].s > scored[1].s) {
        itemId = scored[0].it.id;
        confidence = "high";
      } else if (scored.length > 1) {
        confidence = "ambiguous";
      }
      if (itemId) {
        const target = scored.find((x) => x.it.id === itemId)!.it;
        if (!target.recording_url && row.share_url) {
          await admin.from("pipeline_items").update({ recording_url: row.share_url }).eq("id", itemId);
        }
        matched++;
      }
    }
    await admin.from("fathom_meetings").upsert({ ...row, pipeline_item_id: itemId, match_confidence: confidence });
  }
  return matched;
}

async function syncUser(userId: string, apiKey: string, lastSynced: string | null) {
  const since = lastSynced
    ? new Date(new Date(lastSynced).getTime() - 2 * 3600_000).toISOString()
    : new Date(Date.now() - 14 * 86400_000).toISOString();
  const meetings = await fetchMeetings(apiKey, since);
  const matched = await processMeetings(userId, meetings);
  await admin.from("fathom_connections").update({ last_synced_at: new Date().toISOString(), status: "connected", last_error: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
  return { fetched: meetings.length, matched };
}

async function syncOne(userId: string) {
  const { data: conn } = await admin.from("fathom_connections").select("api_key, last_synced_at").eq("user_id", userId).maybeSingle();
  if (!conn) return { error: "not_connected" };
  try {
    return await syncUser(userId, conn.api_key, conn.last_synced_at);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("fathom_connections").update({ status: "error", last_error: msg, updated_at: new Date().toISOString() }).eq("user_id", userId);
    return { error: msg };
  }
}

async function verifyWebhook(secret: string, id: string, ts: string, raw: string, sigHeader: string) {
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const keyStr = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try { keyBytes = Uint8Array.from(atob(keyStr), (c) => c.charCodeAt(0)); }
  catch { keyBytes = new TextEncoder().encode(secret); }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sigHeader.split(" ").some((p) => p.split(",")[1] === expected);
}

async function handleWebhook(req: Request, userId: string) {
  if (!/^[0-9a-f-]{36}$/.test(userId)) return json({ error: "Bad user" }, 400);
  const raw = await req.text();
  const id = req.headers.get("webhook-id") ?? "";
  const ts = req.headers.get("webhook-timestamp") ?? "";
  const sig = req.headers.get("webhook-signature") ?? "";
  const { data: conn } = await admin.from("fathom_connections").select("webhook_secret").eq("user_id", userId).maybeSingle();
  if (!conn?.webhook_secret || !id || !ts || !sig || !(await verifyWebhook(conn.webhook_secret, id, ts, raw, sig))) {
    return json({ error: "Invalid signature" }, 401);
  }
  let meeting: FathomMeeting;
  try { meeting = JSON.parse(raw); } catch { return json({ error: "Bad body" }, 400); }
  const matched = await processMeetings(userId, [meeting]);
  await admin.from("fathom_connections").update({ last_synced_at: new Date().toISOString(), status: "connected", last_error: null }).eq("user_id", userId);
  return json({ ok: true, matched });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const hookUser = new URL(req.url).searchParams.get("u");
    if (hookUser) return await handleWebhook(req, hookUser);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "sync_all") {
      const { data: conns } = await admin.from("fathom_connections").select("user_id");
      const results: Record<string, unknown> = {};
      for (const c of conns ?? []) results[c.user_id] = await syncOne(c.user_id);
      return json({ ok: true, results });
    }

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !u?.user) return json({ error: "Unauthorised" }, 401);
    const userId = u.user.id;
    const { data: isMgr } = await admin.rpc("is_admin_or_coach", { _user_id: userId });

    if (action === "connect") {
      const key = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (key.length < 10 || key.length > 500) return json({ error: "That doesn't look like a Fathom API key." }, 400);
      const test = await fetch(`${FATHOM}/meetings`, { headers: { "X-Api-Key": key } });
      if (!test.ok) return json({ error: `Fathom rejected that key (${test.status}). Check it and try again.` }, 400);
      await test.body?.cancel();
      const secret = typeof body.webhook_secret === "string" ? body.webhook_secret.trim() : "";
      if (secret && (secret.length < 10 || secret.length > 500)) return json({ error: "That doesn't look like a Fathom webhook secret." }, 400);
      const { error } = await admin.from("fathom_connections").upsert({ user_id: userId, api_key: key, webhook_secret: secret || null, status: "connected", last_error: null, last_synced_at: null, updated_at: new Date().toISOString() });
      if (error) throw error;
      const result = await syncOne(userId);
      return json({ ok: true, result });
    }
    if (action === "set_webhook") {
      const secret = typeof body.webhook_secret === "string" ? body.webhook_secret.trim() : "";
      if (secret && (secret.length < 10 || secret.length > 500)) return json({ error: "That doesn't look like a Fathom webhook secret." }, 400);
      const { error } = await admin.from("fathom_connections").update({ webhook_secret: secret || null, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "status") {
      const { data: c } = await admin.from("fathom_connections").select("webhook_secret").eq("user_id", userId).maybeSingle();
      const { count } = await admin.from("fathom_meetings").select("fathom_id", { count: "exact", head: true }).eq("user_id", userId).not("pipeline_item_id", "is", null);
      return json({ ok: true, has_webhook: !!c?.webhook_secret, matched: count ?? 0, webhook_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/fathom?u=${userId}` });
    }
    if (action === "disconnect") {
      await admin.from("fathom_connections").delete().eq("user_id", userId);
      return json({ ok: true });
    }
    if (action === "sync") {
      const target = typeof body.user_id === "string" && isMgr ? body.user_id : userId;
      return json({ ok: true, result: await syncOne(target) });
    }
    if (action === "link" || action === "unlink") {
      const fathomId = String(body.fathom_id ?? "");
      const { data: m } = await admin.from("fathom_meetings").select("user_id, share_url").eq("fathom_id", fathomId).maybeSingle();
      if (!m || (m.user_id !== userId && !isMgr)) return json({ error: "Not found" }, 404);
      if (action === "unlink") {
        await admin.from("fathom_meetings").update({ pipeline_item_id: null, match_confidence: "unlinked" }).eq("fathom_id", fathomId);
      } else {
        const itemId = String(body.pipeline_item_id ?? "");
        if (!/^[0-9a-f-]{36}$/.test(itemId)) return json({ error: "Bad appointment id" }, 400);
        await admin.from("fathom_meetings").update({ pipeline_item_id: itemId, match_confidence: "manual" }).eq("fathom_id", fathomId);
        await admin.from("pipeline_items").update({ recording_url: m.share_url }).eq("id", itemId);
      }
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
