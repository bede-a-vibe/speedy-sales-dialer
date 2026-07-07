import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "google/gemini-2.5-flash";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const NEPQ_SYSTEM = `You are an elite cold-call coach trained in the NEPQ (Neuro-Emotional Persuasion Questioning) framework by Jeremy Miner.

Core NEPQ principles you MUST follow:
- Calm, low-pressure tone. Never pushy, never salesy, never desperate.
- Question-led. Reply with a curious, disarming question more often than with a statement.
- Take the pressure OFF the prospect ("totally fair", "makes sense", "no worries", "I'm not here to twist your arm").
- Isolate objections in this order: logistical → fear → smokescreen. Never argue with the surface objection; peel it back.
- Never use hype words, adjectives about your product, or feature dumps.
- Short. 1-3 sentences per turn is usually enough.
- Sound like a real human, not a script.`;

type ObjectionRow = {
  id: string;
  objection_text: string;
  category: string;
  example_responses: Array<{ response: string; source?: string }> | null;
};

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2);
}

function scoreRow(row: ObjectionRow, tokens: string[]): number {
  const hay = `${row.objection_text} ${row.category}`.toLowerCase();
  let score = 0;
  for (const t of tokens) if (hay.includes(t)) score += 1;
  return score;
}

async function retrieveGrounding(
  admin: ReturnType<typeof createClient>,
  query: string,
  limit = 5,
): Promise<ObjectionRow[]> {
  const tokens = tokenize(query);
  // Try ilike on the strongest 3 tokens; fall back to top rows.
  const strong = tokens.slice(0, 3);
  let rows: ObjectionRow[] = [];
  if (strong.length > 0) {
    const orFilter = strong.map((t) => `objection_text.ilike.%${t}%`).join(",");
    const { data } = await admin
      .from("objection_bank")
      .select("id, objection_text, category, example_responses")
      .or(orFilter)
      .limit(30);
    rows = (data ?? []) as ObjectionRow[];
  }
  if (rows.length < limit) {
    const { data } = await admin
      .from("objection_bank")
      .select("id, objection_text, category, example_responses")
      .eq("source", "framework")
      .limit(30);
    for (const r of (data ?? []) as ObjectionRow[]) {
      if (!rows.find((x) => x.id === r.id)) rows.push(r);
    }
  }
  rows.sort((a, b) => scoreRow(b, tokens) - scoreRow(a, tokens));
  return rows.slice(0, limit);
}

function formatGrounding(rows: ObjectionRow[]): string {
  if (rows.length === 0) return "(no matching objections in bank)";
  return rows
    .map((r, i) => {
      const responses = (r.example_responses ?? [])
        .slice(0, 3)
        .map((x) => `    - ${x.response}`)
        .join("\n");
      return `${i + 1}. [${r.category}] "${r.objection_text}"${responses ? `\n${responses}` : ""}`;
    })
    .join("\n");
}

async function callAI(messages: Array<{ role: string; content: string }>, opts?: { json?: boolean; temperature?: number }) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    temperature: opts?.temperature ?? 0.7,
    max_tokens: 800,
  };
  if (opts?.json) body.response_format = { type: "json_object" };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[coach-assistant] AI error:", res.status, errText);
    const err = new Error("ai_error") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

function safeJsonParse<T = unknown>(text: string): T | null {
  if (!text) return null;
  try { return JSON.parse(text) as T; } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]) as T; } catch {}
  }
  return null;
}

async function handleAsk(admin: ReturnType<typeof createClient>, question: string) {
  const grounding = await retrieveGrounding(admin, question, 5);
  const groundingText = formatGrounding(grounding);

  const userPrompt = `A sales rep is asking you how to handle this on a live cold call:

"${question}"

Relevant objections from our team's playbook (use as inspiration, don't copy verbatim):
${groundingText}

Reply with a single NEPQ-style suggested response the rep can say next. 1-3 sentences. Question-led. Calm. Take the pressure off. Isolate the real objection (logistical → fear → smokescreen).`;

  const answer = await callAI([
    { role: "system", content: NEPQ_SYSTEM },
    { role: "user", content: userPrompt },
  ], { temperature: 0.6 });

  return {
    answer: (answer ?? "").trim(),
    matched_objections: grounding.map((g) => ({
      id: g.id,
      objection_text: g.objection_text,
      category: g.category,
    })),
  };
}

