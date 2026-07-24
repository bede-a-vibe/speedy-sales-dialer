// deno-lint-ignore-file no-explicit-any
// Public MCP server (Streamable HTTP, JSON responses) for MattRyderAI.
// Auth: static bearer token from public.mcp_auth.
// All tools are READ-ONLY. Phone/email/address fields are stripped from every response.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-session-id",
  "Access-Control-Max-Age": "86400",
};

let cachedToken: string | null = null;
let cachedTokenAt = 0;
async function getBearer(): Promise<string | null> {
  if (cachedToken && Date.now() - cachedTokenAt < 60_000) return cachedToken;
  const { data } = await admin.from("mcp_auth").select("bearer_token").eq("id", 1).maybeSingle();
  cachedToken = (data?.bearer_token as string) ?? null;
  cachedTokenAt = Date.now();
  return cachedToken;
}

async function checkAuth(req: Request): Promise<boolean> {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!m) return false;
  const expected = await getBearer();
  return !!expected && m[1].trim() === expected;
}

// ---------- helpers ----------

const PII_KEYS = new Set([
  "phone", "phone_e164", "phone_type", "dm_phone", "dm_phone_type", "dm_email",
  "email", "address", "street_address", "postcode", "postal_code", "zip",
  "latitude", "longitude", "lat", "lng", "gmb_link", "website",
]);

