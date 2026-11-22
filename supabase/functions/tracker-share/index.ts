// View-only tracker links (23 Nov 2026).
//
// /view/tracker/<token> renders Insights > Tracker for anyone holding the link,
// signed in or not. That page's data requests are sent here instead of the
// REST API. This function:
//   - checks the token is a live row in tracker_share_links,
//   - allows reads only (GET/HEAD on tables, POST on two read-only RPCs),
//   - allows only the tables and columns the tracker reads,
//   - returns setter pay tables as empty, so pay never leaves through a link,
//   - masks phone numbers and staff emails in what it returns,
// then runs the read with the service role and passes the response back.
//
// Body: { token, method, path: "/rest/v1/<table>" | "/rest/v1/rpc/<fn>", search, headers?, body? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "content-range",
};

const cols = (s: string) => new Set(s.split(",").map((c) => c.trim()).filter(Boolean));

const CONTACT_COLS = cols(
  "id, business_name, industry, trade_type, state, business_size, work_type, prospect_tier, buying_signal_strength, phone_type, has_google_ads, has_facebook_ads, dm_phone, gbp_rating, review_count, team_size, monthly_revenue, ghl_contact_id",
);

/** Every table the tracker reads, with the columns it may select or filter on. */
const TABLES: Record<string, Set<string>> = {
  call_logs: cols(
    "id, contact_id, user_id, outcome, follow_up_date, created_at, dialpad_call_id, transcript_synced_at, dialpad_talk_time_seconds, dialpad_total_duration_seconds, reached_connection, reached_problem_awareness, reached_solution_awareness, reached_commitment, opener_used_id, drop_off_reason, exit_reason_connection, exit_reason_problem, exit_reason_solution, exit_reason_commitment, exit_reason_booking",
  ),
  contacts: CONTACT_COLS,
  pipeline_items: cols(
    "id, contact_id, created_at, created_by, assigned_user_id, scheduled_for, appointment_outcome, outcome_reason, dq_reason, outcome_recorded_at, status, deal_value, monthly_recurring_value, reschedule_count, is_qualified, pitched, proposal_status, proposal_sent_date, move_count, meeting_channel, resolved_bucket, booking_tier, booking_method, pipeline_type",
  ),
  v_meetings_unified: cols(
    "id, stream, contact_id, start_time, booked_at, rep_user_id, resolved_outcome, outcome_reason, reschedule_count, mrr, led_to_deal, channel, is_linked, meeting_type, title",
  ),
  meeting_reschedules: cols("id, from_scheduled_for, reason, kind, pipeline_item_id"),
  profiles: cols("user_id, display_name, email, ghl_user_id"),
  dialpad_calls: cols("user_id, started_at, talk_time_seconds"),
  ghl_calls: cols("ghl_user_id, occurred_at, duration_seconds"),
  tracker_daily_inputs: cols("id, day, funnel, user_id, rostered_hours, ad_spend, clicks, leads"),
  tracker_targets: cols("id, month, funnel, metric, value"),
};

/** Embedded relations (by name in a select) and the table each one reads. */
const RELATIONS: Record<string, string> = { contacts: "contacts", pipeline_items: "pipeline_items" };

/** Setter pay and roles: answered with an empty list, never read. */
const EMPTY_TABLES = new Set(["rep_comp_plans", "client_deal_payments", "user_roles"]);

/** Read-only RPCs the tracker calls. */
const RPCS = new Set(["get_call_logs_compact", "get_new_clients"]);

const RESERVED_PARAMS = new Set(["select", "order", "limit", "offset", "or", "and"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Split on commas outside brackets. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Checks a PostgREST select against the allowlist. Returns an error message or null. */
function checkSelect(select: string, table: string): string | null {
  const allowed = TABLES[table];
  if (!allowed) return `table ${table} not allowed`;
  for (const item of splitTop(select.replace(/\s+/g, ""))) {
    const open = item.indexOf("(");
    if (open >= 0) {
      if (!item.endsWith(")")) return `bad select ${item}`;
      let head = item.slice(0, open);
      const colon = head.indexOf(":");
      if (colon >= 0) head = head.slice(colon + 1);
      const rel = head.split("!")[0];
      const relTable = RELATIONS[rel];
      if (!relTable) return `relation ${rel} not allowed`;
      const err = checkSelect(item.slice(open + 1, -1), relTable);
      if (err) return err;
      continue;
    }
    let col = item;
    const castAt = col.indexOf("::");
    if (castAt >= 0) col = col.slice(0, castAt);
    const colon = col.indexOf(":");
    if (colon >= 0) col = col.slice(colon + 1);
    if (!allowed.has(col)) return `column ${table}.${col} not allowed`;
  }
  return null;
}

/** Phone numbers become "on file"; staff emails are dropped. */
function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "dm_phone") out[k] = v == null || v === "" ? v : "on file";
      else if (k === "email") out[k] = null;
      else out[k] = mask(v);
    }
    return out;
  }
  return value;
}

