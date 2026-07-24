import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "google/gemini-2.5-flash";

// ---------------------------------------------------------------------------
// Roleplay trainer: personas + difficulty + milestone grading
// ---------------------------------------------------------------------------

type PersonaKey =
  | "busy_sparky"
  | "skeptical_plumber"
  | "young_hustler_mover"
  | "gatekeeper_office_manager"
  | "burned_by_agency";

const PERSONAS: Record<PersonaKey, { name: string; brief: string; tests: string; voice: string; opener_hook: string }> = {
  busy_sparky: {
    name: "Busy sparky",
    brief: "Mid-job electrician, rushed. Answers are clipped — 'yeah nah', 'mate what'. Time resistance. He's literally under a house / on a roof.",
    tests: "Rep must respect the time frame AND still plant a hook. Rushing the pitch = he hangs up. Asking for permission for 30 seconds without a reason = brush-off.",
    voice: "Clipped, tradie, background noise implied. 1 sentence usually. Uses 'mate', 'bro', 'nah', 'yeah righto'. Interrupts.",
    opener_hook: "Mate I'm literally under a house right now, what's this about?",
  },
  skeptical_plumber: {
    name: "Skeptical plumber",
    brief: "20 years in business, built on word-of-mouth. Thinks Google Ads is a scam because a mate got burned. Slow, measured, uses silence.",
    tests: "Rep must NOT get defensive, must validate the skepticism, must earn the next 30 seconds. Trying to 'convince' him = fail. Naming a real risk before he does = softens him.",
    voice: "Slow, dry, measured. Long pauses (indicate with '...'). 1-2 sentences. Says 'look' and 'to be honest'. Not hostile, just weary.",
    opener_hook: "Look mate, I already get all my work word of mouth. What's this about?",
  },
  young_hustler_mover: {
    name: "Young hustler (removalist)",
    brief: "Under 30, runs a two-truck removalist crew, listens to business podcasts, uses words like 'scale' and 'systems'. Asks questions back. Serial researcher who never actually commits.",
    tests: "Rep must NOT mistake enthusiasm for intent. Must pin the booking to a specific time, never allow 'I'll think about it' or 'send me some info'.",
    voice: "Energetic, asks reflective questions back, uses podcast vocab. 1-3 sentences. Friendly.",
    opener_hook: "Yeah for sure man, what's the pitch — I'm always looking to scale.",
  },
  gatekeeper_office_manager: {
    name: "Gatekeeper (office manager)",
    brief: "Polite but firm screener. Runs the office. 'He's not available, can I take a message.' Access resistance.",
    tests: "Rep must treat her like she runs the place (she often does). Must get the owner's name + best time + plant a seed. 'Is the owner there?' as the opener = screening trigger = instant fail.",
    voice: "Polite, professional, brief. Uses 'unfortunately' and 'can I ask what it's regarding'.",
    opener_hook: "Hi, this is Sarah — he's not available at the moment, can I take a message?",
  },
  burned_by_agency: {
    name: "Burned by a previous agency",
    brief: "Spent $5k with a marketing company, got nothing, hostile edge. Anger-as-skepticism.",
    tests: "Rep must hold frame, NOT over-promise, NEVER say 'we're different'. Must let him vent — the venting IS the opening. Interrupting the vent = fail.",
    voice: "Sharp, sarcastic edge, longer bursts when venting. Uses 'the last bloke', 'ripped off', 'waste of money'.",
    opener_hook: "Another marketing bloke — what makes you different from the last one that ripped me off?",
  },
};

const PERSONA_KEYS = Object.keys(PERSONAS) as PersonaKey[];

