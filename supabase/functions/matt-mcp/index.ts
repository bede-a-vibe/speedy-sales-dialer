// MCP (Model Context Protocol) server over streamable HTTP.
// Read-only dialer data for an external AI coach. verify_jwt = false;
// auth is a bearer token matched against public.mcp_auth.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, mcp-protocol-version, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Strip phone numbers, emails and street addresses from any string output. */
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/g;
const ADDRESS_RE = /\b\d+[a-zA-Z]?[\s,]+[A-Za-z' ]{2,30}\s(st|street|rd|road|ave|avenue|dr|drive|ct|court|pde|parade|hwy|highway|ln|lane|cres|crescent|blvd|boulevard|way|pl|place)\b\.?/gi;

function scrub(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(EMAIL_RE, "[email removed]").replace(PHONE_RE, "[phone removed]").replace(ADDRESS_RE, "[address removed]");
  }
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/(^|_)(phone|email|mobile|address|phone_e164|dm_phone|dm_email)($|_)/i.test(k)) continue;
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

async function repNameMap(db: ReturnType<typeof admin>) {
  const { data } = await db.from("profiles").select("user_id, display_name, email");
  const byId = new Map<string, string>();
  for (const p of data ?? []) {
    byId.set(p.user_id as string, (p.display_name as string) || ((p.email as string) ?? "").split("@")[0] || "Unknown rep");
  }
  return byId;
}

function sinceIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function matchRep(names: Map<string, string>, repName?: string): string[] | null {
  if (!repName) return null;
  const needle = repName.toLowerCase().trim();
  return [...names.entries()].filter(([, n]) => n.toLowerCase().includes(needle)).map(([id]) => id);
}

const TOOLS = [
  {
    name: "get_team_stats",
    description: "Team-wide dialer stats for the last N days: dials, connects, bookings, per-rep breakdown.",
    inputSchema: { type: "object", properties: { days: { type: "number", description: "Look-back window in days (default 7)." } } },
  },
  {
    name: "list_recent_calls",
    description: "Recent logged calls with outcome, rep, business name and whether a transcript exists.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number" },
        outcome: { type: "string", description: "Filter by call outcome, e.g. booked, not_interested, follow_up." },
        rep_name: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_call_transcript",
    description: "Full transcript for one call plus its AI coaching and NEPQ scorecard rows. Look up by call_log_id or business_name.",
    inputSchema: { type: "object", properties: { call_log_id: { type: "string" }, business_name: { type: "string" } } },
  },
  { name: "get_winning_calls", description: "Booked calls with transcripts — the winning-call training library.", inputSchema: { type: "object", properties: {} } },
  { name: "get_rep_coaching_profiles", description: "Rolling per-rep coaching profile: focus areas and strengths.", inputSchema: { type: "object", properties: {} } },
  {
    name: "list_coaching",
    description: "AI coaching entries per call: summary, key moment, better path, stage and pillar scores.",
    inputSchema: { type: "object", properties: { rep_name: { type: "string" }, skill_tag: { type: "string" }, limit: { type: "number" } } },
  },
  { name: "list_objection_bank", description: "The objection bank: objections seen, categories and example responses.", inputSchema: { type: "object", properties: {} } },
];