/** get_call_logs_compact: contacts are positional arrays; dm_phone is index 11. */
function maskCompact(value: unknown): unknown {
  const v = value as { rows?: unknown; contacts?: Record<string, unknown[]> } | null;
  if (!v || typeof v !== "object" || !v.contacts) return value;
  const contacts: Record<string, unknown[]> = {};
  for (const [id, arr] of Object.entries(v.contacts)) {
    const copy = Array.isArray(arr) ? [...arr] : arr;
    if (Array.isArray(copy) && copy[11] != null && copy[11] !== "") copy[11] = "on file";
    contacts[id] = copy as unknown[];
  }
  return { ...v, contacts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "POST only" }, 405);

  let body: { token?: string; method?: string; path?: string; search?: string; headers?: Record<string, string>; body?: string };
  try {
    body = await req.json();
  } catch {
    return json({ message: "Bad request" }, 400);
  }
  const token = typeof body.token === "string" ? body.token : "";
  if (!/^[a-f0-9]{32,64}$/.test(token)) return json({ message: "This link is not valid." }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: link, error: linkError } = await admin
    .from("tracker_share_links")
    .select("id, last_viewed_at")
    .eq("token", token)
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError) return json({ message: linkError.message }, 500);
  if (!link) return json({ message: "This link has been turned off. Ask for a new one." }, 401);

  const method = (body.method ?? "GET").toUpperCase();
  const path = String(body.path ?? "");
  const search = String(body.search ?? "").replace(/^\?/, "");
  const params = new URLSearchParams(search);

  let isRpc = false;
  let rpcName = "";
  const rpcMatch = path.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/);
  const tableMatch = path.match(/^\/rest\/v1\/([a-z0-9_]+)$/);
  if (rpcMatch) {
    isRpc = true;
    rpcName = rpcMatch[1];
    if (!RPCS.has(rpcName)) return json({ message: `rpc ${rpcName} not allowed` }, 403);
    if (method !== "POST" && method !== "GET") return json({ message: "read only" }, 403);
  } else if (tableMatch) {
    const table = tableMatch[1];
    if (method !== "GET" && method !== "HEAD") return json({ message: "This link is view only." }, 403);
    if (EMPTY_TABLES.has(table)) {
      return new Response("[]", { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json", "Content-Range": "*/0" } });
    }
    if (!TABLES[table]) return json({ message: `table ${table} not allowed` }, 403);
    const select = params.get("select");
    if (!select || select.includes("*")) return json({ message: "select needed" }, 403);
    const err = checkSelect(select, table);
    if (err) return json({ message: err }, 403);
    for (const key of params.keys()) {
      if (RESERVED_PARAMS.has(key)) continue;
      if (!TABLES[table].has(key)) return json({ message: `filter ${key} not allowed` }, 403);
    }
  } else {
    return json({ message: "path not allowed" }, 403);
  }

  // Count the view, at most once every ten minutes.
  const tenMinAgo = Date.now() - 10 * 60_000;
  if (!link.last_viewed_at || new Date(link.last_viewed_at).getTime() < tenMinAgo) {
    const { data: row } = await admin.from("tracker_share_links").select("view_count").eq("id", link.id).maybeSingle();
    await admin
      .from("tracker_share_links")
      .update({ last_viewed_at: new Date().toISOString(), view_count: (row?.view_count ?? 0) + 1 })
      .eq("id", link.id);
  }

  const headers: Record<string, string> = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  for (const h of ["accept", "prefer", "range", "range-unit", "accept-profile", "content-profile"]) {
    const v = body.headers?.[h];
    if (typeof v === "string" && !(h === "prefer" && /resolution|return=representation/i.test(v))) headers[h] = v;
  }

  const upstream = await fetch(`${url}${path}${search ? `?${search}` : ""}`, {
    method,
    headers,
    body: method === "POST" ? body.body ?? "{}" : undefined,
  });

  const outHeaders: Record<string, string> = { ...corsHeaders, "Content-Type": upstream.headers.get("content-type") ?? "application/json" };
  const range = upstream.headers.get("content-range");
  if (range) outHeaders["Content-Range"] = range;
  if (method === "HEAD") return new Response(null, { status: upstream.status, headers: outHeaders });

  const text = await upstream.text();
  if (!upstream.ok) return new Response(text, { status: upstream.status, headers: outHeaders });
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return new Response(text, { status: upstream.status, headers: outHeaders });
  }
  const masked = isRpc && rpcName === "get_call_logs_compact" ? maskCompact(data) : mask(data);
  return new Response(JSON.stringify(masked), { status: upstream.status, headers: outHeaders });
});
