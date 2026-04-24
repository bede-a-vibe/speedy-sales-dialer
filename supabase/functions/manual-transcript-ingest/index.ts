// Manual transcript ingest — stopgap for when the Dialpad webhook isn't firing.
// Saves a pasted transcript onto a contact, optionally generates the AI summary,
// and optionally enqueues a GHL push using the same pipeline the Dialpad webhook uses.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const AI_SYSTEM_PROMPT = `You are an expert sales manager and call reviewer for a digital marketing agency that sells to blue collar trades businesses (HVAC, plumbing, electrical, roofing, landscaping, etc.). You are deeply trained in the methodologies of "Fanatical Prospecting" by Jeb Blount and "Cold Calling Sucks (And That's Why It Works)" by Armand Farrokh & Nick Cegelski.

Your task is to analyse a raw sales call transcript and extract actionable sales intelligence.

You MUST return a valid JSON object with three keys:
1. "fields" — structured key/value pairs for CRM custom fields
2. "note" — a formatted rich text summary for the CRM contact note
3. "objections" — an array of structured objection/coaching events for training and review

Use Australian English. Only include fields where meaningful information was found in the transcript. For dropdowns use exact option text. Use YYYY-MM-DD for dates. Keep TEXT fields concise. The "note" should be a single string with \\n for line breaks. If no meaningful objections, return an empty array.`;

async function generateAiSummary(params: {
  transcript: string;
  repName?: string;
  phoneNumber?: string;
  callDurationSeconds?: number | null;
  callDate?: string | null;
}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("[Manual Ingest] LOVABLE_API_KEY missing");
    return null;
  }

  const durationStr = params.callDurationSeconds != null
    ? `${Math.floor(params.callDurationSeconds / 60)}m ${params.callDurationSeconds % 60}s`
    : "Unknown";
  const callDate = params.callDate ?? new Date().toLocaleDateString("en-AU");
  const callTime = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });

  const userPrompt = `Please analyse the following call transcript and generate the CRM note and structured JSON.

Call Metadata:
Date: ${callDate}
Time: ${callTime}
Rep: ${params.repName ?? "Unknown"}
Duration: ${durationStr}
Phone: ${params.phoneNumber ?? "Unknown"}