function pickPersona(exclude?: PersonaKey | null): PersonaKey {
  const pool = exclude ? PERSONA_KEYS.filter((k) => k !== exclude) : PERSONA_KEYS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function levelRubric(level: number): string {
  const L = Math.max(1, Math.min(5, Math.round(level || 3)));
  const rules: Record<number, string> = {
    1: "Mildly receptive. ONE soft brush-off max. Recover from one rep mistake. End round after 6-8 rep turns or a booking attempt.",
    2: "Slightly guarded. 1-2 brush-offs. One real objection. Recover from one mistake. End after 6-10 rep turns or a booking attempt.",
    3: "Skeptical, not hostile. 2-3 brush-offs and one real objection. A FUMBLED OPENER ends the round (prospect disengages: 'yeah nah not interested, cheers' then done=true). End after 8-12 rep turns or a booking attempt.",
    4: "Guarded, tests early. 3+ brush-offs, one hard objection, one price probe. Fumbled opener OR arguing a brush-off ends the round.",
    5: "Hostile, rapid-fire brush-offs, interrupts, price question inside 30 seconds, fights for control. Any fumble ends the round instantly. Compliments are traps.",
  };
  return `LEVEL ${L}: ${rules[L]}`;
}

function liveEscalationRule(): string {
  return "LIVE ESCALATION: every rep message shifts the prospect. Good move (agree-reduce-redirect, specific discovery, honest cold-call framing) → soften ONE notch (shorter, less resistance). Fumble (arguing, bulldozing, generic question, over-promise, 'we're different', freezing) → harden ONE notch (colder, shorter, closer to hanging up). React like a real human — don't reset to baseline each turn.";
}

const ROLEPLAY_SYSTEM = `You are ROLEPLAYING as an Australian small-business owner receiving a cold call from a digital-marketing sales rep. You are NOT the coach. You are the prospect.

Absolute rules:
- Stay in character. Never break the fourth wall. Never mention that you are an AI, a persona, or a training simulation.
- Australian tone. Tradie/SMB vocabulary. Short. Real prospects don't monologue — usually 1-2 sentences, sometimes just a word.
- React to the rep's LAST message specifically. Do not follow a script.
- Respect the persona's resistance style and the level's difficulty rules given below.
- Only end the round (done=true) when the persona would realistically disengage OR when the rep has attempted a specific-time booking and you've responded to it, OR when the level rule triggers end.

You will output STRICT JSON only. No prose outside the JSON.`;

const OPENER_DRILL_SYSTEM = `${ROLEPLAY_SYSTEM}

OPENER DRILL MODE: this round is capped at the first ~30 seconds of a real call. Cover exactly three beats: (1) rep opener → you react with the persona's opener_hook, (2) rep handles that one brush-off → you react once, (3) rep transitions into their first real discovery question → you react briefly then END the round with done=true. Do NOT let the round go longer than 3 prospect turns total.`;

const GRADING_INSTRUCTIONS = `When you set done=true, ALSO grade the rep's performance across five milestones IN ORDER. Pass condition is PROCESS ADHERENCE, not 'did they book me'.

Milestones (each is pass or fail with a one-line reason; if a milestone was never reached because an earlier one failed, mark it "skipped"):
1. opener — name is clear, who they are + why they're calling, max ~2 sentences before a pause. Honest cold-call framing ("look, this is a cold call, got 30 seconds?") counts. "Is the owner there?" style screening triggers fail immediately for gatekeeper persona.
2. brush_off — the FIRST brush-off was handled with agree-reduce-redirect (acknowledge → lower stakes → redirect to a question). Arguing, bulldozing, ignoring it, or freezing = fail.
3. discovery — at least ONE open-ended question SPECIFIC to their trade (electrical / plumbing / removals / their existing agency experience). Generic "what's your biggest challenge" does NOT count.
4. booking_ask — the rep asked for a SPECIFIC time ("Thursday 2pm or Friday 10am work better?"). "Would you be interested in a chat sometime" does NOT count.
5. final_objection — the last real objection was handled without abandoning the ask AND without getting combative. Caving ("no worries, I'll leave you to it") = fail. Arguing back = fail.

Also identify:
- failed_milestone: the FIRST milestone that failed (or null if all passed).
- key_message: the EXACT rep message text (verbatim, quoted from transcript) where it went sideways. Empty string if all passed.
- coaching: 2-3 short sentences — why that move kills you on a real call, and the specific better move (name the move, ideally give one example line).

In opener_drill mode ONLY grade opener, brush_off, and discovery (mark booking_ask and final_objection as "skipped").`;

function buildRoleplaySystemPrompt(personaKey: PersonaKey, level: number, mode: "roleplay" | "opener_drill", extraObjection?: string): string {
  const p = PERSONAS[personaKey];
  const base = mode === "opener_drill" ? OPENER_DRILL_SYSTEM : ROLEPLAY_SYSTEM;
  const flavour = extraObjection ? `\n\nFLAVOUR OBJECTION (weave in naturally if it fits, do NOT force it): "${extraObjection}"` : "";
  return `${base}

PERSONA (never reveal to the rep):
- Type: ${p.name}
- Brief: ${p.brief}
- Voice: ${p.voice}
- What this call tests in the rep: ${p.tests}
- Your natural opener hook if the rep just introduced themselves: "${p.opener_hook}"

${levelRubric(level)}

${liveEscalationRule()}

${GRADING_INSTRUCTIONS}${flavour}`;
}

function buildRoundUserPrompt(
  history: Array<{ role: "rep" | "prospect"; text: string }>,
  mode: "roleplay" | "opener_drill",
): string {
  const historyText = history.length
    ? history.map((h) => `${h.role === "rep" ? "REP" : "PROSPECT"}: ${h.text}`).join("\n")
    : "(no exchanges yet — this is your opening line as the prospect; the rep is about to say hello)";

  return `Conversation so far:
${historyText}

Reply IN CHARACTER to the rep's latest message (or open the exchange if none yet). Stay tight — 1-2 sentences unless venting fits your persona.

Return STRICT JSON only, exactly this shape:
{
  "prospect_reply": "string, in-character, short",
  "coaching_note": "one short line for the rep on their LAST move (NEPQ / agree-reduce-redirect lens). Empty string if no rep turn yet.",
  "done": boolean,
  "grade": null | {
    "passed": boolean,
    "milestones": {
      "opener":         { "status": "pass" | "fail" | "skipped", "reason": "one line" },
      "brush_off":      { "status": "pass" | "fail" | "skipped", "reason": "one line" },
      "discovery":      { "status": "pass" | "fail" | "skipped", "reason": "one line" },
      "booking_ask":    { "status": "pass" | "fail" | "skipped", "reason": "one line" },
      "final_objection":{ "status": "pass" | "fail" | "skipped", "reason": "one line" }
    },
    "failed_milestone": "opener" | "brush_off" | "discovery" | "booking_ask" | "final_objection" | null,
    "key_message": "exact verbatim rep message where it went sideways, or empty string",
    "coaching": "2-3 short sentences: why it kills you + the better move (with an example line if useful)"
  }
}

Set "grade" to null while done=false. Set "grade" to the object above ONLY when done=true. ${mode === "opener_drill" ? "Remember: opener_drill caps at ~3 prospect turns and only grades opener/brush_off/discovery." : ""}`;
}

type Milestone = { status: "pass" | "fail" | "skipped"; reason: string };
type Grade = {
  passed: boolean;
  milestones: {
    opener: Milestone;
    brush_off: Milestone;
    discovery: Milestone;
    booking_ask: Milestone;
    final_objection: Milestone;
  };
  failed_milestone: string | null;
  key_message: string;
  coaching: string;
};

const CANNOT_TRAIN_NOTE = "Text roleplay can't train tonality, pacing, silence, or energy — drill those out loud with self-recording.";

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

function normalizeMilestone(raw: unknown): Milestone {
  const obj = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const status = obj.status === "pass" || obj.status === "fail" || obj.status === "skipped" ? obj.status : "skipped";
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
  return { status, reason };
}

function normalizeGrade(raw: unknown, mode: "roleplay" | "opener_drill"): Grade | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const mRaw = (g.milestones && typeof g.milestones === "object") ? g.milestones as Record<string, unknown> : {};
  const milestones = {
    opener: normalizeMilestone(mRaw.opener),
    brush_off: normalizeMilestone(mRaw.brush_off),
    discovery: normalizeMilestone(mRaw.discovery),
    booking_ask: normalizeMilestone(mRaw.booking_ask),
    final_objection: normalizeMilestone(mRaw.final_objection),
  };
  if (mode === "opener_drill") {
    if (milestones.booking_ask.status !== "skipped") milestones.booking_ask = { status: "skipped", reason: "not covered in opener drill" };
    if (milestones.final_objection.status !== "skipped") milestones.final_objection = { status: "skipped", reason: "not covered in opener drill" };
  }
  const relevant = mode === "opener_drill"
    ? [milestones.opener, milestones.brush_off, milestones.discovery]
    : Object.values(milestones);
  const passed = relevant.every((m) => m.status === "pass");
  const order = ["opener", "brush_off", "discovery", "booking_ask", "final_objection"] as const;
  const firstMiss = order.find((k) => milestones[k].status === "fail") ?? null;
  return {
    passed,
    milestones,
    failed_milestone: (typeof g.failed_milestone === "string" && g.failed_milestone) ? g.failed_milestone : firstMiss,
    key_message: typeof g.key_message === "string" ? g.key_message : "",
    coaching: typeof g.coaching === "string" ? g.coaching : "",
  };
}

