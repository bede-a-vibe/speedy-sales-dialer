import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DIALPAD_BASE = "https://dialpad.com/api/v2";
const SYNC_RELEVANT_STATES = new Set(["hangup", "call_transcription", "recap_summary"]);

type JsonRecord = Record<string, unknown>;

type DialpadWebhookPayload = {
  call_id?: number | string | null;
  master_call_id?: number | string | null;
  entry_point_call_id?: number | string | null;
  operator_call_id?: number | string | null;
  state?: string | null;
  direction?: string | null;
  external_number?: string | null;
  date_started?: number | null;
  date_connected?: number | null;
  date_ended?: number | null;
  recap_summary?: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class PhoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneValidationError";
  }
}

function normalizePhoneNumberToE164(phoneNumber: string, defaultCountryCode = "61") {
  const trimmed = phoneNumber.trim();

  if (!trimmed) {
    throw new PhoneValidationError("Phone number is required");
  }

  const hasLeadingPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/\D/g, "");

  if (!digitsOnly) {
    throw new PhoneValidationError("Phone number is invalid");
  }

  let normalized: string | null = null;

  if (hasLeadingPlus) {
    normalized = `+${trimmed.slice(1).replace(/\D/g, "")}`;
  } else if (digitsOnly.startsWith("00")) {
    normalized = `+${digitsOnly.slice(2)}`;
  } else if (defaultCountryCode === "61") {
    if (/^0[2378]\d{8}$/.test(digitsOnly) || /^04\d{8}$/.test(digitsOnly)) {
      normalized = `+61${digitsOnly.slice(1)}`;
    } else if (/^[2378]\d{8}$/.test(digitsOnly) || /^4\d{8}$/.test(digitsOnly)) {
      normalized = `+61${digitsOnly}`;
    } else if (/^61\d{8,10}$/.test(digitsOnly)) {
      normalized = `+${digitsOnly}`;
    }
  }

  if (!normalized) {
    throw new PhoneValidationError(
      "Phone number must include a valid country code or be a valid Australian number, e.g. +61412345678 or 0412345678.",
    );
  }

  const e164Digits = normalized.slice(1);
  if (e164Digits.length < 8 || e164Digits.length > 15 || !/^\+\d+$/.test(normalized)) {
    throw new PhoneValidationError("Phone number must be in valid E.164 format, e.g. +61412345678.");
  }

  return normalized;
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = atob(`${normalized}${padding}`);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifyDialpadJwt(token: string, secret: string) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Dialpad webhook token format");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decodeBase64Url(encodedHeader));

  if (header.alg !== "HS256") {
    throw new Error("Unsupported Dialpad webhook signature algorithm");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  const expectedSignature = encodeBase64Url(new Uint8Array(signature));
  if (expectedSignature !== encodedSignature) {
    throw new Error("Dialpad webhook signature verification failed");
  }

  return JSON.parse(decodeBase64Url(encodedPayload)) as DialpadWebhookPayload;
}

async function extractWebhookPayload(req: Request, secret: string) {
  const rawBody = await req.text();
  const trimmed = rawBody.trim();

  if (!trimmed) {
    throw new Error("Empty webhook payload");
  }

  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as DialpadWebhookPayload;
  }

  if (trimmed.startsWith('"')) {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return verifyDialpadJwt(parsed, secret);
    }
    return parsed as DialpadWebhookPayload;
  }

  return verifyDialpadJwt(trimmed, secret);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractDialpadErrorMessage(data: unknown) {
  const payload = isRecord(data) && isRecord(data.error) ? data.error : data;
  if (!isRecord(payload)) return null;

  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      if (isRecord(item) && typeof item.message === "string" && item.message.trim()) {
        return item.message.trim();
      }
    }
  }

  return null;
}

function isDialpadRateLimitError(data: unknown) {
  const message = extractDialpadErrorMessage(data);
  return typeof message === "string" && message.toLowerCase().includes("rate_limit_exceeded");
}

function getDialpadCallId(data: unknown) {
  if (!isRecord(data)) return null;

  const candidate = data.call_id ?? data.id ?? data.callId;
  if (candidate === null || candidate === undefined) return null;
  return String(candidate);
}

function formatDialpadDate(timestamp?: number | null) {
  if (!timestamp) return null;
  return new Date(timestamp).toISOString();
}

function normalizeDialpadState(state: unknown) {
  if (typeof state !== "string") return null;
  const normalized = state.trim().toLowerCase();
  return normalized || null;
}

function isTerminalDialpadState(state: string | null) {
  return state === "hangup"
    || state === "ended"
    || state === "completed"
    || state === "canceled"
    || state === "cancelled";
}

function isAlreadyEndedDialpadError(status: number, data: unknown) {
  const message = (extractDialpadErrorMessage(data) ?? "").toLowerCase();
  return status === 404
    || message.includes("already ended")
    || message.includes("already hung up")
    || message.includes("not found")
    || message.includes("no active call")
    || message.includes("cannot be hung up");
}

function uniqueNormalizedStrings(values: unknown[]) {
  const seen = new Set<string>();
  const normalizedValues: string[] = [];

  for (const value of values) {
    const normalized = typeof value === "string"
      ? value.trim()
      : typeof value === "number"
        ? String(value)
        : "";

    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedValues.push(normalized);
  }

  return normalizedValues;
}

function extractDialpadUserIds(call: JsonRecord) {
  const target = isRecord(call.target) ? call.target : null;
  const user = isRecord(call.user) ? call.user : null;

  return uniqueNormalizedStrings([
    target?.id,
    target?.user_id,
    call.user_id,
    call.operator_id,
    call.owner_id,
    user?.id,
    user?.user_id,
  ]);
}