function scrub(value: any): any {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (PII_KEYS.has(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

async function repNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await admin.from("profiles").select("user_id, display_name, email");
  for (const r of (data ?? []) as any[]) {
    map.set(r.user_id, r.display_name || (r.email ? String(r.email).split("@")[0] : "Unknown"));
  }
  return map;
}

const PICKUP_OUTCOMES = ["booked", "gatekeeper", "not_interested", "follow_up", "dnc", "wrong_number"];

// ---------- tools ----------

async function tool_get_team_stats(args: any) {
  const days = Math.max(1, Math.min(365, Number(args?.days ?? 30)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [{ data: logs }, names] = await Promise.all([
    admin.from("call_logs")
      .select("user_id, outcome, dialpad_talk_time_seconds")
      .gte("created_at", since),
    repNameMap(),
  ]);
  const per = new Map<string, any>();
  const totals = { dials: 0, pickups: 0, conversations_2min_plus: 0, bookings: 0, talk_sum: 0, talk_n: 0 };
  for (const r of (logs ?? []) as any[]) {
    const uid = r.user_id ?? "unassigned";
    if (!per.has(uid)) per.set(uid, { rep_name: names.get(uid) ?? "Unassigned", dials: 0, pickups: 0, conversations_2min_plus: 0, bookings: 0, talk_sum: 0, talk_n: 0 });
    const p = per.get(uid);
    p.dials++; totals.dials++;
    if (PICKUP_OUTCOMES.includes(r.outcome)) { p.pickups++; totals.pickups++; }
    const t = Number(r.dialpad_talk_time_seconds ?? 0);
    if (t >= 120) { p.conversations_2min_plus++; totals.conversations_2min_plus++; }
    if (t > 0) { p.talk_sum += t; p.talk_n++; totals.talk_sum += t; totals.talk_n++; }
    if (r.outcome === "booked") { p.bookings++; totals.bookings++; }
  }
  const finalize = (p: any) => ({
    rep_name: p.rep_name,
    dials: p.dials,
    pickups: p.pickups,
    conversations_2min_plus: p.conversations_2min_plus,
    bookings: p.bookings,
    pickup_to_conversation_rate: p.pickups ? +(p.conversations_2min_plus / p.pickups).toFixed(3) : 0,
    booking_rate: p.dials ? +(p.bookings / p.dials).toFixed(4) : 0,
    avg_talk_seconds: p.talk_n ? Math.round(p.talk_sum / p.talk_n) : 0,
  });
  return {
    window_days: days,
    totals: finalize({ ...totals, rep_name: "TEAM" }),
    per_rep: Array.from(per.values()).map(finalize).sort((a, b) => b.dials - a.dials),
  };
}

async function tool_list_recent_calls(args: any) {
  const days = Math.max(1, Math.min(90, Number(args?.days ?? 7)));
  const limit = Math.max(1, Math.min(50, Number(args?.limit ?? 25)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  let q = admin.from("call_logs")
    .select("id, user_id, outcome, dialpad_talk_time_seconds, dialpad_transcript, created_at, contact_id, contacts:contact_id(business_name, industry, trade_type)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args?.outcome) q = q.eq("outcome", String(args.outcome));
  const names = await repNameMap();
  const wantRep = args?.rep_name ? String(args.rep_name).toLowerCase() : null;
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((r: any) => ({
    call_log_id: r.id,
    business_name: r.contacts?.business_name ?? null,
    industry: r.contacts?.industry ?? r.contacts?.trade_type ?? null,
    outcome: r.outcome,
    talk_seconds: r.dialpad_talk_time_seconds ?? 0,
    called_at: r.created_at,
    rep_name: names.get(r.user_id) ?? "Unassigned",
    has_transcript: !!(r.dialpad_transcript && String(r.dialpad_transcript).length > 50),
  }));
  const filtered = wantRep ? rows.filter((r) => r.rep_name.toLowerCase().includes(wantRep)) : rows;
  return { count: filtered.length, calls: filtered };
}

async function tool_get_call_transcript(args: any) {
  let logRow: any = null;
  if (args?.call_log_id) {
    const { data } = await admin.from("call_logs")
      .select("id, user_id, outcome, dialpad_talk_time_seconds, dialpad_transcript, created_at, contact_id, contacts:contact_id(business_name, industry, trade_type)")
      .eq("id", String(args.call_log_id)).maybeSingle();
    logRow = data;
  } else if (args?.business_name) {
    const { data: contacts } = await admin.from("contacts")
      .select("id, business_name, industry, trade_type")
      .ilike("business_name", `%${String(args.business_name)}%`)
      .limit(20);
    const ids = (contacts ?? []).map((c: any) => c.id);
    if (!ids.length) return { found: false, reason: "no matching business_name" };
    const { data: logs } = await admin.from("call_logs")
      .select("id, user_id, outcome, dialpad_talk_time_seconds, dialpad_transcript, created_at, contact_id")
      .in("contact_id", ids)
      .not("dialpad_transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    logRow = (logs ?? [])[0];
    if (logRow) {
      const c = (contacts ?? []).find((x: any) => x.id === logRow.contact_id);
      logRow.contacts = c ? { business_name: c.business_name, industry: c.industry, trade_type: c.trade_type } : null;
    }
  } else {
    return { found: false, reason: "provide call_log_id or business_name" };
  }
  if (!logRow) return { found: false };
  const names = await repNameMap();
  const [{ data: coaching }, { data: score }] = await Promise.all([
    admin.from("call_coaching").select("coaching, outcome, model, created_at").eq("call_log_id", logRow.id).maybeSingle(),
    admin.from("call_scores").select("scorecard, overall_score, broke_down_at, booking_blocker, created_at").eq("call_log_id", logRow.id).maybeSingle(),
  ]);
  return {
    found: true,
    call_log_id: logRow.id,
    business_name: logRow.contacts?.business_name ?? null,
    industry: logRow.contacts?.industry ?? logRow.contacts?.trade_type ?? null,
    outcome: logRow.outcome,
    talk_seconds: logRow.dialpad_talk_time_seconds ?? 0,
    called_at: logRow.created_at,
    rep_name: names.get(logRow.user_id) ?? "Unassigned",
    transcript: logRow.dialpad_transcript ?? null,
    coaching: coaching?.coaching ?? null,
    scorecard: score?.scorecard ?? null,
    overall_score: score?.overall_score ?? null,
  };
}

async function tool_get_winning_calls(_args: any) {
  const { data: scores } = await admin.from("call_scores")
    .select("call_log_id, contact_id, scorecard, overall_score, created_at")
    .order("overall_score", { ascending: false })
    .limit(50);
  const logIds = (scores ?? []).map((s: any) => s.call_log_id).filter(Boolean);
  if (!logIds.length) return { count: 0, calls: [] };
  const { data: logs } = await admin.from("call_logs")
    .select("id, outcome, dialpad_talk_time_seconds, dialpad_transcript, created_at, contact_id, contacts:contact_id(business_name, industry, trade_type)")
    .in("id", logIds);
  const byLog = new Map<string, any>();
  for (const l of (logs ?? []) as any[]) byLog.set(l.id, l);
  const out = (scores ?? [])
    .map((s: any) => {
      const l = byLog.get(s.call_log_id);
      if (!l || l.outcome !== "booked") return null;
      return {
        call_log_id: s.call_log_id,
        business_name: l.contacts?.business_name ?? null,
        industry: l.contacts?.industry ?? l.contacts?.trade_type ?? null,
        overall_score: s.overall_score,
        talk_seconds: l.dialpad_talk_time_seconds ?? 0,
        outcome_class: l.outcome === "booked" ? "booked" : l.outcome,
        called_at: l.created_at,
        transcript: l.dialpad_transcript ?? null,
        qualities: s.scorecard ?? null,
      };
    })
    .filter(Boolean);
  return { count: out.length, calls: out };
}

async function tool_get_rep_coaching_profiles(_args: any) {
  const [{ data }, names] = await Promise.all([
    admin.from("rep_coaching_profile").select("*").order("updated_at", { ascending: false }),
    repNameMap(),
  ]);
  return {
    count: (data ?? []).length,
    profiles: (data ?? []).map((p: any) => ({
      rep_name: names.get(p.user_id) ?? "Unassigned",
      calls_analyzed: p.calls_analyzed,
      window_days: p.window_days,
      focus_areas: p.focus_areas,
      strengths: p.strengths,
      updated_at: p.updated_at,
    })),
  };
}

async function tool_list_coaching(args: any) {
  const limit = Math.max(1, Math.min(50, Number(args?.limit ?? 20)));
  const names = await repNameMap();
  const wantRep = args?.rep_name ? String(args.rep_name).toLowerCase() : null;
  const { data } = await admin.from("call_coaching")
    .select("call_log_id, user_id, outcome, coaching, created_at, contact_id, contacts:contact_id(business_name, industry, trade_type)")
    .order("created_at", { ascending: false })
    .limit(limit * 3); // over-fetch so filters still yield results
  let rows = (data ?? []).map((r: any) => ({
    call_log_id: r.call_log_id,
    rep_name: names.get(r.user_id) ?? "Unassigned",
    business_name: r.contacts?.business_name ?? null,
    industry: r.contacts?.industry ?? r.contacts?.trade_type ?? null,
    outcome: r.outcome,
    created_at: r.created_at,
    coaching: r.coaching,
  }));
  if (wantRep) rows = rows.filter((r) => r.rep_name.toLowerCase().includes(wantRep));
  if (args?.skill_tag) {
    const tag = String(args.skill_tag).toLowerCase();
    rows = rows.filter((r) => String(r.coaching?.skill_tag ?? "").toLowerCase() === tag);
  }
  return { count: Math.min(rows.length, limit), coaching: rows.slice(0, limit) };
}

async function tool_list_objection_bank(_args: any) {
  const { data } = await admin.from("objection_bank")
    .select("objection_text, category, times_seen, booked_count, example_responses")
    .order("times_seen", { ascending: false })
    .limit(200);
  return { count: (data ?? []).length, objections: data ?? [] };
}

const TOOLS = [
  {
    name: "get_team_stats",
    description: "Team-wide and per-rep dialer stats: dials, pickups, 2-minute+ conversations, bookings, pickup→conversation rate, booking rate, avg talk seconds.",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "Look-back window (default 30, max 365)." } }, additionalProperties: false },
  },
  {
    name: "list_recent_calls",
    description: "Recent calls with outcome, talk time, and rep. Optional filters by outcome and rep name.",
    inputSchema: { type: "object", properties: {
      days: { type: "number", description: "Look-back window (default 7, max 90)." },
      outcome: { type: "string", description: "One of: booked, gatekeeper, not_interested, follow_up, dnc, wrong_number, no_answer, voicemail." },
      rep_name: { type: "string", description: "Case-insensitive substring match on rep display name." },
      limit: { type: "number", description: "Max rows to return (default 25, max 50)." },
    }, additionalProperties: false },
  },
  {
    name: "get_call_transcript",
    description: "Fetch a single call transcript, its coaching JSON, and its NEPQ scorecard. Provide call_log_id, or business_name (case-insensitive contains, most recent transcript).",
    inputSchema: { type: "object", properties: {
      call_log_id: { type: "string", description: "UUID of the call_logs row." },
      business_name: { type: "string", description: "Business name substring to look up the most recent transcript for." },
    }, additionalProperties: false },
  },
  {
    name: "get_winning_calls",
    description: "The booked-call library: top-scored booked calls with transcripts and NEPQ scorecard qualities.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_rep_coaching_profiles",
    description: "Per-rep rolling coaching profile (focus_areas, strengths, calls_analyzed) with rep names resolved.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_coaching",
    description: "Per-call coaching JSON rows. Optional filters by rep_name (substring) and skill_tag.",
    inputSchema: { type: "object", properties: {
      rep_name: { type: "string" },
      skill_tag: { type: "string", description: "e.g. opening, discovery, objection_handling, gatekeeper, closing_ask, follow_up_setup, tonality_pace." },
      limit: { type: "number", description: "Default 20, max 50." },
    }, additionalProperties: false },
  },
  {
    name: "list_objection_bank",
    description: "The objection bank: text, category, times_seen, booked_count, and example agree-reduce-redirect responses.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const TOOL_HANDLERS: Record<string, (args: any) => Promise<any>> = {
  get_team_stats: tool_get_team_stats,
  list_recent_calls: tool_list_recent_calls,
  get_call_transcript: tool_get_call_transcript,
  get_winning_calls: tool_get_winning_calls,
  get_rep_coaching_profiles: tool_get_rep_coaching_profiles,
  list_coaching: tool_list_coaching,
  list_objection_bank: tool_list_objection_bank,
};

// ---------- JSON-RPC ----------

function jrpcResult(id: any, result: any) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
function jrpcError(id: any, code: number, message: string, status = 200) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authed = await checkAuth(req);
  if (!authed) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json", "WWW-Authenticate": "Bearer" },
    });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json", Allow: "GET, POST, OPTIONS" },
    });
  }

  let msg: any;
  try {
    msg = await req.json();
  } catch {
    return jrpcError(null, -32700, "Parse error");
  }

  const { id = null, method, params } = msg ?? {};

  try {
    if (method === "initialize") {
      return jrpcResult(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "speedy-dialer", version: "1.0.0" },
      });
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      return new Response(null, { status: 202, headers: CORS });
    }
    if (method === "ping") {
      return jrpcResult(id, {});
    }
    if (method === "tools/list") {
      return jrpcResult(id, { tools: TOOLS });
    }
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? {};
      const handler = TOOL_HANDLERS[name];
      if (!handler) return jrpcError(id, -32602, `Unknown tool: ${name}`);
      const raw = await handler(args);
      const safe = scrub(raw);
      return jrpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(safe) }],
      });
    }
    return jrpcError(id, -32601, `Method not found: ${method}`);
  } catch (e: any) {
    return jrpcError(id, -32000, e?.message ?? String(e));
  }
});