Transcript:
${params.transcript}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[Manual Ingest] AI gateway error: ${response.status} ${errBody}`);
      return null;
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) return null;

    try {
      return JSON.parse(content) as {
        fields?: Record<string, unknown>;
        note?: string;
        objections?: unknown[];
      };
    } catch {
      return null;
    }
  } catch (err) {
    console.error("[Manual Ingest] AI summary failed:", err);
    return null;
  }
}

async function upsertContactNote(
  adminClient: ReturnType<typeof createClient>,
  params: {
    contactId: string;
    createdBy: string;
    dialpadCallId: string;
    source: "dialpad_summary" | "dialpad_transcript";
    content: string;
  },
) {
  const { data: existing } = await adminClient
    .from("contact_notes")
    .select("id")
    .eq("contact_id", params.contactId)
    .eq("created_by", params.createdBy)
    .eq("dialpad_call_id", params.dialpadCallId)
    .eq("source", params.source)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await adminClient
      .from("contact_notes")
      .update({ content: params.content })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id as string;
  }

  const { data: inserted, error } = await adminClient
    .from("contact_notes")
    .insert({
      contact_id: params.contactId,
      created_by: params.createdBy,
      dialpad_call_id: params.dialpadCallId,
      source: params.source,
      content: params.content,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return inserted.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Auth: validate JWT ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  // ── Parse body ──
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const contactId: string | undefined = body?.contactId;
  const callLogId: string | null = body?.callLogId ?? null;
  const transcript: string = (body?.transcript ?? "").toString();
  const callDate: string | null = body?.callDate ?? null;
  const durationSeconds: number | null = typeof body?.durationSeconds === "number" ? body.durationSeconds : null;
  const generateSummary: boolean = !!body?.generateSummary;
  const pushToGhl: boolean = !!body?.pushToGhl;
  const skipTranscriptSave: boolean = !!body?.skipTranscriptSave;

  if (!contactId) return json({ error: "contactId required" }, 400);
  if (transcript.trim().length < 50) {
    return json({ error: "Transcript must be at least 50 characters" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Fetch contact for phone + ghl_contact_id
  const { data: contact, error: contactErr } = await admin
    .from("contacts")
    .select("id, phone, ghl_contact_id")
    .eq("id", contactId)
    .maybeSingle();
  if (contactErr || !contact) return json({ error: "Contact not found" }, 404);

  // Fetch rep display name (best effort)
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  // Synthetic dialpad_call_id so dedupe + GHL queue uniqueness work without a real call ID
  const syntheticDialpadCallId = `manual_${contactId}_${Date.now()}`;

  let transcriptNoteId: string | null = null;
  let summaryNoteId: string | null = null;
  let callLogUpdated = false;
  let ghlEnqueued = false;
  let aiWarning: string | null = null;

  // 1. Save transcript as a contact note (unless caller opted out, e.g. re-process flow)
  if (!skipTranscriptSave) {
    try {
      transcriptNoteId = await upsertContactNote(admin, {
        contactId,
        createdBy: userId,
        dialpadCallId: syntheticDialpadCallId,
        source: "dialpad_transcript",
        content: transcript,
      });
    } catch (err: any) {
      return json({ error: `Failed to save transcript: ${err.message ?? err}` }, 500);
    }
  }

  // 2. If a call log was selected, also write the transcript onto that call_logs row
  if (callLogId) {
    const { error: clErr } = await admin
      .from("call_logs")
      .update({
        dialpad_transcript: transcript,
        transcript_synced_at: new Date().toISOString(),
        ...(durationSeconds != null ? { dialpad_total_duration_seconds: durationSeconds } : {}),
      })
      .eq("id", callLogId);
    if (!clErr) callLogUpdated = true;
    else console.warn("[Manual Ingest] call_logs update failed:", clErr.message);
  }

  // 3. Optionally generate AI summary
  let aiResult: { fields?: Record<string, unknown>; note?: string; objections?: unknown[] } | null = null;
  if (generateSummary) {
    aiResult = await generateAiSummary({
      transcript,
      repName: profile?.display_name ?? undefined,
      phoneNumber: contact.phone ?? undefined,
      callDurationSeconds: durationSeconds,
      callDate,
    });

    if (aiResult?.note) {
      try {
        summaryNoteId = await upsertContactNote(admin, {
          contactId,
          createdBy: userId,
          dialpadCallId: syntheticDialpadCallId,
          source: "dialpad_summary",
          content: aiResult.note,
        });
      } catch (err: any) {
        console.warn("[Manual Ingest] Failed to save summary note:", err.message ?? err);
        aiWarning = "Summary generated but failed to save";
      }
    } else {
      aiWarning = "AI summary generation failed";
    }
  }

  // 4. Optionally enqueue GHL push
  if (pushToGhl && aiResult && contact.ghl_contact_id) {
    const { error: enqErr } = await admin.from("pending_ghl_pushes").upsert(
      {
        contact_id: contactId,
        dialpad_call_id: syntheticDialpadCallId,
        user_id: userId,
        ai_note: aiResult.note ?? null,
        ai_fields: (aiResult.fields ?? {}) as any,
        source: "dialpad_ai_summary",
        status: "pending",
        next_retry_at: new Date().toISOString(),
        last_error: "Manual transcript ingest",
      },
      { onConflict: "contact_id,dialpad_call_id,source" },
    );
    if (!enqErr) ghlEnqueued = true;
    else console.warn("[Manual Ingest] enqueue failed:", enqErr.message);
  }

  return json({
    ok: true,
    noteIds: { transcriptNoteId, summaryNoteId },
    callLogUpdated,
    ghlEnqueued,
    aiWarning,
  });
});