function extractDialpadPhoneNumbers(call: JsonRecord) {
  const contact = isRecord(call.contact) ? call.contact : null;
  const customer = isRecord(call.customer) ? call.customer : null;
  const externalContact = isRecord(call.external_contact) ? call.external_contact : null;

  return uniqueNormalizedStrings([
    call.external_number,
    call.phone_number,
    call.customer_number,
    call.external_phone_number,
    contact?.phone,
    contact?.phone_number,
    contact?.number,
    customer?.phone,
    customer?.phone_number,
    customer?.number,
    externalContact?.phone,
    externalContact?.phone_number,
    externalContact?.number,
  ]);
}

function phoneNumbersLikelyMatch(candidate: string, normalizedPhone: string) {
  const candidateDigits = candidate.replace(/\D/g, "");
  const phoneDigits = normalizedPhone.replace(/\D/g, "");

  if (!candidateDigits || !phoneDigits) return false;

  const compareLength = Math.min(8, candidateDigits.length, phoneDigits.length);
  return compareLength >= 6 && candidateDigits.slice(-compareLength) === phoneDigits.slice(-compareLength);
}

function findMatchingActiveCall(items: unknown[], dialpadUserId: string, normalizedPhone: string) {
  const activeCallsForUser = items
    .filter(isRecord)
    .filter((call) => {
      const state = normalizeDialpadState(call.state);
      return !isTerminalDialpadState(state) && extractDialpadUserIds(call).some((value) => value === String(dialpadUserId));
    });

  const phoneMatch = activeCallsForUser.find((call) =>
    extractDialpadPhoneNumbers(call).some((value) => phoneNumbersLikelyMatch(value, normalizedPhone)),
  );

  if (phoneMatch) {
    return { call: phoneMatch, matchType: "phone" as const };
  }

  if (activeCallsForUser.length === 1) {
    return { call: activeCallsForUser[0], matchType: "single_active_user_call" as const };
  }

  return null;
}