async function handleRoleplay(
  admin: ReturnType<typeof createClient>,
  objection: string,
  history: Array<{ role: "rep" | "prospect"; text: string }>,
) {
  const grounding = await retrieveGrounding(admin, objection, 3);
  const groundingText = formatGrounding(grounding);

  const historyText = history.length
    ? history.map((h) => `${h.role === "rep" ? "REP" : "PROSPECT"}: ${h.text}`).join("\n")
    : "(no exchanges yet — this is your opening line as the prospect)";

  const userPrompt = `You are ROLEPLAYING as a realistic small-business owner on a cold call. You are raising and holding this objection: "${objection}".

Playbook context for realism:
${groundingText}

Conversation so far:
${historyText}

Respond in-character as the PROSPECT to the rep's latest message (or open the exchange if there are none yet). Be realistic — mildly guarded, distracted, human. 1-3 sentences.

Then grade the rep's last reply against NEPQ (skip if there's no rep turn yet), and decide if the prospect would now agree to a next step (a short discovery call).

Return STRICT JSON only, no prose, in exactly this shape:
{
  "prospect_reply": "string, 1-3 sentences, in-character",
  "coaching_note": "one short line for the rep — what worked or what to try next (NEPQ lens). Empty string if no rep turn yet.",
  "done": boolean
}

"done" is true ONLY if the prospect has clearly agreed to a next step (e.g. book a time, take a follow-up call). Otherwise false.`;

  const raw = await callAI([
    { role: "system", content: NEPQ_SYSTEM + "\n\nYou are now acting as the PROSPECT in a training simulation. Stay in character. Return strict JSON only." },
    { role: "user", content: userPrompt },
  ], { temperature: 0.8, json: true });

  const parsed = safeJsonParse<{ prospect_reply?: string; coaching_note?: string; done?: boolean }>(raw);
  return {
    prospect_reply: (parsed?.prospect_reply ?? "").toString().trim() || "Hmm. Go on.",
    coaching_note: (parsed?.coaching_note ?? "").toString().trim(),
    done: Boolean(parsed?.done),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const payload = await req.json().catch(() => ({}));
    const mode = (payload?.mode ?? "").toString();

    if (mode === "ask") {
      const question = (payload?.question ?? "").toString().trim();
      if (!question) return jsonResponse({ error: "Missing question" }, 400);
      try {
        const result = await handleAsk(admin, question);
        return jsonResponse(result);
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 429) return jsonResponse({ error: "Rate limited, please try again later" }, 429);
        if (status === 402) return jsonResponse({ error: "AI credits exhausted" }, 402);
        console.error("[coach-assistant] ask failed:", err);
        return jsonResponse({ error: "Coach unavailable" }, 500);
      }
    }

    if (mode === "roleplay") {
      const objection = (payload?.objection ?? "").toString().trim();
      if (!objection) return jsonResponse({ error: "Missing objection" }, 400);
      const rawHistory = Array.isArray(payload?.history) ? payload.history : [];
      const history = rawHistory
        .filter((h: unknown) => h && typeof h === "object")
        .map((h: { role?: string; text?: string }) => ({
          role: h.role === "prospect" ? "prospect" as const : "rep" as const,
          text: (h.text ?? "").toString().slice(0, 800),
        }))
        .filter((h: { text: string }) => h.text.length > 0)
        .slice(-20);
      try {
        const result = await handleRoleplay(admin, objection, history);
        return jsonResponse(result);
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 429) return jsonResponse({ error: "Rate limited, please try again later" }, 429);
        if (status === 402) return jsonResponse({ error: "AI credits exhausted" }, 402);
        console.error("[coach-assistant] roleplay failed:", err);
        return jsonResponse({ error: "Coach unavailable" }, 500);
      }
    }

    return jsonResponse({ error: "Unknown mode. Use 'ask' or 'roleplay'." }, 400);
  } catch (err) {
    console.error("[coach-assistant] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
});