async function runTool(name: string, args: Record<string, any>) {
  const db = admin();
  const names = await repNameMap(db);

  if (name === "get_team_stats") {
    const days = Number(args.days) || 7;
    const { data, error } = await db
      .from("call_logs")
      .select("user_id, outcome, dialpad_talk_time_seconds, reached_connection")
      .gte("created_at", sinceIso(days))
      .limit(20000);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const per = new Map<string, any>();
    for (const r of rows) {
      const key = (r.user_id as string) ?? "unknown";
      const e = per.get(key) ?? { rep_name: names.get(key) ?? "Unknown rep", dials: 0, connects: 0, bookings: 0, talk_seconds: 0 };
      e.dials += 1;
      if (r.reached_connection) e.connects += 1;
      if (r.outcome === "booked") e.bookings += 1;
      e.talk_seconds += (r.dialpad_talk_time_seconds as number) ?? 0;
      per.set(key, e);
    }
    const reps = [...per.values()].sort((a, b) => b.dials - a.dials);
    return {
      window_days: days,
      totals: {
        dials: rows.length,
        connects: reps.reduce((s, r) => s + r.connects, 0),
        bookings: reps.reduce((s, r) => s + r.bookings, 0),
        talk_seconds: reps.reduce((s, r) => s + r.talk_seconds, 0),
      },
      reps,
    };
  }

  if (name === "list_recent_calls") {
    const days = Number(args.days) || 7;
    const limit = Math.min(Number(args.limit) || 50, 200);
    let q = db
      .from("call_logs")
      .select("id, user_id, outcome, created_at, dialpad_talk_time_seconds, dialpad_transcript, contacts(business_name, industry, state)")
      .gte("created_at", sinceIso(days))
      .order("created_at", { ascending: false })
      .limit(limit);
    if (args.outcome) q = q.eq("outcome", args.outcome);
    const repIds = matchRep(names, args.rep_name);
    if (repIds) q = q.in("user_id", repIds.length ? repIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      call_log_id: r.id,
      rep_name: names.get(r.user_id) ?? "Unknown rep",
      outcome: r.outcome,
      called_at: r.created_at,
      talk_seconds: r.dialpad_talk_time_seconds,
      business_name: r.contacts?.business_name ?? null,
      industry: r.contacts?.industry ?? null,
      state: r.contacts?.state ?? null,
      has_transcript: Boolean(r.dialpad_transcript && String(r.dialpad_transcript).length > 100),
    }));
  }

  if (name === "get_call_transcript") {
    let q = db
      .from("call_logs")
      .select("id, user_id, outcome, created_at, dialpad_transcript, dialpad_summary, dialpad_talk_time_seconds, contacts(business_name, industry, state)")
      .not("dialpad_transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (args.call_log_id) q = q.eq("id", args.call_log_id);
    else if (args.business_name) q = q.ilike("contacts.business_name", `%${args.business_name}%`);
    else throw new Error("Provide call_log_id or business_name");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const call: any = (data ?? [])[0];
    if (!call) return { found: false };
    const [{ data: coaching }, { data: scores }] = await Promise.all([
      db.from("call_coaching").select("outcome, coaching, model, created_at").eq("call_log_id", call.id),
      db.from("call_scores").select("scorecard, overall_score, broke_down_at, booking_blocker, created_at").eq("call_log_id", call.id),
    ]);
    return {
      found: true,
      call_log_id: call.id,
      rep_name: names.get(call.user_id) ?? "Unknown rep",
      outcome: call.outcome,
      called_at: call.created_at,
      talk_seconds: call.dialpad_talk_time_seconds,
      business_name: call.contacts?.business_name ?? null,
      industry: call.contacts?.industry ?? null,
      state: call.contacts?.state ?? null,
      summary: call.dialpad_summary,
      transcript: call.dialpad_transcript,
      coaching: coaching ?? [],
      scores: scores ?? [],
    };
  }

  if (name === "get_winning_calls") {
    const { data, error } = await db
      .from("call_logs")
      .select("id, user_id, created_at, dialpad_transcript, dialpad_talk_time_seconds, contacts(business_name, industry, state)")
      .eq("outcome", "booked")
      .not("dialpad_transcript", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter((r: any) => String(r.dialpad_transcript ?? "").length > 200);
    const { data: scores } = await db
      .from("call_scores")
      .select("call_log_id, overall_score, booking_blocker, broke_down_at")
      .in("call_log_id", rows.map((r: any) => r.id));
    const byLog = new Map((scores ?? []).map((s: any) => [s.call_log_id, s]));
    return rows.map((r: any) => ({
      call_log_id: r.id,
      rep_name: names.get(r.user_id) ?? "Unknown rep",
      called_at: r.created_at,
      talk_seconds: r.dialpad_talk_time_seconds,
      business_name: r.contacts?.business_name ?? null,
      industry: r.contacts?.industry ?? null,
      state: r.contacts?.state ?? null,
      score: byLog.get(r.id) ?? null,
      transcript: r.dialpad_transcript,
    }));
  }

  if (name === "get_rep_coaching_profiles") {
    const { data, error } = await db
      .from("rep_coaching_profile")
      .select("user_id, focus_areas, strengths, calls_analyzed, window_days, updated_at");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      rep_name: names.get(r.user_id) ?? "Unknown rep",
      focus_areas: r.focus_areas,
      strengths: r.strengths,
      calls_analyzed: r.calls_analyzed,
      window_days: r.window_days,
      updated_at: r.updated_at,
    }));
  }

  if (name === "list_coaching") {
    const limit = Math.min(Number(args.limit) || 25, 100);
    let q = db
      .from("call_coaching")
      .select("id, call_log_id, user_id, outcome, coaching, created_at, contacts(business_name)")
      .order("created_at", { ascending: false })
      .limit(limit);
    const repIds = matchRep(names, args.rep_name);
    if (repIds) q = q.in("user_id", repIds.length ? repIds : ["00000000-0000-0000-0000-000000000000"]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    let rows = (data ?? []).map((r: any) => ({
      call_log_id: r.call_log_id,
      rep_name: names.get(r.user_id) ?? "Unknown rep",
      outcome: r.outcome,
      business_name: r.contacts?.business_name ?? null,
      created_at: r.created_at,
      coaching: r.coaching,
    }));
    if (args.skill_tag) rows = rows.filter((r) => r.coaching?.skill_tag === args.skill_tag);
    return rows;
  }

  if (name === "list_objection_bank") {
    const { data, error } = await db
      .from("objection_bank")
      .select("objection_text, category, example_responses, times_seen, booked_count, led_to_booking, source, updated_at")
      .order("times_seen", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  throw new Error(`Unknown tool: ${name}`);
}

async function authorised(req: Request): Promise<boolean> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const { data, error } = await admin().from("mcp_auth").select("bearer_token");
  if (error) return false;
  return (data ?? []).some((r: any) => r.bearer_token === token);
}

const rpcError = (id: unknown, code: number, message: string) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  if (!(await authorised(req))) {
    return json({ error: "unauthorized" }, 401);
  }

  if (req.method === "GET") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = body ?? {};

  try {
    if (method === "initialize") {
      return json({
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "speedy-dialer", version: "1.0.0" },
        },
      });
    }

    if (method === "notifications/initialized" || (typeof method === "string" && method.startsWith("notifications/"))) {
      return new Response(null, { status: 202, headers: cors });
    }

    if (method === "ping") return json({ jsonrpc: "2.0", id: id ?? null, result: {} });

    if (method === "tools/list") return json({ jsonrpc: "2.0", id: id ?? null, result: { tools: TOOLS } });

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments ?? {};
      if (!TOOLS.some((t) => t.name === toolName)) return rpcError(id, -32602, `Unknown tool: ${toolName}`);
      try {
        const result = scrub(await runTool(toolName, args));
        return json({ jsonrpc: "2.0", id: id ?? null, result: { content: [{ type: "text", text: JSON.stringify(result) }] } });
      } catch (e) {
        return json({
          jsonrpc: "2.0",
          id: id ?? null,
          result: { content: [{ type: "text", text: JSON.stringify({ error: String((e as Error).message ?? e) }) }], isError: true },
        });
      }
    }

    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    return rpcError(id, -32603, String((e as Error).message ?? e));
  }
});