function isDialpadCreateCallConflict(status: number, data: unknown) {
  if (status !== 409) return false;
  const message = (extractDialpadErrorMessage(data) ?? "").toLowerCase();
  return message.includes("unable to create call") || message.includes("conflict");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findMatchingActiveCallWithRetries(params: {
  action: string;
  apiKey: string;
  dialpadUserId: string;
  normalizedPhone: string;
  delays: number[];
}) {
  for (let attempt = 0; attempt < params.delays.length; attempt += 1) {
    const delay = params.delays[attempt];
    if (delay > 0) {
      await sleep(delay);
    }

    const response = await fetch(`${DIALPAD_BASE}/call`, {
      headers: { Authorization: `Bearer ${params.apiKey}`, Accept: "application/json" },
    });

    if (!response.ok) {
      console.log(`[${params.action}] Active call lookup failed on attempt ${attempt + 1} with status=${response.status}`);
      await response.text().catch(() => null);
      continue;
    }

    const data = await response.json().catch(() => null);
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    const matchedCall = findMatchingActiveCall(items, params.dialpadUserId, params.normalizedPhone);

    if (matchedCall) {
      console.log(`[${params.action}] Matched active call on attempt ${attempt + 1} via ${matchedCall.matchType}`);
      return matchedCall;
    }
  }

  return null;
}

async function findReusableTrackedCall(params: {
  adminClient: ReturnType<typeof createClient>;
  apiKey: string;
  contactId: string;
  userId: string;
}) {
  const recentWindowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await params.adminClient
    .from("dialpad_calls")
    .select("dialpad_call_id, created_at")
    .eq("contact_id", params.contactId)
    .eq("user_id", params.userId)
    .gte("created_at", recentWindowStart)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  for (const candidate of data ?? []) {
    if (!candidate.dialpad_call_id) continue;

    const response = await fetch(`${DIALPAD_BASE}/call/${candidate.dialpad_call_id}`, {
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) continue;

    const payload = await response.json().catch(() => null);
    const state = normalizeDialpadState(isRecord(payload) ? payload.state : null);

    if (!isTerminalDialpadState(state)) {
      return {
        dialpadCallId: candidate.dialpad_call_id,
        data: payload,
      };
    }
  }

  return null;
}

function buildDialpadClientPayload(params: {
  action: string;
  data: unknown;
  alreadyEnded?: boolean;
  dialpadCallId?: string | null;
  message?: string | null;
  extras?: JsonRecord;
}) {
  const state = normalizeDialpadState(isRecord(params.data) ? params.data.state : null);
  const dialpadCallId = params.dialpadCallId ?? getDialpadCallId(params.data);
  const alreadyEnded = params.alreadyEnded === true;

  return {
    ok: true,
    action: params.action,
    state,
    terminal: alreadyEnded || isTerminalDialpadState(state),
    already_ended: alreadyEnded,
    dialpad_call_id: dialpadCallId,
    message: params.message ?? null,
    details: params.data,
    ...(params.extras ?? {}),
  };
}

function buildDialpadErrorPayload(status: number, data: unknown) {
  const statusCode = status === 429 || isDialpadRateLimitError(data) ? 429 : status;
  const message = extractDialpadErrorMessage(data);

  return {
    ok: false,
    error: statusCode === 429
      ? "Dialpad rate limit reached. Wait a few seconds and try again."
      : `Dialpad API error [${status}]`,
    message,
    retryable: statusCode === 429,
    status_code: statusCode,
    details: data,
  };
}

function buildSummaryNote(summary: string, payload: DialpadWebhookPayload) {
  const lines = [
    "Dialpad Summary",
    payload.external_number ? `- Number: ${payload.external_number}` : null,
    payload.date_ended ? `- Call time: ${new Date(payload.date_ended).toLocaleString("en-AU")}` : null,
    `- Summary: ${summary}`,
  ].filter(Boolean);

  return lines.join("\n");
}

function buildTranscriptText(transcriptPayload: unknown) {
  if (!isRecord(transcriptPayload)) return null;
  const lines = Array.isArray(transcriptPayload.lines) ? transcriptPayload.lines : [];

  const formattedLines = lines
    .filter(isRecord)
    .map((line) => {
      const content = typeof line.content === "string" ? line.content.trim() : "";
      if (!content) return null;
      const speaker = typeof line.name === "string" && line.name.trim()
        ? line.name.trim()
        : typeof line.user_id === "number"
          ? `User ${line.user_id}`
          : "Speaker";
      return `${speaker}: ${content}`;
    })
    .filter((value): value is string => Boolean(value));

  if (formattedLines.length === 0) {
    return null;
  }

  return ["Dialpad Transcript", ...formattedLines].join("\n");
}

async function fetchDialpadTranscript(callId: string, apiKey: string) {
  const response = await fetch(`${DIALPAD_BASE}/transcripts/${callId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return buildTranscriptText(payload);
}

async function fetchDialpadAiRecap(callId: string, apiKey: string) {
  const response = await fetch(`${DIALPAD_BASE}/call/${callId}/ai_recap?summary_format=medium`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();

  if (typeof payload === "string") {
    return payload.trim() || null;
  }

  if (!isRecord(payload)) {
    return null;
  }

  const summaryCandidates = [
    payload.summary,
    payload.recap_summary,
    payload.content,
    payload.short,
    payload.medium,
    payload.long,
  ];

  for (const candidate of summaryCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const bullets = Array.isArray(payload.action_items)
    ? payload.action_items.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return bullets.length > 0 ? bullets.join("\n") : null;
}

async function fetchDialpadCallInfo(callId: string, apiKey: string) {
  const response = await fetch(`${DIALPAD_BASE}/call/${callId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

function toDurationSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;

  return value > 100000 ? Math.round(value / 1000) : Math.round(value);
}

function extractDurationFromRecord(record: JsonRecord | null | undefined, candidates: string[]) {
  if (!record) return null;

  for (const key of candidates) {
    const directValue = toDurationSeconds(record[key]);
    if (directValue !== null) {
      return directValue;
    }
  }

  return null;
}

function extractDialpadDurations(payload: DialpadWebhookPayload, callInfo: unknown) {
  const callInfoRecord = isRecord(callInfo) ? callInfo : null;
  const talkTimeSeconds = extractDurationFromRecord(callInfoRecord, [
    "talk_duration",
    "talk_duration_seconds",
    "talk_time",
    "talk_time_seconds",
    "connected_duration",
    "connected_duration_seconds",
    "duration_connected",
    "duration_connected_seconds",
  ]) ?? (
    typeof payload.date_connected === "number" && typeof payload.date_ended === "number"
      ? Math.max(0, Math.round((payload.date_ended - payload.date_connected) / 1000))
      : null
  );

  const totalDurationSeconds = extractDurationFromRecord(callInfoRecord, [
    "duration",
    "duration_seconds",
    "call_duration",
    "call_duration_seconds",
    "total_duration",
    "total_duration_seconds",
  ]) ?? (
    typeof payload.date_started === "number" && typeof payload.date_ended === "number"
      ? Math.max(0, Math.round((payload.date_ended - payload.date_started) / 1000))
      : null
  );

  return {
    talkTimeSeconds,
    totalDurationSeconds,
  };
}

async function upsertContactNote(adminClient: ReturnType<typeof createClient>, params: {
  contactId: string;
  createdBy: string;
  dialpadCallId: string;
  source: "dialpad_summary" | "dialpad_transcript";
  content: string;
}) {
  const { data: existing, error: existingError } = await adminClient
    .from("contact_notes")
    .select("id")
    .eq("contact_id", params.contactId)
    .eq("created_by", params.createdBy)
    .eq("dialpad_call_id", params.dialpadCallId)
    .eq("source", params.source)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    const { error } = await adminClient
      .from("contact_notes")
      .update({ content: params.content })
      .eq("id", existing.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await adminClient.from("contact_notes").insert({
    contact_id: params.contactId,
    created_by: params.createdBy,
    dialpad_call_id: params.dialpadCallId,
    source: params.source,
    content: params.content,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function findTrackedDialpadCall(adminClient: ReturnType<typeof createClient>, payload: DialpadWebhookPayload) {
  const candidateIds = [
    payload.call_id,
    payload.master_call_id,
    payload.entry_point_call_id,
    payload.operator_call_id,
  ]
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value));

  for (const candidateId of candidateIds) {
    const { data, error } = await adminClient
      .from("dialpad_calls")
      .select("id, user_id, contact_id, call_log_id, dialpad_call_id, created_at")
      .eq("dialpad_call_id", candidateId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }
  }

  return null;
}

async function findCallLogByFallback(
  adminClient: ReturnType<typeof createClient>,
  contactId: string,
  userId: string,
  trackedCreatedAt: string,
) {
  const windowStart = new Date(new Date(trackedCreatedAt).getTime() - 15 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(trackedCreatedAt).getTime() + 15 * 60 * 1000).toISOString();

  const { data, error } = await adminClient
    .from("call_logs")
    .select("id")
    .eq("contact_id", contactId)
    .eq("user_id", userId)
    .gte("created_at", windowStart)
    .lte("created_at", windowEnd)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`[syncWebhookPayload] Fallback call_log query error: ${error.message}`);
    return null;
  }

  return data?.id ?? null;
}

async function syncWebhookPayload(params: {
  adminClient: ReturnType<typeof createClient>;
  payload: DialpadWebhookPayload;
  apiKey: string;
}) {
  const { adminClient, payload, apiKey } = params;

  if (!payload.state || !SYNC_RELEVANT_STATES.has(payload.state)) {
    return { ignored: true, reason: `Ignoring state ${payload.state ?? "unknown"}` };
  }

  const trackedCall = await findTrackedDialpadCall(adminClient, payload);
  if (!trackedCall) {
    return { ignored: true, reason: "Tracked Dialpad call not found" };
  }

  const dialpadCallId = trackedCall.dialpad_call_id;
  const callInfo = payload.state === "hangup" ? await fetchDialpadCallInfo(dialpadCallId, apiKey) : null;
  const { talkTimeSeconds, totalDurationSeconds } = extractDialpadDurations(payload, callInfo);
  const summary = typeof payload.recap_summary === "string" && payload.recap_summary.trim()
    ? payload.recap_summary.trim()
    : await fetchDialpadAiRecap(dialpadCallId, apiKey);

  const transcript = payload.state === "call_transcription" || payload.state === "hangup"
    ? await fetchDialpadTranscript(dialpadCallId, apiKey)
    : null;

  const hasSummary = Boolean(summary);
  const hasTranscript = Boolean(transcript);
  const syncedAt = hasSummary || hasTranscript ? new Date().toISOString() : null;

  // Resolve the call_log_id — use existing link, then try dialpad_call_id match, then fallback by contact+user+time
  let resolvedCallLogId = trackedCall.call_log_id;

  if (!resolvedCallLogId) {
    // Try matching call_logs by dialpad_call_id
    const { data: byDialpadId } = await adminClient
      .from("call_logs")
      .select("id")
      .eq("dialpad_call_id", dialpadCallId)
      .limit(1)
      .maybeSingle();

    if (byDialpadId?.id) {
      resolvedCallLogId = byDialpadId.id;
    }
  }

  if (!resolvedCallLogId) {
    // Fallback: match by contact_id + user_id within 15-minute window of tracked call creation
    resolvedCallLogId = await findCallLogByFallback(
      adminClient,
      trackedCall.contact_id,
      trackedCall.user_id,
      trackedCall.created_at,
    );

    if (resolvedCallLogId) {
      console.log(`[syncWebhookPayload] Fallback matched call_log_id=${resolvedCallLogId} for dialpad_call_id=${dialpadCallId}`);
      // Link the dialpad_calls record to the found call_log
      await adminClient
        .from("dialpad_calls")
        .update({ call_log_id: resolvedCallLogId })
        .eq("id", trackedCall.id);
    }
  }

  if (resolvedCallLogId) {
    const updatePayload: Record<string, unknown> = {
      dialpad_call_id: dialpadCallId,
    };
    if (summary !== undefined) updatePayload.dialpad_summary = summary;
    if (transcript !== undefined) updatePayload.dialpad_transcript = transcript;
    if (syncedAt) updatePayload.transcript_synced_at = syncedAt;
    if (talkTimeSeconds !== null) updatePayload.dialpad_talk_time_seconds = talkTimeSeconds;
    if (totalDurationSeconds !== null) updatePayload.dialpad_total_duration_seconds = totalDurationSeconds;

    const { error: callLogError } = await adminClient
      .from("call_logs")
      .update(updatePayload)
      .eq("id", resolvedCallLogId);

    if (callLogError) {
      console.warn(`[syncWebhookPayload] call_logs update error: ${callLogError.message}`);
    }
  } else {
    console.warn(`[syncWebhookPayload] No call_log found for dialpad_call_id=${dialpadCallId} — talk time data will be lost`);
  }

  if (hasSummary) {
    await upsertContactNote(adminClient, {
      contactId: trackedCall.contact_id,
      createdBy: trackedCall.user_id,
      dialpadCallId,
      source: "dialpad_summary",
      content: buildSummaryNote(summary!, payload),
    });
  }

  if (hasTranscript) {
    await upsertContactNote(adminClient, {
      contactId: trackedCall.contact_id,
      createdBy: trackedCall.user_id,
      dialpadCallId,
      source: "dialpad_transcript",
      content: transcript!,
    });
  }

  const nextStatus = hasSummary || hasTranscript
    ? "synced"
    : payload.state === "hangup"
      ? "processing"
      : "pending";

  const { error: trackingError } = await adminClient
    .from("dialpad_calls")
    .update({
      sync_status: nextStatus,
      call_state: payload.state === "hangup" ? "hangup" : undefined,
      transcript_synced_at: syncedAt ?? undefined,
      sync_error: null,
    })
    .eq("id", trackedCall.id);

  if (trackingError) {
    throw new Error(trackingError.message);
  }

  return {
    ignored: false,
    dialpad_call_id: dialpadCallId,
    sync_status: nextStatus,
    transcript_synced: hasTranscript,
    summary_synced: hasSummary,
    talk_time_seconds: talkTimeSeconds,
    total_duration_seconds: totalDurationSeconds,
    call_log_linked: !!resolvedCallLogId,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const DIALPAD_API_KEY = Deno.env.get("DIALPAD_API_KEY");
  if (!DIALPAD_API_KEY) {
    return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return jsonResponse({ error: "SUPABASE_URL is not configured" }, 500);
  }

  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseAnonKey) {
    return jsonResponse({ error: "SUPABASE_ANON_KEY is not configured" }, 500);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return jsonResponse({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    const webhookSecret = Deno.env.get("DIALPAD_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return jsonResponse({ error: "DIALPAD_WEBHOOK_SECRET is not configured" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    try {
      const payload = await extractWebhookPayload(req, webhookSecret);
      const result = await syncWebhookPayload({
        adminClient,
        payload,
        apiKey: DIALPAD_API_KEY,
      });
      return jsonResponse(result, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown webhook error";
      return jsonResponse({ error: message }, 400);
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { action, ...params } = await req.json();

    let dialpadResponse: Response;

    switch (action) {
      case "initiate_call": {
        let normalizedPhone: string;

        try {
          normalizedPhone = normalizePhoneNumberToE164(params.phone);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Phone number is invalid";
          return jsonResponse({ error: message }, 400);
        }

        if (params.contact_id) {
          
          const reusableCall = await findReusableTrackedCall({
            adminClient,
            apiKey: DIALPAD_API_KEY,
            contactId: params.contact_id,
            userId: user.id,
          });

          if (reusableCall) {
            return jsonResponse(buildDialpadClientPayload({
              action,
              data: reusableCall.data,
              dialpadCallId: reusableCall.dialpadCallId,
              message: "Existing Dialpad call is already active for this lead.",
            }), 200);
          }
        }

        // Use the user-scoped initiate_call endpoint instead of POST /call
        // This initiates a direct outbound call and works even when the user is in DND mode
        const initiateResponse = await fetch(`${DIALPAD_BASE}/users/${params.dialpad_user_id}/initiate_call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone_number: normalizedPhone,
            ...(params.caller_id ? { caller_id: params.caller_id } : {}),
            custom_data: params.contact_id ? JSON.stringify({ contact_id: params.contact_id, user_id: user.id }) : undefined,
          }),
        });

         if (!initiateResponse.ok) {
          const initiateData = await initiateResponse.json().catch(() => null);
          const initiateMessage = extractDialpadErrorMessage(initiateData) ?? "";
          const lowerMessage = initiateMessage.toLowerCase();

          // If user has no active Dialpad app, fall back to the ring-based POST /call endpoint
          const isNoAppsError = lowerMessage.includes("no apps available");
          if (isNoAppsError) {
            const fallbackBody: Record<string, unknown> = {
              phone_number: normalizedPhone,
              user_id: params.dialpad_user_id,
            };
            if (params.caller_id) fallbackBody.caller_id = params.caller_id;
            if (params.contact_id) {
              fallbackBody.custom_data = JSON.stringify({ contact_id: params.contact_id, user_id: user.id });
            }

            dialpadResponse = await fetch(`${DIALPAD_BASE}/call`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${DIALPAD_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(fallbackBody),
            });
            break;
          }

          // "User is currently on a call" means the call was already placed — try to discover it
          const isAlreadyOnCall = lowerMessage.includes("currently on a call");
          if (isAlreadyOnCall) {
            console.log(`[initiate_call] User already on a call — running call discovery for user=${params.dialpad_user_id} phone=${normalizedPhone}`);
            // Fall through to the call discovery loop below
          } else {
            // Reconstruct a failed Response so the downstream error handler works
            dialpadResponse = new Response(JSON.stringify(initiateData), {
              status: initiateResponse.status,
              headers: { "Content-Type": "application/json" },
            });
            break;
          }
        }

        const initiateData = await initiateResponse.json().catch(() => ({}));

        // The initiate_call endpoint doesn't return a call_id directly.
        // Poll with bounded backoff to find the new call by matching user + phone.
        let foundCallId: string | null = null;
        let foundCallState: string | null = null;
        const pollDelays = [0, 200, 400, 600, 800]; // Aggressive server-side discovery
        console.log(`[initiate_call] Starting call discovery for user=${params.dialpad_user_id} phone=${normalizedPhone}`);

        for (let attempt = 0; attempt < pollDelays.length; attempt++) {
          if (pollDelays[attempt] > 0) {
            await new Promise((resolve) => setTimeout(resolve, pollDelays[attempt]));
          }

          const callsResponse = await fetch(
            `${DIALPAD_BASE}/call`,
            {
              headers: {
                Authorization: `Bearer ${DIALPAD_API_KEY}`,
                Accept: "application/json",
              },
            },
          );

          if (!callsResponse.ok) {
            await callsResponse.text();
            continue;
          }

          const callsData = await callsResponse.json().catch(() => null);
          const items = Array.isArray(callsData?.items) ? callsData.items : Array.isArray(callsData) ? callsData : [];
          const matchedCall = findMatchingActiveCall(items, String(params.dialpad_user_id), normalizedPhone);

          if (matchedCall) {
            foundCallId = getDialpadCallId(matchedCall.call);
            foundCallState = normalizeDialpadState(matchedCall.call.state);

            if (foundCallId) {
              console.log(`[initiate_call] Found call_id=${foundCallId} via ${matchedCall.matchType} on attempt ${attempt + 1}`);
              break;
            }
          }
        }

        if (foundCallId) {
          // Write call_state + create tracking record immediately
          if (params.contact_id) {
            await adminClient.from("dialpad_calls").upsert({
              dialpad_call_id: foundCallId,
              contact_id: params.contact_id,
              user_id: user.id,
              sync_status: "pending",
              call_state: foundCallState ?? "calling",
            }, { onConflict: "dialpad_call_id" }).then(() => {});
          }

          dialpadResponse = new Response(JSON.stringify({
            call_id: foundCallId,
            state: foundCallState ?? "calling",
            call_resolved: true,
            ...initiateData,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } else {
          // Call was initiated but we couldn't discover the call_id yet.
          console.warn(`[initiate_call] Could not discover call_id after ${pollDelays.length} attempts for user=${params.dialpad_user_id}`);
          dialpadResponse = new Response(JSON.stringify({
            ...initiateData,
            state: "calling",
            call_resolved: false,
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        break;
      }

      case "get_caller_ids": {
        const dialpadUserId = params.dialpad_user_id;
        if (!dialpadUserId) {
          return jsonResponse({ error: "dialpad_user_id is required" }, 400);
        }

        const callerIdResponse = await fetch(`${DIALPAD_BASE}/users/${dialpadUserId}/caller_id`, {
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            Accept: "application/json",
          },
        });

        if (!callerIdResponse.ok) {
          const callerIdData = await callerIdResponse.json().catch(() => null);
          const errorPayload = buildDialpadErrorPayload(callerIdResponse.status, callerIdData);
          return jsonResponse(errorPayload, errorPayload.status_code);
        }

        const callerIdData = await callerIdResponse.json();
        const numbers: { number: string; label: string }[] = [];

        // Add user's own caller ID
        if (isRecord(callerIdData) && typeof callerIdData.caller_id === "string" && callerIdData.caller_id.trim()) {
          numbers.push({ number: callerIdData.caller_id.trim(), label: "My Number" });
        }

        // Add group caller IDs (departments, offices, etc.)
        if (isRecord(callerIdData) && Array.isArray(callerIdData.groups)) {
          for (const group of callerIdData.groups) {
            if (isRecord(group) && typeof group.caller_id === "string" && group.caller_id.trim()) {
              const label = typeof group.display_name === "string" && group.display_name.trim()
                ? group.display_name.trim()
                : "Group";
              // Avoid duplicates
              if (!numbers.some((n) => n.number === group.caller_id)) {
                numbers.push({ number: group.caller_id.trim(), label });
              }
            }
          }
        }

        return jsonResponse({ ok: true, numbers }, 200);
      }

      case "log_call": {
        

        const { data: settings, error: settingsError } = await adminClient
          .from("dialpad_settings")
          .select("dialpad_user_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (settingsError) {
          return jsonResponse({ error: "Failed to fetch Dialpad settings", details: settingsError.message }, 500);
        }

        const dialpadUserId = params.dialpad_user_id || settings?.dialpad_user_id;
        if (!dialpadUserId) {
          return jsonResponse({ error: "No Dialpad user ID configured. Ask an admin to assign one." }, 400);
        }

        let normalizedPhone: string;

        try {
          normalizedPhone = normalizePhoneNumberToE164(params.phone);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Phone number is invalid";
          return jsonResponse({ error: message }, 400);
        }

        dialpadResponse = await fetch(`${DIALPAD_BASE}/users/${dialpadUserId}/initiate_call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone_number: normalizedPhone,
          }),
        });
        break;
      }

      case "resolve_call": {
        const resolveDialpadUserId = params.dialpad_user_id;
        let resolvePhone: string;
        try {
          resolvePhone = normalizePhoneNumberToE164(params.phone);
        } catch {
          return jsonResponse({ error: "Invalid phone number" }, 400);
        }

        console.log(`[resolve_call] Searching for active call: user=${resolveDialpadUserId} phone=${resolvePhone}`);

        const matchedCall = await findMatchingActiveCallWithRetries({
          action: "resolve_call",
          apiKey: DIALPAD_API_KEY,
          dialpadUserId: String(resolveDialpadUserId),
          normalizedPhone: resolvePhone,
          delays: [0, 120, 180, 250, 350],
        });

        if (matchedCall) {
          const callId = getDialpadCallId(matchedCall.call);
          const state = normalizeDialpadState(matchedCall.call.state);

          if (callId) {
            console.log(`[resolve_call] Found active call_id=${callId} state=${state} via ${matchedCall.matchType}`);

            if (params.contact_id) {
              
              await adminClient.from("dialpad_calls").upsert({
                dialpad_call_id: callId,
                contact_id: params.contact_id,
                user_id: user.id,
                sync_status: "pending",
                call_state: state ?? "calling",
              }, { onConflict: "dialpad_call_id" }).then(() => {});
            }

            return jsonResponse({
              ok: true,
              action: "resolve_call",
              call_id: callId,
              dialpad_call_id: callId,
              state,
              call_resolved: true,
            }, 200);
          }
        }

        console.log(`[resolve_call] No active call found for user=${resolveDialpadUserId}`);
        return jsonResponse({
          ok: true,
          action: "resolve_call",
          call_id: null,
          dialpad_call_id: null,
          state: null,
          call_resolved: false,
        }, 200);
      }

      case "get_call_status": {
        console.log(`[get_call_status] Fetching status for call_id=${params.call_id}`);
        dialpadResponse = await fetch(`${DIALPAD_BASE}/call/${params.call_id}`, {
          headers: { Authorization: `Bearer ${DIALPAD_API_KEY}` },
        });
        const statusBody = await dialpadResponse.clone().json().catch(() => null);
        console.log(`[get_call_status] Response status=${dialpadResponse.status} state=${statusBody?.state ?? 'unknown'}`);
        break;
      }

      case "force_hangup": {
        const fhDialpadUserId = params.dialpad_user_id;
        if (!fhDialpadUserId) {
          return jsonResponse({ error: "dialpad_user_id is required" }, 400);
        }
        let fhPhone: string;
        try {
          fhPhone = normalizePhoneNumberToE164(params.phone);
        } catch {
          return jsonResponse({ error: "Invalid phone number" }, 400);
        }

        console.log(`[force_hangup] Searching for active call: user=${fhDialpadUserId} phone=${fhPhone}`);

        const matchedCall = await findMatchingActiveCallWithRetries({
          action: "force_hangup",
          apiKey: DIALPAD_API_KEY,
          dialpadUserId: String(fhDialpadUserId),
          normalizedPhone: fhPhone,
          delays: [0, 150, 250, 400, 600, 900, 1200],
        });

        if (matchedCall) {
          const callId = getDialpadCallId(matchedCall.call);

          if (callId) {
            console.log(`[force_hangup] Found active call_id=${callId} via ${matchedCall.matchType}, hanging up`);

            const fhHangupUrl = `${DIALPAD_BASE}/call/${callId}/actions/hangup`;
            const fhHangupResponse = await fetch(fhHangupUrl, {
              method: "POST",
              headers: { Authorization: `Bearer ${DIALPAD_API_KEY}`, Accept: "application/json" },
            });
            const fhHangupData = await fhHangupResponse.json().catch(() => null);
            console.log(`[force_hangup] Hangup response status=${fhHangupResponse.status}`);

            if (!fhHangupResponse.ok) {
              if (isAlreadyEndedDialpadError(fhHangupResponse.status, fhHangupData)) {
                return jsonResponse(buildDialpadClientPayload({
                  action,
                  data: { state: "hangup" },
                  dialpadCallId: callId,
                  alreadyEnded: true,
                  message: "This call has already ended.",
                }), 200);
              }

              const errorPayload = buildDialpadErrorPayload(fhHangupResponse.status, fhHangupData);
              return jsonResponse(errorPayload, errorPayload.status_code);
            }

            return jsonResponse(buildDialpadClientPayload({
              action,
              data: fhHangupData ?? { state: "hangup" },
              dialpadCallId: callId,
              message: "Hangup requested. Waiting for Dialpad to confirm the call end.",
            }), 200);
          }
        }

        console.log(`[force_hangup] No active call found after retry window`);
        return jsonResponse({
          ok: true,
          action: "force_hangup",
          dialpad_call_id: null,
          state: "hangup",
          terminal: true,
          already_ended: true,
          call_resolved: false,
          message: "No active call found to hang up.",
        }, 200);
      }

      case "hangup_call": {
        if (!params.call_id) {
          return jsonResponse({ error: "call_id is required" }, 400);
        }

        console.log(`[hangup_call] Attempting hangup for call_id=${params.call_id}`);

        const callStatusResponse = await fetch(`${DIALPAD_BASE}/call/${params.call_id}`, {
          headers: { Authorization: `Bearer ${DIALPAD_API_KEY}` },
        });

        const callStatusData = await callStatusResponse.json().catch(() => null);
        console.log(`[hangup_call] GET /call/${params.call_id} status=${callStatusResponse.status} data=${JSON.stringify(callStatusData)}`);

        if (!callStatusResponse.ok) {
          if (isAlreadyEndedDialpadError(callStatusResponse.status, callStatusData)) {
            return jsonResponse(buildDialpadClientPayload({
              action,
              data: { state: "hangup" },
              dialpadCallId: String(params.call_id),
              alreadyEnded: true,
              message: "This call has already ended.",
            }), 200);
          }

          const errorPayload = buildDialpadErrorPayload(callStatusResponse.status, callStatusData);
          return jsonResponse(errorPayload, errorPayload.status_code);
        }

        const callState = normalizeDialpadState(isRecord(callStatusData) ? callStatusData.state : null);
        console.log(`[hangup_call] Current call state: ${callState}`);
        if (isTerminalDialpadState(callState)) {
          return jsonResponse(buildDialpadClientPayload({
            action,
            data: callStatusData,
            dialpadCallId: String(params.call_id),
            alreadyEnded: true,
            message: "This call has already ended.",
          }), 200);
        }

        const hangupUrl = `${DIALPAD_BASE}/call/${params.call_id}/actions/hangup`;
        console.log(`[hangup_call] POST ${hangupUrl}`);
        dialpadResponse = await fetch(hangupUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            Accept: "application/json",
          },
        });

        const hangupData = await dialpadResponse.json().catch(() => null);
        console.log(`[hangup_call] Hangup response status=${dialpadResponse.status} data=${JSON.stringify(hangupData)}`);

        if (!dialpadResponse.ok) {
          if (isAlreadyEndedDialpadError(dialpadResponse.status, hangupData)) {
            return jsonResponse(buildDialpadClientPayload({
              action,
              data: { state: "hangup" },
              dialpadCallId: String(params.call_id),
              alreadyEnded: true,
              message: "This call has already ended.",
            }), 200);
          }

          const errorPayload = buildDialpadErrorPayload(dialpadResponse.status, hangupData);
          return jsonResponse(errorPayload, errorPayload.status_code);
        }

        return jsonResponse(buildDialpadClientPayload({
          action,
          data: hangupData,
          dialpadCallId: String(params.call_id),
          message: "Hangup requested. Waiting for Dialpad to confirm the call end.",
        }), 200);
      }

      case "list_calls": {
        const qs = new URLSearchParams();
        if (params.limit) qs.set("limit", params.limit);
        if (params.cursor) qs.set("cursor", params.cursor);
        dialpadResponse = await fetch(`${DIALPAD_BASE}/stats/calls?${qs}`, {
          headers: { Authorization: `Bearer ${DIALPAD_API_KEY}` },
        });
        break;
      }

      case "list_users": {
        const qs = new URLSearchParams();
        if (params.state) qs.set("state", params.state);
        if (params.office_id) qs.set("office_id", params.office_id);
        if (params.limit) qs.set("limit", String(params.limit));
        if (params.cursor) qs.set("cursor", params.cursor);
        const suffix = qs.toString() ? `?${qs}` : "";

        dialpadResponse = await fetch(`${DIALPAD_BASE}/users${suffix}`, {
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            Accept: "application/json",
          },
        });
        break;
      }

      case "sync_users": {
        

        const { data: adminRole, error: adminRoleError } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (adminRoleError) {
          return jsonResponse({ error: "Failed to verify admin access", details: adminRoleError.message }, 500);
        }

        if (!adminRole) {
          return jsonResponse({ error: "Admin access required" }, 403);
        }

        const usersResponse = await fetch(`${DIALPAD_BASE}/users?limit=100`, {
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            Accept: "application/json",
          },
        });

        const usersPayload = await usersResponse.json();
        if (!usersResponse.ok) {
          return jsonResponse({ error: `Dialpad API error [${usersResponse.status}]`, details: usersPayload }, usersResponse.status);
        }

        const dialpadUsers = Array.isArray(usersPayload?.items) ? usersPayload.items : [];
        const emails = dialpadUsers
          .flatMap((dialpadUser: { emails?: string[] }) => dialpadUser.emails ?? [])
          .map((email: string) => email.toLowerCase());

        const { data: existingProfiles, error: profilesError } = await adminClient
          .from("profiles")
          .select("user_id, email")
          .in("email", emails);

        if (profilesError) {
          return jsonResponse({ error: "Failed to load existing profiles", details: profilesError.message }, 500);
        }

        const profileMap = new Map(
          (existingProfiles ?? [])
            .filter((profile) => profile.email)
            .map((profile) => [profile.email!.toLowerCase(), profile.user_id]),
        );

        const results = [];

        for (const dialpadUser of dialpadUsers) {
          const email = dialpadUser.emails?.[0]?.toLowerCase();
          if (!email) continue;

          let appUserId = profileMap.get(email);
          let invited = false;

          if (!appUserId) {
            const { data: invitedUser, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
              data: {
                display_name: dialpadUser.display_name ?? email.split("@")[0],
              },
            });

            if (inviteError) {
              results.push({
                email,
                invited: false,
                mapped: false,
                error: inviteError.message,
              });
              continue;
            }

            appUserId = invitedUser.user?.id;
            invited = true;
          }

          if (!appUserId) {
            results.push({
              email,
              invited,
              mapped: false,
              error: "No app user ID available after invite.",
            });
            continue;
          }

          const phoneNumber = Array.isArray(dialpadUser.phone_numbers) && dialpadUser.phone_numbers.length > 0
            ? dialpadUser.phone_numbers[0]
            : null;

          const { error: roleError } = await adminClient
            .from("user_roles")
            .upsert({ user_id: appUserId, role: "sales_rep" }, { onConflict: "user_id,role" });

          if (roleError) {
            results.push({
              email,
              invited,
              mapped: false,
              error: roleError.message,
            });
            continue;
          }

          const { error: mappingError } = await adminClient
            .from("dialpad_settings")
            .upsert(
              {
                user_id: appUserId,
                dialpad_user_id: dialpadUser.id,
                dialpad_phone_number: phoneNumber,
                is_active: true,
              },
              { onConflict: "user_id" },
            );

          if (mappingError) {
            results.push({
              email,
              invited,
              mapped: false,
              error: mappingError.message,
            });
            continue;
          }

          results.push({
            email,
            invited,
            mapped: true,
            dialpad_user_id: dialpadUser.id,
            dialpad_phone_number: phoneNumber,
          });
        }

        return jsonResponse({ items: results }, 200);
      }

      case "backfill_talk_time": {
        // Admin-only action to link unlinked dialpad_calls to call_logs and fetch talk time
        const { data: adminRole } = await adminClient
          .from("user_roles")
          .select("id")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!adminRole) {
          return jsonResponse({ error: "Admin access required" }, 403);
        }

        const { data: unlinked, error: unlinkedError } = await adminClient
          .from("dialpad_calls")
          .select("id, dialpad_call_id, contact_id, user_id, created_at")
          .is("call_log_id", null)
          .order("created_at", { ascending: false })
          .limit(200);

        if (unlinkedError) {
          return jsonResponse({ error: unlinkedError.message }, 500);
        }

        const results: Array<{ dialpad_call_id: string; linked: boolean; talk_time_seconds?: number | null }> = [];

        for (const record of unlinked ?? []) {
          const callLogId = await findCallLogByFallback(
            adminClient,
            record.contact_id,
            record.user_id,
            record.created_at,
          );

          if (!callLogId) {
            results.push({ dialpad_call_id: record.dialpad_call_id, linked: false });
            continue;
          }

          // Link the records
          await adminClient
            .from("dialpad_calls")
            .update({ call_log_id: callLogId })
            .eq("id", record.id);

          // Fetch talk time from Dialpad
          const callInfoData = await fetchDialpadCallInfo(record.dialpad_call_id, DIALPAD_API_KEY);
          const durations = extractDialpadDurations({} as DialpadWebhookPayload, callInfoData);

          const updateData: Record<string, unknown> = {
            dialpad_call_id: record.dialpad_call_id,
          };
          if (durations.talkTimeSeconds !== null) updateData.dialpad_talk_time_seconds = durations.talkTimeSeconds;
          if (durations.totalDurationSeconds !== null) updateData.dialpad_total_duration_seconds = durations.totalDurationSeconds;

          await adminClient
            .from("call_logs")
            .update(updateData)
            .eq("id", callLogId);

          results.push({
            dialpad_call_id: record.dialpad_call_id,
            linked: true,
            talk_time_seconds: durations.talkTimeSeconds,
          });
        }

        return jsonResponse({
          ok: true,
          total_unlinked: unlinked?.length ?? 0,
          linked: results.filter((r) => r.linked).length,
          results,
        }, 200);
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    const data = await dialpadResponse.json().catch(() => null);
    if (!dialpadResponse.ok) {
      if (action === "initiate_call" && params.contact_id && isDialpadCreateCallConflict(dialpadResponse.status, data)) {
        
        const reusableCall = await findReusableTrackedCall({
          adminClient,
          apiKey: DIALPAD_API_KEY,
          contactId: params.contact_id,
          userId: user.id,
        });

        if (reusableCall) {
          return jsonResponse(buildDialpadClientPayload({
            action,
            data: reusableCall.data,
            dialpadCallId: reusableCall.dialpadCallId,
            message: "Existing Dialpad call is already active for this lead.",
          }), 200);
        }
      }

      const errorPayload = buildDialpadErrorPayload(dialpadResponse.status, data);
      return jsonResponse(
        isDialpadCreateCallConflict(dialpadResponse.status, data)
          ? {
              ...errorPayload,
              message:
                "A Dialpad call is already being created or is still active for this rep. Wait a moment and use the active call.",
            }
          : errorPayload,
        errorPayload.status_code,
      );
    }

    if (action === "initiate_call" && params.contact_id) {
      
      const dialpadCallId = getDialpadCallId(data);

      if (dialpadCallId) {
        const { error: trackingError } = await adminClient.from("dialpad_calls").insert({
          dialpad_call_id: dialpadCallId,
          contact_id: params.contact_id,
          user_id: user.id,
          sync_status: "pending",
        });

        return jsonResponse(buildDialpadClientPayload({
          action,
          data,
          dialpadCallId,
          message: "Dialpad call initiated.",
          extras: trackingError
            ? { tracking_warning: trackingError.message }
            : { tracking_created_at: formatDialpadDate(Date.now()) },
        }), 200);
      }
    }

    if (action === "initiate_call" || action === "log_call" || action === "get_call_status") {
      return jsonResponse(buildDialpadClientPayload({
        action,
        data,
        message: action === "get_call_status"
          ? "Dialpad call status refreshed."
          : "Dialpad call initiated.",
      }), 200);
    }

    return jsonResponse(data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