async function handleRoleplayRound(
  userClient: ReturnType<typeof createClient>,
  userId: string,
  params: {
    mode: "roleplay" | "opener_drill";
    personaKey: PersonaKey;
    level: number;
    history: Array<{ role: "rep" | "prospect"; text: string }>;
    objection?: string;
    sessionShownCannotTrainNote: boolean;
  },
) {
  const system = buildRoleplaySystemPrompt(params.personaKey, params.level, params.mode, params.objection);
  const user = buildRoundUserPrompt(params.history, params.mode);

  const raw = await callAI([
    { role: "system", content: system },
    { role: "user", content: user },
  ], { temperature: 0.85, json: true });

  const parsed = safeJsonParse<{
    prospect_reply?: string;
    coaching_note?: string;
    done?: boolean;
    grade?: unknown;
  }>(raw) ?? {};

  const done = Boolean(parsed.done);
  const prospectReply = (parsed.prospect_reply ?? "").toString().trim() || "Yeah nah, what's this about mate?";
  const coachingNote = (parsed.coaching_note ?? "").toString().trim();
  const grade = done ? normalizeGrade(parsed.grade, params.mode) : null;

  let roundId: string | null = null;
  if (done) {
    const transcript = [...params.history, { role: "prospect" as const, text: prospectReply }];
    const { data: inserted, error: insertErr } = await userClient
      .from("roleplay_rounds")
      .insert({
        user_id: userId,
        mode: params.mode,
        persona: params.personaKey,
        level: params.level,
        passed: grade?.passed ?? false,
        milestones: grade?.milestones ?? null,
        failed_milestone: grade?.failed_milestone ?? null,
        transcript,
      })
      .select("id")
      .single();
    if (insertErr) {
      console.error("[coach-assistant] roleplay insert failed:", insertErr);
    } else {
      roundId = (inserted as { id: string } | null)?.id ?? null;
    }
  }

  return {
    prospect_reply: prospectReply,
    coaching_note: coachingNote,
    done,
    grade,
    round_id: roundId,
    // Persona is revealed ONLY when the round ends, so the rep can learn who they just faced.
    persona_revealed: done ? { key: params.personaKey, name: PERSONAS[params.personaKey].name } : null,
    cannot_train_note: done && !params.sessionShownCannotTrainNote ? CANNOT_TRAIN_NOTE : null,
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

    if (mode === "roleplay" || mode === "opener_drill") {
      const trainingMode = mode as "roleplay" | "opener_drill";
      const objection = (payload?.objection ?? "").toString().trim() || undefined;
      const rawHistory = Array.isArray(payload?.history) ? payload.history : [];
      const history = rawHistory
        .filter((h: unknown) => h && typeof h === "object")
        .map((h: { role?: string; text?: string }) => ({
          role: h.role === "prospect" ? "prospect" as const : "rep" as const,
          text: (h.text ?? "").toString().slice(0, 800),
        }))
        .filter((h: { text: string }) => h.text.length > 0)
        .slice(-30);

      // Persona: caller passes it back on every turn of the same round so it stays stable.
      // On the FIRST turn (empty history), we pick a random one and never reveal it until done.
      const suppliedPersona = (payload?.persona ?? "").toString();
      const personaKey: PersonaKey = (PERSONA_KEYS as string[]).includes(suppliedPersona)
        ? (suppliedPersona as PersonaKey)
        : pickPersona();

      const level = Number(payload?.level ?? 3);
      const sessionShownCannotTrainNote = Boolean(payload?.session_shown_cannot_train_note);

      try {
        const result = await handleRoleplayRound(userClient, user.id, {
          mode: trainingMode,
          personaKey,
          level,
          history,
          objection,
          sessionShownCannotTrainNote,
        });
        return jsonResponse({
          ...result,
          // Echo persona key so the frontend can pass it back next turn (stable persona per round).
          // The persona is still HIDDEN from the rep — the frontend must not display it until done=true.
          persona: personaKey,
          level,
          mode: trainingMode,
        });
      } catch (err) {
        const status = (err as { status?: number })?.status;
        if (status === 429) return jsonResponse({ error: "Rate limited, please try again later" }, 429);
        if (status === 402) return jsonResponse({ error: "AI credits exhausted" }, 402);
        console.error("[coach-assistant] roleplay failed:", err);
        return jsonResponse({ error: "Coach unavailable" }, 500);
      }
    }

    return jsonResponse({ error: "Unknown mode. Use 'ask', 'roleplay', or 'opener_drill'." }, 400);
  } catch (err) {
    console.error("[coach-assistant] Unexpected error:", err);
    return jsonResponse({ error: "Server error" }, 500);
  }
});