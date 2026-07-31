// @ts-nocheck — Edge functions run untyped; the Database generic is unavailable in Deno runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DIALPAD_BASE = "https://dialpad.com/api/v2";
const SYNC_RELEVANT_STATES = new Set(["hangup", "call_transcription", "recap_summary", "calling", "ringing", "connected"]);

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
  custom_data?: string | JsonRecord | null;
  contact_id?: string | null;
  user_id?: string | null;
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

function timingSafeEqual(a: string, b: string) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const maxLength = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }

  return diff === 0;
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
  if (!timingSafeEqual(expectedSignature, encodedSignature)) {
    throw new Error("Dialpad webhook signature verification failed");
  }

  return JSON.parse(decodeBase64Url(encodedPayload)) as DialpadWebhookPayload;
}

async function extractWebhookPayload(req: Request, secret: string, allowUnsignedJson = false) {
  const rawBody = await req.text();
  const trimmed = rawBody.trim();

  if (!trimmed) {
    throw new Error("Empty webhook payload");
  }

  if (trimmed.startsWith("{")) {
    if (!allowUnsignedJson) {
      throw new Error("Unsigned Dialpad webhook payloads are not allowed");
    }
    return JSON.parse(trimmed) as DialpadWebhookPayload;
  }

  if (trimmed.startsWith('"')) {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "string") {
      return verifyDialpadJwt(parsed, secret);
    }

    if (!allowUnsignedJson) {
      throw new Error("Unsigned Dialpad webhook payloads are not allowed");
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

function isDialpadDndAvailabilityError(data: unknown) {
  const message = extractDialpadErrorMessage(data);
  if (typeof message !== "string") return false;

  const normalized = message.toLowerCase();
  return normalized.includes("do not disturb")
    || normalized.includes("user unavailable")
    || normalized.includes("user is unavailable")
    || normalized.includes("not available")
    || normalized.includes("currently unavailable");
}

async function fetchDialpadUserDetails(apiKey: string, dialpadUserId: string) {
  const response = await fetch(`${DIALPAD_BASE}/users/${dialpadUserId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

async function resolveAuthorizedDialpadUserId(params: {
  adminClient: ReturnType<typeof createClient>;
  userId: string;
  requestedDialpadUserId: unknown;
  isAdmin: boolean;
}) {
  const requestedDialpadUserId = typeof params.requestedDialpadUserId === "string"
    ? params.requestedDialpadUserId.trim()
    : "";

  const { data: settings, error } = await params.adminClient
    .from("dialpad_settings")
    .select("dialpad_user_id")
    .eq("user_id", params.userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      status: 500,
      body: { error: "Failed to fetch Dialpad settings", details: error.message },
    };
  }

  const assignedDialpadUserId = typeof settings?.dialpad_user_id === "string"
    ? settings.dialpad_user_id.trim()
    : "";

  if (params.isAdmin) {
    const resolvedDialpadUserId = requestedDialpadUserId || assignedDialpadUserId;
    if (!resolvedDialpadUserId) {
      return {
        ok: false as const,
        status: 400,
        body: { error: "dialpad_user_id is required" },
      };
    }

    return {
      ok: true as const,
      dialpadUserId: resolvedDialpadUserId,
      assignedDialpadUserId: assignedDialpadUserId || null,
    };
  }

  if (!assignedDialpadUserId) {
    return {
      ok: false as const,
      status: 400,
      body: { error: "No Dialpad user ID configured. Ask an admin to assign one." },
    };
  }

  if (requestedDialpadUserId && requestedDialpadUserId != assignedDialpadUserId) {
    return {
      ok: false as const,
      status: 403,
      body: { error: "You are not allowed to use another user's Dialpad assignment." },
    };
  }

  return {
    ok: true as const,
    dialpadUserId: assignedDialpadUserId,
    assignedDialpadUserId,
  };
}

async function toggleDialpadDoNotDisturb(apiKey: string, dialpadUserId: string) {
  const response = await fetch(`${DIALPAD_BASE}/users/${dialpadUserId}/togglednd`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  const body = await response.text().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function waitForDialpadDndState(params: {
  apiKey: string;
  dialpadUserId: string;
  expectedEnabled: boolean;
  attempts?: number;
  delayMs?: number;
}) {
  const attempts = params.attempts ?? 8;
  const delayMs = params.delayMs ?? 250;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(delayMs);
    }

    const userDetails = await fetchDialpadUserDetails(params.apiKey, params.dialpadUserId).catch(() => null);
    if (!userDetails?.ok || !isRecord(userDetails.data)) {
      continue;
    }

    if (userDetails.data.do_not_disturb === params.expectedEnabled) {
      return true;
    }
  }

  return false;
}

function scheduleDialpadDndRestore(params: {
  apiKey: string;
  dialpadUserId: string;
  delayMs?: number;
}) {
  const restoreTask = (async () => {
    await sleep(params.delayMs ?? 1500);
    console.log(`[initiate_call] Restoring DND for user ${params.dialpadUserId}`);

    const restoreResult = await toggleDialpadDoNotDisturb(params.apiKey, params.dialpadUserId);
    if (!restoreResult.ok) {
      console.warn(`[initiate_call] Failed to restore DND: status=${restoreResult.status}`);
      return;
    }

    const restored = await waitForDialpadDndState({
      apiKey: params.apiKey,
      dialpadUserId: params.dialpadUserId,
      expectedEnabled: true,
      attempts: 6,
      delayMs: 300,
    });

    if (!restored) {
      console.warn(`[initiate_call] DND restore could not be confirmed for user ${params.dialpadUserId}`);
    }
  })().catch((error) => {
    console.warn("[initiate_call] Failed to restore DND:", error);
  });

  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(restoreTask);
    return;
  }
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

function extractPayloadLinkage(payload: DialpadWebhookPayload) {
  let contactId = typeof payload.contact_id === "string" && payload.contact_id.trim()
    ? payload.contact_id.trim()
    : null;
  let userId = typeof payload.user_id === "string" && payload.user_id.trim()
    ? payload.user_id.trim()
    : null;

  const customData = payload.custom_data;
  let decoded: unknown = null;
  if (typeof customData === "string" && customData.trim()) {
    try {
      decoded = JSON.parse(customData);
    } catch {
      decoded = null;
    }
  } else if (isRecord(customData)) {
    decoded = customData;
  }

  if (isRecord(decoded)) {
    if (!contactId && typeof decoded.contact_id === "string" && decoded.contact_id.trim()) {
      contactId = decoded.contact_id.trim();
    }
    if (!userId && typeof decoded.user_id === "string" && decoded.user_id.trim()) {
      userId = decoded.user_id.trim();
    }
  }

  return { contactId, userId };
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

const TRANSCRIPT_RELEVANT_OUTCOMES = new Set(["booked", "follow_up", "not_interested"]);

function normalizeCallOutcome(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
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
      // Drop Dialpad's internal AI event markers that are interleaved into the
      // transcript stream (action_item, whole_call_summary, ner, etc.).
      if (isDialpadTranscriptMarker(line, content)) return null;
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

// A Dialpad transcript "line" is an internal AI marker (not spoken content)
// when its type/event field is not a normal transcript entry, or when the
// content is a single lowercase snake_case token like `action_item` or
// `whole_call_summary_fragment` that Dialpad injects between real utterances.
function isDialpadTranscriptMarker(line: JsonRecord, content: string): boolean {
  const typeCandidates = [line.type, line.event, line.kind, line.entry_type];
  for (const t of typeCandidates) {
    if (typeof t !== "string") continue;
    const lt = t.trim().toLowerCase();
    if (!lt) continue;
    // Anything explicitly tagged as transcript/speech is real content.
    if (lt === "transcript" || lt === "utterance" || lt === "speech") return false;
    // Otherwise the presence of a non-transcript type marks it as an AI event.
    return true;
  }
  // Fallback: single-token snake_case content is a Dialpad marker.
  return isMarkerToken(content);
}

const KNOWN_MARKER_TOKENS = new Set<string>([
  "action_item",
  "action_item_v2",
  "ai_csat_reboot_ineligible",
  "call_purpose",
  "call_purpose_category",
  "call_summary",
  "currency",
  "ner",
  "question",
  "speaking_too_quickly",
  "whole_call_summary",
  "whole_call_summary_fragment",
]);

function isMarkerToken(content: string): boolean {
  const s = content.trim();
  if (!s || s.length > 60) return false;
  if (KNOWN_MARKER_TOKENS.has(s)) return true;
  // No whitespace, no punctuation, all lowercase snake_case with an underscore
  // OR a single lowercase word ≤ 40 chars → treat as Dialpad marker.
  return /^[a-z][a-z0-9_]{0,40}$/.test(s);
}

// Strip marker lines from an already-formatted transcript blob (used for the
// in-place cleanup of previously stored transcripts).
function cleanFormattedTranscript(text: string | null | undefined): string | null {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw ?? "";
    if (!line.trim()) continue;
    if (line === "Dialpad Transcript") { kept.push(line); continue; }
    // Split "Speaker: content" and check the content half.
    const idx = line.indexOf(": ");
    if (idx > 0) {
      const content = line.slice(idx + 2).trim();
      if (isMarkerToken(content)) continue;
    } else if (isMarkerToken(line)) {
      continue;
    }
    kept.push(line);
  }
  const speechCount = kept.filter((l) => l !== "Dialpad Transcript").length;
  if (speechCount === 0) return null;
  return kept.join("\n");
}

// ── GHL Field Key → ID Mapping ──────────────────────────────────────────
const DEFAULT_GHL_FIELD_MAP: Record<string, string> = {
  ai_call_summary: "IL1bpfoLPz0sPlU7ucbe",
  call_disposition: "3mJ0ao8qgLzeFSXFOUpc",
  prospect_tier: "D4OdcFIL4E9Z3SZ5pSUp",
  best_time_to_call: "2tWhYqYune00tdwivyIg",
  preferred_contact_method: "eWChuREzCpOa0vTm0Gaw",
  last_contacted_date: "NOtFzQKRUmiTlMdtglJr",
  total_call_attempts: "qpovJ9Z24WizTYL85y2S",
  next_followup_date: "rJw13EVt9XTlBBlJFl9V",
  gatekeeper_name: "BWHUzUPcHH1GbCXBhKGu",
  gatekeeper_role: "O3NUAQLOiMaWuU0idtNC",
  gatekeeper_notes: "RgpWvJFkLEluXf3dAXQy",
  decision_maker_name: "ag8hSUhF7BSXWc03mkT1",
  decision_maker_direct_line: "hQ87Eplr5vyoVgZfdX8k",
  decision_maker_email: "AsH9iB1xrRGgIgNU59m4",
  decision_maker_linkedin: "ejn4GXAzVIoPcIx6GLFS",
  best_route_to_dm: "KQH4FTojsIVvOcmtBBnI",
  business_size: "8OmWwJo4j712X0RHLv0i",
  years_in_business: "rOgbGgGLgO0FrcOne8UY",
  estimated_annual_revenue: "NJIhcBMLmOC35oqXLKz8",
  number_of_trucksvans: "2a8aKsqp8hbpR6atzkqm",
  service_area: "PLnazAPRoj1vF6oWzWAt",
  work_type: "rqLROJ9hMIBVzNtWhhUY",
  current_marketing_agency: "1xv4gYR7hfXawtJo0Y9D",
  current_monthly_ad_spend: "9xUGCIB7u03aLq97nVFR",
  current_marketing_channels: "CnbfdfgDfSq7fBtugY1F",
  has_google_ads: "0JFrMj78LxbVZUbm9Y36",
  has_facebookmeta_ads: "H25fGwTofPJoWONu8uMF",
  seo_visibility: "lVQFlv6qQywpz8iWJruS",
  social_media_presence: "DWDe40ohy7zbjWlOrkEE",
  marketing_pain_points: "ZgMZ8T8lpfjNu0TpJpVC",
  agency_satisfaction: "PXKt81Km2hczS7HcI3A1",
  lead_source_dependency: "OkoXjyFTP5lBlMnaGqcS",
  budget_indication: "Pzpt97a6OX8yGvt0yA81",
  authority_level: "4cFkzARHaqisnkYD66ZE",
  need_identified: "uxUmw1fvMaqB3PaY616L",
  buying_timeline: "7eQnEUwjJyS1xHAsWyH9",
  current_solution_satisfaction: "tNP34vNiUOxMSCiVDW1q",
  key_objection: "IC81cpHYCU1H1uMYAtZz",
  objection_notes: "Lp7PJyf414Gh8oIrWfuo",
  buying_signal_strength: "wJEveppptnLy1hXMU0MP",
  contractlockin_status: "zCvTLQ0ZSVF2KGWZHJVI",
  last_call_sentiment: "OZ1i5SuCRyzDIS2R8Ws9",
  problem_resonance: "2lkCsBJkkiFPJfK81oOY",
  key_quote: "sVV6lPbArgky8tMBOAu8",
  rep_coaching_notes: "891RFxHknXy5FK8G3Lvv",
  competitive_intel: "iAMPbwmiQXXbXSgmGgUC",
  agreed_next_steps: "bHOf7gs4tvdT55ceMQFt",
  trade_type: "yt3N3TSYK6hKWHfChjvM",
  website_url: "PMzSkSeg2HX6OLw3Llsi",
  website_quality: "DrpNKbTVavczJgIpIVct",
  // Contact / GBP
  google_business_profile: "65Ch3IY56gvPuDCOkEke",
  // Additional Info
  number_quality: "bNY6uI2W2ljTm9ofCnh3",
  // Business Profile
  abn: "q54XHTwMp4hnlHPWUPWc",
  // Meeting Attribution
  meeting_set_by_role: "ub05PoyGTqPJXZ4ivMjb",
  setter_name: "8I19MJ9Le5Hj24GgRNFf",
  assigned_closer: "9rFMYzQhXGHZ4XNiG0yL",
  meeting_source: "HRl4iXpoQ2nctkvvNZ6B",
  meeting_booked_date: "JZBFneC9P7XPE1UBNZTJ",
};

function getGhlFieldMap() {
  const merged = { ...DEFAULT_GHL_FIELD_MAP };
  const raw = Deno.env.get("GHL_FIELD_MAP_JSON");
  if (!raw) return merged;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed) continue;
      merged[key] = trimmed;
    }
  } catch (error) {
    console.warn("[dialpad] Invalid GHL_FIELD_MAP_JSON env var:", error);
  }

  return merged;
}

const GHL_FIELD_MAP = getGhlFieldMap();

// ── AI Summary System Prompt ────────────────────────────────────────────
const AI_SYSTEM_PROMPT = `You are an expert sales manager and call reviewer for a digital marketing agency that sells to blue collar trades businesses (HVAC, plumbing, electrical, roofing, landscaping, etc.). You are deeply trained in the methodologies of "Fanatical Prospecting" by Jeb Blount and "Cold Calling Sucks (And That's Why It Works)" by Armand Farrokh & Nick Cegelski.

Your task is to analyse a raw sales call transcript and extract actionable sales intelligence.

You MUST return a valid JSON object with three keys:
1. "fields" — structured key/value pairs for CRM custom fields
2. "note" — a formatted rich text summary for the CRM contact note
3. "objections" — an array of structured objection/coaching events for training and review

Core Methodologies to Look For:
1. Openers: Did the rep use a context-led opener (e.g., "Heard the name tossed around" or tailored permission) instead of banned openers like "How's your day going?"
2. Problem Proposition: Did the rep focus on a specific, triggering problem rather than a generic value proposition? Did they use an interest-based CTA?
3. Objection Handling: Did the rep use a pattern interrupt? (e.g., "Agree > Incentivise > Test Drive" or "Ledge > Disrupt > Ask"). Did they avoid arguing with reflexive brush-offs?
4. Qualification: Look for BANT (Budget, Authority, Need, Timeline) and buying window signals.
5. Next Steps: Did the rep secure a firm commitment, confirm email, and ask for calendar invite acceptance?

IMPORTANT RULES:
- Only include fields where meaningful information was found in the transcript. Do NOT include fields with no data.
- Use EXACTLY the option values listed below for dropdown fields.
- For CHECKBOX fields, use an array of strings.
- For NUMERICAL fields, use a number.
- For DATE fields, use YYYY-MM-DD format.
- For TEXT and LARGE_TEXT fields, use concise, specific strings.
- The "note" field contains the full formatted summary as a single string with \n for line breaks.
- The "objections" field should be an array. If there were no meaningful objections, return an empty array.
- Use Australian English spelling throughout.

Available fields and their valid options:

call_disposition: "Connected" | "No Answer" | "Voicemail" | "Gatekeeper" | "Wrong Number" | "Disconnected" | "Busy"
prospect_tier: "Hot - Showing Interest" | "Warm - Engaged" | "Neutral - Listening" | "Cold - Not Interested" | "Dead - DNC"
best_time_to_call: "Morning (9-12)" | "Afternoon (12-3)" | "Late Afternoon (3-5)" | "Evening (5-7)" | "Unknown"
preferred_contact_method: "Phone" | "Email" | "SMS" | "LinkedIn" | "In Person"
gatekeeper_name: (text)
gatekeeper_role: (text)
gatekeeper_notes: (large text)
decision_maker_name: (text)
decision_maker_direct_line: (phone)
decision_maker_email: (text)
decision_maker_linkedin: (text)
best_route_to_dm: "Direct Dial" | "Ask for by Name" | "Call Back at Specific Time" | "Email First" | "LinkedIn" | "Other"
business_size: "Solo (1)" | "Micro (2-5)" | "Small (6-15)" | "Medium (16-50)" | "Large (50+)"
years_in_business: "New (<2 Years)" | "Established (2-5 Years)" | "Mature (5-10 Years)" | "Legacy (10+ Years)"
estimated_annual_revenue: "<$500K" | "$500K-$1M" | "$1M-$2M" | "$2M-$5M" | "$5M+"
number_of_trucksvans: (number)
service_area: (text)
work_type: "Residential Only" | "Mostly Residential" | "Mixed (Residential & Commercial)" | "Mostly Commercial" | "Commercial Only"
current_marketing_agency: (text)
current_monthly_ad_spend: "None" | "<$500" | "$500-$1K" | "$1K-$2K" | "$2K-$5K" | "$5K-$10K" | "$10K+"
current_marketing_channels: ["Google Ads", "Facebook/Meta Ads", "SEO", "Google Business", "Website", "Social Media", "Word of Mouth", "Print/Flyers", "Vehicle Wraps", "Radio/TV"]
has_google_ads: "Yes - Active" | "Yes - Paused" | "No" | "Unknown"
has_facebookmeta_ads: "Yes - Active" | "Yes - Paused" | "No" | "Unknown"
seo_visibility: "Strong" | "Moderate" | "Weak" | "None" | "Unknown"
social_media_presence: "Active" | "Moderate" | "Minimal" | "None" | "Unknown"
marketing_pain_points: (large text)
agency_satisfaction: "Very Happy" | "Satisfied" | "Neutral" | "Frustrated" | "Very Unhappy" | "No Agency"
lead_source_dependency: "Highly Dependent on Referrals" | "Mostly Referrals" | "Mixed" | "Mostly Digital" | "Fully Digital"
budget_indication: "Has Budget" | "Budget Constrained" | "No Budget" | "Unknown"
authority_level: "Decision Maker" | "Influencer" | "Gatekeeper" | "Unknown"
need_identified: "Strong Need" | "Moderate Need" | "Low Need" | "No Need" | "Unknown"
buying_timeline: "Immediate (< 1 month)" | "Short-term (1-3 months)" | "Medium-term (3-6 months)" | "Long-term (6+ months)" | "No Timeline"
current_solution_satisfaction: "Very Happy" | "Satisfied" | "Neutral" | "Frustrated" | "Very Unhappy" | "No Solution"
key_objection: "Happy with Current" | "No Budget" | "Bad Timing" | "Need to Think" | "Bad Experience" | "Too Busy" | "Not the DM" | "No Objection"
objection_notes: (large text)
buying_signal_strength: "Strong - Ready to Buy" | "Moderate - Interested" | "Weak - Curious" | "None - Not Interested"
contractlockin_status: "No Contract" | "Month-to-Month" | "Locked In (<6 months left)" | "Locked In (6+ months left)" | "Unknown"
last_call_sentiment: "Enthusiastic" | "Warm" | "Curious" | "Neutral" | "Guarded" | "Cold" | "Hostile"
problem_resonance: "Strong - Pain Acknowledged" | "Moderate - Some Interest" | "Weak - Dismissive" | "None - No Engagement"
key_quote: (large text - verbatim quote from prospect)
rep_coaching_notes: (large text - constructive feedback)
competitive_intel: (large text)
agreed_next_steps: (large text)
next_followup_date: (date YYYY-MM-DD)
trade_type: (use the appropriate trade from the call context)

Note format:
\u{1F4DE} CALL SUMMARY — [Date] [Time]
Rep: [Rep Name] | Duration: [Duration] | Number: [Phone Number]

\u{1F3AF} OUTCOME: [Meeting Booked / Follow-Up Agreed / Info Gathered / Familiarity Built / Objection / Not Interested / Voicemail / Gatekeeper]

\u{1F4CA} QUALIFICATION
\u2022 Budget: [Details]
\u2022 Authority: [Details]
\u2022 Need: [Details]
\u2022 Timeline: [Details]
\u2022 Current Solution: [Details]

\u{1F4AC} PROBLEM RESONANCE
\u2022 [Details]

\u{1F6E1}\uFE0F OBJECTIONS
\u2022 Objection: [What they said]
\u2022 Handling: [How the rep responded]
\u2022 Result: [Outcome]

\u{1F321}\uFE0F SENTIMENT: [Warm / Neutral / Cold / Hostile / Curious]
\u2022 [Brief description]

\u{1F3E2} COMPETITIVE INTEL
\u2022 [Details]

\u2705 NEXT STEPS
\u2022 [Specific actions with dates]

\u{1F4CD} PYRAMID POSITION: [Unqualified / Qualified-No Window / Qualified-In Window / Conquest]

\u{1F4A1} KEY QUOTES
\u2022 "[Verbatim quote]"

\u{1F527} REP COACHING NOTES
\u2022 [Observations on opener, pitch, objection handling, tone]

Only include sections where meaningful information exists. Omit empty sections entirely.

For each objection event in "objections", use this shape:
- objection_type: concise label for the objection
- prospect_wording: verbatim or near-verbatim prospect phrasing
- rep_response: concise summary of how the rep handled it
- outcome: one of "advanced", "stalled", "booked", "follow_up", "lost"
- coaching_verdict: one of "Strong", "Needs work", "Missed"
- coaching_note: one concrete coaching observation
- evidence: array of short evidence strings
- drill_candidate: boolean
- linked_module: one of "Objections", "Patterns", "Reviews", "Examples"`;

// ── AI Summary Generation ───────────────────────────────────────────────
async function generateAiSummary(params: {
  transcript: string;
  repName?: string;
  phoneNumber?: string;
  callDurationSeconds?: number | null;
  callDate?: string | null;
}) {
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  const OPENAI_BASE_URL = Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";

  if (!OPENAI_API_KEY) {
    console.warn("[AI Summary] OPENAI_API_KEY not configured — skipping AI summary");
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
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: AI_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[AI Summary] OpenAI API error: ${response.status} ${errBody}`);
      return null;
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (!content) {
      console.warn("[AI Summary] No content in OpenAI response");
      return null;
    }

    const parsed = JSON.parse(content);
    return parsed as {
      fields?: Record<string, unknown>;
      note?: string;
      objections?: Array<{
        objection_type?: string;
        prospect_wording?: string;
        rep_response?: string;
        outcome?: string;
        coaching_verdict?: string;
        coaching_note?: string;
        evidence?: string[];
        drill_candidate?: boolean;
        linked_module?: string;
      }>;
    };
  } catch (err) {
    console.error("[AI Summary] Failed to generate AI summary:", err);
    return null;
  }
}

// ── GHL API Helpers (server-side, used by webhook handler) ──────────────
const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

function ghlApiHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: GHL_API_VERSION,
  };
}

async function pushNoteToGhl(params: {
  ghlApiKey: string;
  ghlContactId: string;
  noteBody: string;
}) {
  try {
    const response = await fetch(
      `${GHL_BASE_URL}/contacts/${params.ghlContactId}/notes`,
      {
        method: "POST",
        headers: ghlApiHeaders(params.ghlApiKey),
        body: JSON.stringify({ body: params.noteBody }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[GHL Push Note] Failed: ${response.status} ${errBody}`);
      return false;
    }

    console.log(`[GHL Push Note] Note pushed to contact ${params.ghlContactId}`);
    return true;
  } catch (err) {
    console.error("[GHL Push Note] Error:", err);
    return false;
  }
}

async function pushFieldsToGhl(params: {
  ghlApiKey: string;
  ghlContactId: string;
  fields: Record<string, unknown>;
  existingCustomFields?: Record<string, unknown>;
}) {
  // Map AI field keys to GHL custom field IDs
  const customFieldUpdates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params.fields)) {
    if (value === null || value === undefined || value === "") continue;

    const ghlFieldId = GHL_FIELD_MAP[key];
    if (!ghlFieldId) {
      console.warn(`[GHL Push Fields] No GHL field ID mapping for key: ${key}`);
      continue;
    }

    // Handle append-style fields (gatekeeper_notes, marketing_pain_points, objection_notes, competitive_intel)
    const APPEND_FIELDS = new Set(["gatekeeper_notes", "marketing_pain_points", "objection_notes", "competitive_intel"]);
    if (APPEND_FIELDS.has(key) && params.existingCustomFields) {
      const existingValue = params.existingCustomFields[ghlFieldId];
      if (typeof existingValue === "string" && existingValue.trim()) {
        customFieldUpdates[ghlFieldId] = `${existingValue.trim()}\n---\n${String(value)}`;
        continue;
      }
    }

    customFieldUpdates[ghlFieldId] = value;
  }

  // Handle total_call_attempts increment
  const callAttemptsFieldId = GHL_FIELD_MAP.total_call_attempts;
  if (callAttemptsFieldId) {
    const existingAttempts = params.existingCustomFields?.[callAttemptsFieldId];
    const currentCount = typeof existingAttempts === "number" ? existingAttempts : 0;
    customFieldUpdates[callAttemptsFieldId] = currentCount + 1;
  }

  // Set last_contacted_date to today
  const lastContactedFieldId = GHL_FIELD_MAP.last_contacted_date;
  if (lastContactedFieldId) {
    customFieldUpdates[lastContactedFieldId] = new Date().toISOString().split("T")[0];
  }

  if (Object.keys(customFieldUpdates).length === 0) {
    console.log("[GHL Push Fields] No fields to update");
    return true;
  }

  try {
    const response = await fetch(
      `${GHL_BASE_URL}/contacts/${params.ghlContactId}`,
      {
        method: "PUT",
        headers: ghlApiHeaders(params.ghlApiKey),
        body: JSON.stringify({ customFields: Object.entries(customFieldUpdates).map(([id, value]) => ({ id, field_value: value })) }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[GHL Push Fields] Failed: ${response.status} ${errBody}`);
      return false;
    }

    console.log(`[GHL Push Fields] Updated ${Object.keys(customFieldUpdates).length} fields on contact ${params.ghlContactId}`);
    return true;
  } catch (err) {
    console.error("[GHL Push Fields] Error:", err);
    return false;
  }
}

async function fetchGhlContactCustomFields(ghlApiKey: string, ghlContactId: string) {
  try {
    const response = await fetch(
      `${GHL_BASE_URL}/contacts/${ghlContactId}`,
      {
        method: "GET",
        headers: ghlApiHeaders(ghlApiKey),
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    const contact = data?.contact ?? data;
    if (!isRecord(contact)) return null;

    // Build a map of custom field ID -> value
    const customFields: Record<string, unknown> = {};
    if (Array.isArray(contact.customFields)) {
      for (const cf of contact.customFields) {
        if (isRecord(cf) && typeof cf.id === "string") {
          customFields[cf.id] = cf.value;
        }
      }
    }

    return customFields;
  } catch {
    return null;
  }
}

async function enqueuePendingGhlPush(params: {
  adminClient: ReturnType<typeof createClient>;
  contactId: string;
  dialpadCallId: string;
  userId: string;
  aiNote: string | null;
  aiFields: Record<string, unknown>;
  lastError: string;
}) {
  const payload = {
    contact_id: params.contactId,
    dialpad_call_id: params.dialpadCallId,
    user_id: params.userId,
    ai_note: params.aiNote,
    ai_fields: params.aiFields,
    source: "dialpad_ai_summary",
    status: "pending",
    next_retry_at: new Date().toISOString(),
    last_error: params.lastError,
  };

  const { error } = await params.adminClient
    .from("pending_ghl_pushes")
    .upsert(payload, { onConflict: "contact_id,dialpad_call_id,source" });

  if (error) {
    console.error("[AI→GHL] Failed to enqueue pending push:", error.message);
  }
}

async function attemptAutoLinkGhlContact(params: {
  adminClient: ReturnType<typeof createClient>;
  contactId: string;
  ghlApiKey: string;
  phone: string | null | undefined;
}) {
  const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID");
  if (!GHL_LOCATION_ID || !params.phone) {
    return null;
  }

  let e164Phone: string | null = null;
  try {
    e164Phone = normalizePhoneNumberToE164(params.phone);
  } catch {
    return null;
  }

  const phoneDigits = e164Phone.replace(/\D/g, "");
  console.log(`[AI→GHL] No ghl_contact_id for contact ${params.contactId}, attempting auto-link via phone search`);

  const searchResponse = await fetch(
    `${GHL_BASE_URL}/contacts/?query=${encodeURIComponent(phoneDigits)}&locationId=${GHL_LOCATION_ID}&limit=1`,
    { headers: ghlApiHeaders(params.ghlApiKey) },
  );

  if (!searchResponse.ok) {
    const details = await searchResponse.text().catch(() => "");
    throw new Error(`GHL phone search failed: ${searchResponse.status} ${details}`);
  }

  const searchData = await searchResponse.json().catch(() => ({}));
  const ghlMatch = searchData?.contacts?.[0];
  if (!ghlMatch?.id) {
    console.log(`[AI→GHL] No GHL contact found for phone ${phoneDigits}`);
    return null;
  }

  const { error: updateError } = await params.adminClient
    .from("contacts")
    .update({ ghl_contact_id: ghlMatch.id })
    .eq("id", params.contactId);

  if (updateError) {
    throw new Error(`Failed to save auto-linked ghl_contact_id: ${updateError.message}`);
  }

  console.log(`[AI→GHL] Auto-linked contact ${params.contactId} → GHL ${ghlMatch.id}`);
  return ghlMatch.id as string;
}

function coerceBoundedLimit(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  return Math.min(Math.max(normalized, min), max);
}

async function processPendingGhlPushes(params: {
  adminClient: ReturnType<typeof createClient>;
  limit?: number;
}) {
  const limit = coerceBoundedLimit(params.limit, 25, 1, 100);
  const staleProcessingMinutes = 15;
  const GHL_API_KEY = Deno.env.get("GHL_API_KEY");
  if (!GHL_API_KEY) {
    return { processed: 0, synced: 0, requeued: 0, failed: 0, reason: "GHL_API_KEY not configured" };
  }
  const staleBefore = new Date(Date.now() - staleProcessingMinutes * 60_000).toISOString();

  // Requeue stale processing rows (e.g., previous worker crashed mid-flight).
  const { data: reclaimedRows, error: reclaimErr } = await params.adminClient
    .from("pending_ghl_pushes")
    .update({
      status: "pending",
      next_retry_at: new Date().toISOString(),
      last_error: `Recovered stale processing row after ${staleProcessingMinutes}m timeout`,
    })
    .eq("status", "processing")
    .lte("updated_at", staleBefore)
    .select("id");
  if (reclaimErr) {
    console.error("[AI→GHL] Failed to reclaim stale processing rows:", reclaimErr.message);
  }
  const reclaimed = reclaimedRows?.length ?? 0;

  const { data: pending, error } = await params.adminClient
    .from("pending_ghl_pushes")
    .select("id, contact_id, ai_note, ai_fields, attempt_count")
    .eq("status", "pending")
    .lte("next_retry_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!pending || pending.length === 0) {
    return { processed: 0, synced: 0, requeued: 0, failed: 0, reclaimed };
  }

  let synced = 0;
  let requeued = 0;
  let failed = 0;

  for (const row of pending) {
    const attempts = (row.attempt_count ?? 0) + 1;
    const backoffMinutes = Math.min(60, Math.pow(2, Math.min(6, attempts)));
    const nextRetryAt = new Date(Date.now() + backoffMinutes * 60_000).toISOString();
    const nowIso = new Date().toISOString();

    // Claim row defensively to avoid duplicate processing across concurrent workers.
    const { data: claimedRows, error: claimError } = await params.adminClient
      .from("pending_ghl_pushes")
      .update({ status: "processing", attempt_count: attempts, updated_at: nowIso })
      .eq("id", row.id)
      .eq("status", "pending")
      .lte("next_retry_at", nowIso)
      .select("id")
      .limit(1);

    if (claimError) {
      console.error("[AI→GHL] Failed to claim pending push:", claimError.message);
      continue;
    }
    if (!claimedRows || claimedRows.length === 0) {
      // Another worker already claimed this row.
      continue;
    }

    const { data: contact } = await params.adminClient
      .from("contacts")
      .select("ghl_contact_id, phone")
      .eq("id", row.contact_id)
      .maybeSingle();

    let ghlContactId = contact?.ghl_contact_id;
    if (!ghlContactId) {
      try {
        ghlContactId = await attemptAutoLinkGhlContact({
          adminClient: params.adminClient,
          contactId: row.contact_id,
          ghlApiKey: GHL_API_KEY,
          phone: contact?.phone,
        });
      } catch (autoLinkError) {
        console.error("[AI→GHL] Retry auto-link attempt failed:", autoLinkError);
      }
    }

    if (!ghlContactId) {
      await params.adminClient
        .from("pending_ghl_pushes")
        .update({
          status: "pending",
          next_retry_at: nextRetryAt,
          last_error: contact?.phone ? "Missing ghl_contact_id after retry auto-link" : "Missing ghl_contact_id and phone",
        })
        .eq("id", row.id);
      requeued++;
      continue;
    }

    const fields = isRecord(row.ai_fields) ? row.ai_fields : {};
    const noteOk = row.ai_note ? await pushNoteToGhl({ ghlApiKey: GHL_API_KEY, ghlContactId, noteBody: row.ai_note }) : true;
    const existingCustomFields = await fetchGhlContactCustomFields(GHL_API_KEY, ghlContactId);
    const fieldsOk = await pushFieldsToGhl({
      ghlApiKey: GHL_API_KEY,
      ghlContactId,
      fields,
      existingCustomFields: existingCustomFields ?? undefined,
    });

    if (noteOk && fieldsOk) {
      await params.adminClient
        .from("pending_ghl_pushes")
        .update({
          status: "synced",
          last_error: null,
        })
        .eq("id", row.id);
      synced++;
    } else if (attempts >= 8) {
      await params.adminClient
        .from("pending_ghl_pushes")
        .update({
          status: "failed",
          last_error: "Failed to push note/fields to GHL after retries",
        })
        .eq("id", row.id);
      failed++;
    } else {
      await params.adminClient
        .from("pending_ghl_pushes")
        .update({
          status: "pending",
          next_retry_at: nextRetryAt,
          last_error: "GHL push failed",
        })
        .eq("id", row.id);
      requeued++;
    }
  }

  return { processed: pending.length, synced, requeued, failed, reclaimed };
}

async function getPendingGhlPushMetrics(params: {
  adminClient: ReturnType<typeof createClient>;
}) {
  const statuses: Array<"pending" | "processing" | "synced" | "failed"> = ["pending", "processing", "synced", "failed"];
  const counts: Record<string, number> = {};

  for (const status of statuses) {
    const { count, error } = await params.adminClient
      .from("pending_ghl_pushes")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (error) throw error;
    counts[status] = count ?? 0;
  }

  const { data: oldestPending, error: oldestPendingError } = await params.adminClient
    .from("pending_ghl_pushes")
    .select("created_at, next_retry_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (oldestPendingError) throw oldestPendingError;

  const nowIso = new Date().toISOString();
  const { count: dueNowCount, error: dueNowError } = await params.adminClient
    .from("pending_ghl_pushes")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lte("next_retry_at", nowIso);
  if (dueNowError) throw dueNowError;

  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count: staleProcessingCount, error: staleProcessingError } = await params.adminClient
    .from("pending_ghl_pushes")
    .select("id", { count: "exact", head: true })
    .eq("status", "processing")
    .lte("updated_at", staleBefore);
  if (staleProcessingError) throw staleProcessingError;

  return {
    counts,
    pending_due_now_count: dueNowCount ?? 0,
    stale_processing_count: staleProcessingCount ?? 0,
    oldest_pending_created_at: oldestPending?.created_at ?? null,
    oldest_pending_next_retry_at: oldestPending?.next_retry_at ?? null,
  };
}

async function requeueFailedPendingGhlPushes(params: {
  adminClient: ReturnType<typeof createClient>;
  limit?: number;
}) {
  const limit = coerceBoundedLimit(params.limit, 100, 1, 500);
  const { data: failedRows, error: failedRowsError } = await params.adminClient
    .from("pending_ghl_pushes")
    .select("id")
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (failedRowsError) throw failedRowsError;
  if (!failedRows || failedRows.length === 0) return { requeued: 0 };

  const ids = failedRows.map((row) => row.id);
  const { error: updateError } = await params.adminClient
    .from("pending_ghl_pushes")
    .update({
      status: "pending",
      next_retry_at: new Date().toISOString(),
      last_error: "Manually requeued from failed state",
    })
    .in("id", ids);
  if (updateError) throw updateError;

  return { requeued: ids.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Transcript → Prospect record extraction pipeline
// ─────────────────────────────────────────────────────────────────────────

const SAMPLE_HVAC_TRANSCRIPT = `Rep (Sarah, Speedy Sales): Good afternoon, this is Sarah from Speedy Growth — could I grab Mike, the owner?
Receptionist: He's mid-job right now, love. What's this regarding?
Rep: We help HVAC operators around Melbourne fill their quiet weeks with extra service jobs — should only take Mike 90 seconds to hear whether it's a fit. If he's on the tools, happy to try his mobile.
Receptionist: Alright, I'll grab him — hold the line.
Mike (Owner): Mike here, what's up?
Rep: Mike, Sarah from Speedy Growth — do me a favour, the honest one — how are the phones this week compared to summer?
Mike: Yeah look, been a bit patchy. Referrals keep the lights on but we've got two vans sitting on Thursday and Friday.
Rep: That's exactly why I called. We run Google campaigns for HVAC crews that plug those gap days with breakdown and service jobs — no residential tyre-kickers. What's it worth to you to fill each idle van day?
Mike: Depends. We already get enough work from referrals, mate — not sure we need to pay for leads on top.
Rep: Totally hear you — referrals are the best leads on earth. The problem is they're lumpy — great in June, gone in August. Our clients keep referrals rolling AND stop the August slump. Would it be crazy to see the exact search volume in your service area before you decide?
Mike: Nah, that's fair. What's the number sit at?
Rep: Around 2,400 HVAC searches a month within 25km of Ringwood, and the top three ranked spots are absorbing about 68% of it — none of them are you yet. Budget-wise we usually start blokes like you at $1,500/mo for ads plus our $2k management. Where are you sitting on marketing spend right now?
Mike: Basically zero. Van signage and word of mouth.
Rep: Perfect starting point. Look, rather than pitch you cold, let's book 15 minutes with our HVAC lead — he'll show you the exact keywords, current top-ranked competitors, and the number of jobs a realistic first 60 days looks like. If it's not a fit you get the report anyway. Tuesday 2pm work, or is Wednesday morning easier?
Mike: Tuesday 2 works. Send it to mike@ringwoodhvac.com.au.
Rep: Booked. You'll get a calendar invite in the next five minutes. One favour — bring your average job value so we can put a real dollar figure on this for you.
Mike: Yeah no worries, cheers Sarah.
Rep: Cheers Mike, talk Tuesday.`;

const TRANSCRIPT_EXTRACTION_SYSTEM_PROMPT = `You are a senior sales operations analyst reviewing a recorded outbound sales call for a digital-marketing agency selling to Australian blue-collar trades businesses (HVAC, plumbing, electrical, roofing, etc.).
You are trained in "Fanatical Prospecting" (Jeb Blount) and "Cold Calling Sucks (And That's Why It Works)" (Farrokh & Cegelski).
You are ALSO trained in the NEPQ sales framework (Jeremy Miner / 7th Level).
Your job is (a) to extract structured intelligence from the transcript so the CRM can update the prospect record automatically, AND (b) to grade the rep against the NEPQ framework so they can coach themselves.

Return ONLY a single valid JSON object matching this exact schema — do not wrap it in prose, markdown, or code fences:
{
  "call_summary": string,              // 2–3 sentences. Australian English. Plain, factual, no hype.
  "call_sentiment": "positive" | "neutral" | "negative",
  "dm_name": string | null,            // decision-maker name if identified
  "dm_role": string | null,            // e.g. "Owner", "Operations Manager"
  "buying_signal_strength": "High" | "Medium" | "Low" | "None",
  "budget_indication": string | null,  // free-text summary of budget signals (e.g. "$1.5k/mo capacity", "no current spend")
  "buying_timeline": string | null,    // e.g. "Immediate", "Next 30 days", "Next quarter", "Unknown"
  "objections": [                       // 0 or more; only real objections raised by the prospect
    { "objection": string, "how_handled": string }
  ],
  "agreed_next_steps": string | null,  // exact next step both parties agreed to (with time/date if given)
  "key_quote": string | null,          // one short verbatim quote from the prospect that captures intent or hesitation
  "recommended_lifecycle_stage": "new" | "attempting" | "connected" | "qualified" | "booked" | "won" | "lost",
  "booked": boolean,                    // true only if a specific meeting/appointment was agreed
  "nepq_scorecard": {
    "nepq_scores": {
      "connection": integer,            // 0-5
      "situation": integer,             // 0-5
      "problem_awareness": integer,     // 0-5
      "solution_awareness": integer,    // 0-5
      "consequence": integer,           // 0-5
      "transition": integer,            // 0-5
      "presentation": integer,          // 0-5
      "commitment": integer             // 0-5
    },
    "overall_score": integer,           // 0-100 — holistic rating of the call against the NEPQ framework
    "broke_down_at": "connection" | "situation" | "problem_awareness" | "solution_awareness" | "consequence" | "transition" | "presentation" | "commitment" | "none",
    "what_went_well": [string],         // 1-4 short bullets, ≤ 140 chars each
    "coaching_tips": [                  // 1-6 concrete, stage-specific tips
      { "stage": "connection" | "situation" | "problem_awareness" | "solution_awareness" | "consequence" | "transition" | "presentation" | "commitment", "tip": string }
    ],
    "booking_blocker": string           // ONE short sentence: the single biggest reason it didn't book, or the literal string "booked" if a meeting was agreed
  }
}

NEPQ rubric — score each stage 0 (absent/harmful) to 5 (textbook):
- connection: lower the prospect's guard, take pressure off, calm trusted-advisor tone (no hype, no rushing).
- situation: understand their current reality with a couple of neutral questions — do NOT interrogate.
- problem_awareness: surface emotional friction and what the problem is costing them (ask, don't diagnose).
- solution_awareness: get them to picture life after the problem — in THEIR words.
- consequence: elevate the cost of inaction / urgency without applying pressure.
- transition: bridge to the pitch only when the prospect's interest invites it.
- presentation: present ONLY against the problems they named, two-way (not a monologue), and hold price until value is built.
- commitment: ask a clean committing question; handle objections in order (logistical → fear → smokescreen).

Scoring guidance:
- Only score stages the rep actually reached. Stages that never occurred score 0.
- overall_score should reflect the WHOLE call, not just the average — a call that reaches commitment cleanly should sit 70-95; a call that stalls in problem awareness should sit 20-50.
- broke_down_at = the earliest NEPQ stage where the rep clearly lost the frame or the prospect. Use "none" ONLY if the call went well end-to-end (booked or clear next step).
- booking_blocker: if a meeting was booked, return the literal string "booked". Otherwise ONE short factual sentence naming the single biggest blocker (e.g. "Rep pitched price before building enough value on lead volume.").
- coaching_tips must be concrete and rep-facing — no jargon dumps, no generic advice.

Rules:
- Never invent facts. If a field cannot be determined, use null (or [] for objections).
- "recommended_lifecycle_stage" is forward-only guidance — pick the highest stage clearly supported by the transcript.
- If a meeting was booked, "booked" MUST be true and "recommended_lifecycle_stage" MUST be at least "booked".
- Keep every string concise (under 240 chars) and free of markdown.`;

function coerceInsightString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function coerceInsightEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  const normalised = value.trim();
  const match = allowed.find((v) => v.toLowerCase() === normalised.toLowerCase());
  return match ?? null;
}

type TranscriptInsights = {
  call_summary: string | null;
  call_sentiment: "positive" | "neutral" | "negative" | null;
  dm_name: string | null;
  dm_role: string | null;
  buying_signal_strength: "High" | "Medium" | "Low" | "None" | null;
  budget_indication: string | null;
  buying_timeline: string | null;
  objections: Array<{ objection: string; how_handled: string }>;
  agreed_next_steps: string | null;
  key_quote: string | null;
  recommended_lifecycle_stage: "new" | "attempting" | "connected" | "qualified" | "booked" | "won" | "lost" | null;
  booked: boolean;
  nepq_scorecard: NepqScorecard | null;
};

const NEPQ_STAGES = [
  "connection",
  "situation",
  "problem_awareness",
  "solution_awareness",
  "consequence",
  "transition",
  "presentation",
  "commitment",
] as const;
type NepqStage = typeof NEPQ_STAGES[number];

export type NepqScorecard = {
  nepq_scores: Record<NepqStage, number>;
  overall_score: number;
  broke_down_at: NepqStage | "none";
  what_went_well: string[];
  coaching_tips: Array<{ stage: NepqStage; tip: string }>;
  booking_blocker: string;
};

function clampInt(value: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function validateNepqScorecard(raw: unknown): NepqScorecard | null {
  if (!isRecord(raw)) return null;
  const rawScores = isRecord(raw.nepq_scores) ? raw.nepq_scores : {};
  const nepq_scores = {} as Record<NepqStage, number>;
  for (const stage of NEPQ_STAGES) nepq_scores[stage] = clampInt(rawScores[stage], 0, 5, 0);

  const overall_score = clampInt(raw.overall_score, 0, 100, 0);
  const brokeRaw = coerceInsightString(raw.broke_down_at, 40) ?? "none";
  const brokeMatch = ([...NEPQ_STAGES, "none"] as const).find((s) => s.toLowerCase() === brokeRaw.toLowerCase());
  const broke_down_at = (brokeMatch ?? "none") as NepqScorecard["broke_down_at"];

  const what_went_well: string[] = [];
  if (Array.isArray(raw.what_went_well)) {
    for (const item of raw.what_went_well) {
      const s = coerceInsightString(item, 200);
      if (s) what_went_well.push(s);
      if (what_went_well.length >= 6) break;
    }
  }

  const coaching_tips: Array<{ stage: NepqStage; tip: string }> = [];
  if (Array.isArray(raw.coaching_tips)) {
    for (const item of raw.coaching_tips) {
      if (!isRecord(item)) continue;
      const tip = coerceInsightString(item.tip, 400);
      const stageStr = coerceInsightString(item.stage, 40)?.toLowerCase();
      const stage = NEPQ_STAGES.find((s) => s === stageStr);
      if (tip && stage) coaching_tips.push({ stage, tip });
      if (coaching_tips.length >= 8) break;
    }
  }

  const booking_blocker = coerceInsightString(raw.booking_blocker, 400) ?? "";

  return { nepq_scores, overall_score, broke_down_at, what_went_well, coaching_tips, booking_blocker };
}

function validateTranscriptInsights(raw: unknown): TranscriptInsights | null {
  if (!isRecord(raw)) return null;

  const objections: Array<{ objection: string; how_handled: string }> = [];
  if (Array.isArray(raw.objections)) {
    for (const item of raw.objections) {
      if (!isRecord(item)) continue;
      const objection = coerceInsightString(item.objection, 300);
      const howHandled = coerceInsightString(item.how_handled, 500);
      if (objection && howHandled) {
        objections.push({ objection, how_handled: howHandled });
      } else if (objection) {
        objections.push({ objection, how_handled: "(not addressed)" });
      }
    }
  }

  const insights: TranscriptInsights = {
    call_summary: coerceInsightString(raw.call_summary, 1200),
    call_sentiment: coerceInsightEnum(raw.call_sentiment, ["positive", "neutral", "negative"] as const),
    dm_name: coerceInsightString(raw.dm_name, 200),
    dm_role: coerceInsightString(raw.dm_role, 200),
    buying_signal_strength: coerceInsightEnum(raw.buying_signal_strength, ["High", "Medium", "Low", "None"] as const),
    budget_indication: coerceInsightString(raw.budget_indication, 300),
    buying_timeline: coerceInsightString(raw.buying_timeline, 200),
    objections,
    agreed_next_steps: coerceInsightString(raw.agreed_next_steps, 400),
    key_quote: coerceInsightString(raw.key_quote, 400),
    recommended_lifecycle_stage: coerceInsightEnum(
      raw.recommended_lifecycle_stage,
      ["new", "attempting", "connected", "qualified", "booked", "won", "lost"] as const,
    ),
    booked: raw.booked === true,
    nepq_scorecard: validateNepqScorecard(raw.nepq_scorecard),
  };

  // Consistency: booked=true forces lifecycle >= booked.
  if (insights.booked && insights.recommended_lifecycle_stage) {
    const rankOrder = ["new", "attempting", "connected", "qualified", "booked", "won", "lost"];
    if (rankOrder.indexOf(insights.recommended_lifecycle_stage) < rankOrder.indexOf("booked")) {
      insights.recommended_lifecycle_stage = "booked";
    }
  }

  return insights;
}

async function extractTranscriptInsights(params: {
  transcript: string;
  businessName?: string | null;
  phoneNumber?: string | null;
}): Promise<TranscriptInsights | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("[transcript-extraction] LOVABLE_API_KEY missing — skipping extraction");
    return null;
  }

  const userPrompt = [
    "Extract the structured intelligence from the following sales call transcript.",
    params.businessName ? `Prospect business: ${params.businessName}` : null,
    params.phoneNumber ? `Phone: ${params.phoneNumber}` : null,
    "",
    "Transcript:",
    params.transcript,
  ].filter(Boolean).join("\n");

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
          { role: "system", content: TRANSCRIPT_EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[transcript-extraction] Gateway ${response.status}: ${body.slice(0, 500)}`);
      return null;
    }

    const result = await response.json().catch(() => null);
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Model returned text — try to extract a JSON block.
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return null;
      }
    }

    return validateTranscriptInsights(parsed);
  } catch (err) {
    console.error("[transcript-extraction] Request failed:", err);
    return null;
  }
}

function buildTranscriptSummaryNote(insights: TranscriptInsights, opts?: { source?: string }) {
  const lines: string[] = ["📞 Call Summary (auto-extracted)"];

  if (insights.call_summary) lines.push("", insights.call_summary);
  if (insights.call_sentiment) lines.push("", `Sentiment: ${insights.call_sentiment}`);
  if (insights.buying_signal_strength) lines.push(`Buying signal: ${insights.buying_signal_strength}`);
  if (insights.buying_timeline) lines.push(`Timeline: ${insights.buying_timeline}`);
  if (insights.budget_indication) lines.push(`Budget: ${insights.budget_indication}`);
  if (insights.dm_name || insights.dm_role) {
    lines.push(`Decision maker: ${[insights.dm_name, insights.dm_role].filter(Boolean).join(" — ")}`);
  }
  if (insights.key_quote) lines.push("", `Prospect quote: "${insights.key_quote}"`);

  if (insights.objections.length > 0) {
    lines.push("", "Objections:");
    for (const o of insights.objections) {
      lines.push(`• ${o.objection} → ${o.how_handled}`);
    }
  }

  if (insights.agreed_next_steps) lines.push("", `Agreed next steps: ${insights.agreed_next_steps}`);
  if (insights.recommended_lifecycle_stage) lines.push("", `Suggested lifecycle stage: ${insights.recommended_lifecycle_stage}${insights.booked ? " (meeting booked)" : ""}`);

  if (opts?.source) lines.push("", `— ${opts.source}`);

  return lines.join("\n");
}

// -------- Objection Bank helpers --------
function categorizeObjection(text: string): string {
  const t = text.toLowerCase();
  if (/(agency|already (have|work)|referral|competitor|using someone|current provider)/.test(t)) return "competitor";
  if (/(budget|afford|expensive|price|cost|money|cheap)/.test(t)) return "price";
  if (/(busy|bad time|call.*back|later|another time|not now|next (week|month|quarter))/.test(t)) return "timing";
  if (/(partner|boss|manager|wife|husband|team|board|owner|talk to|check with|need to (ask|discuss))/.test(t)) return "authority";
  if (/(send.*email|not interested|no thanks|remove me|take me off)/.test(t)) return "smokescreen";
  if (/(think about|thinking|consider|need to think|didn't work|tried before|doing fine|we're good|nothing.*broken|scared|worried|risky)/.test(t)) return "fear";
  if (/(who are you|what.*about|how did you get|where.*from|number|list|source)/.test(t)) return "logistical";
  return "other";
}

function normalizeObjectionText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

async function upsertObjectionsIntoBank(
  adminClient: ReturnType<typeof createClient>,
  params: {
    objections: Array<{ objection: string; how_handled: string }>;
    contactId: string;
    callLogId: string | null;
    ledToBooking: boolean;
    userId: string;
  },
) {
  for (const item of params.objections) {
    const text = (item.objection ?? "").trim();
    if (!text || text.length < 4) continue;
    const normalized = normalizeObjectionText(text);
    const category = categorizeObjection(text);
    const howHandled = (item.how_handled ?? "").trim();

    // Look for near-duplicate (any source). Prefer framework rows so they accumulate stats.
    const { data: existingRows } = await adminClient
      .from("objection_bank")
      .select("id, example_responses, times_seen, booked_count, source")
      .eq("normalized_text", normalized)
      .limit(2);

    const existing = (existingRows ?? []).sort((a: any, b: any) => {
      if (a.source === b.source) return 0;
      return a.source === "framework" ? -1 : 1;
    })[0] as any | undefined;

    if (existing) {
      const responses = Array.isArray(existing.example_responses) ? [...existing.example_responses] : [];
      if (howHandled && howHandled !== "(not addressed)") {
        const already = responses.some(
          (r: any) => normalizeObjectionText(String(r?.response ?? "")) === normalizeObjectionText(howHandled),
        );
        if (!already && responses.length < 12) {
          responses.push({ response: howHandled, source: "call" });
        }
      }
      await adminClient
        .from("objection_bank")
        .update({
          example_responses: responses,
          times_seen: (existing.times_seen ?? 1) + 1,
          booked_count: (existing.booked_count ?? 0) + (params.ledToBooking ? 1 : 0),
        })
        .eq("id", existing.id);
    } else {
      const responses = howHandled && howHandled !== "(not addressed)"
        ? [{ response: howHandled, source: "call" }]
        : [];
      await adminClient.from("objection_bank").insert({
        objection_text: text,
        category,
        source: "call",
        example_responses: responses,
        contact_id: params.contactId,
        call_log_id: params.callLogId,
        led_to_booking: params.ledToBooking,
        times_seen: 1,
        booked_count: params.ledToBooking ? 1 : 0,
        created_by: params.userId,
      });
    }
  }
}

async function applyTranscriptInsightsToContact(params: {
  adminClient: ReturnType<typeof createClient>;
  contactId: string;
  userId: string;
  dialpadCallId: string;
  transcript: string;
  insights: TranscriptInsights;
  dialpadCallsRowId?: string | null;
  callLogId?: string | null;
  source?: string;
}) {
  const writes = {
    note_written: false,
    fields_written: [] as string[],
    lifecycle_advanced_to: null as string | null,
    transcript_stored: false,
    scorecard_stored: false,
    scorecard_id: null as string | null,
    overall_score: null as number | null,
  };

  // 1. Append call-summary note (source = call_transcript).
  try {
    await upsertContactNote(params.adminClient, {
      contactId: params.contactId,
      createdBy: params.userId,
      dialpadCallId: params.dialpadCallId,
      source: "call_transcript",
      content: buildTranscriptSummaryNote(params.insights, { source: params.source ?? "AI transcript analysis" }),
    });
    writes.note_written = true;
  } catch (err) {
    console.error("[transcript-apply] Failed to write summary note:", err);
  }

  // 2. Fetch current contact to enforce fill-if-empty semantics.
  const { data: current, error: currentErr } = await params.adminClient
    .from("contacts")
    .select("dm_name, dm_role, buying_signal_strength, budget_indication, buying_timeline, last_call_sentiment, key_quote, agreed_next_steps")
    .eq("id", params.contactId)
    .maybeSingle();

  if (currentErr) {
    console.error("[transcript-apply] Failed to load contact for fill-if-empty:", currentErr.message);
  } else if (current) {
    const fillIfEmpty: Record<string, string> = {};
    const map: Array<[keyof typeof current, string | null]> = [
      ["dm_name", params.insights.dm_name],
      ["dm_role", params.insights.dm_role],
      ["buying_signal_strength", params.insights.buying_signal_strength],
      ["budget_indication", params.insights.budget_indication],
      ["buying_timeline", params.insights.buying_timeline],
      ["last_call_sentiment", params.insights.call_sentiment],
      ["key_quote", params.insights.key_quote],
      ["agreed_next_steps", params.insights.agreed_next_steps],
    ];

    for (const [field, value] of map) {
      if (!value) continue;
      const existing = current[field];
      if (existing === null || existing === undefined || (typeof existing === "string" && existing.trim() === "")) {
        fillIfEmpty[field as string] = value;
      }
    }

    if (Object.keys(fillIfEmpty).length > 0) {
      const { error: updateErr } = await params.adminClient
        .from("contacts")
        .update(fillIfEmpty)
        .eq("id", params.contactId);

      if (updateErr) {
        console.error("[transcript-apply] Fill-if-empty update failed:", updateErr.message);
      } else {
        writes.fields_written = Object.keys(fillIfEmpty);
      }
    }
  }

  // 3. Forward-only lifecycle advance via existing RPC. Booked forces >= 'booked'.
  let targetStage = params.insights.recommended_lifecycle_stage;
  if (params.insights.booked) targetStage = targetStage ?? "booked";
  if (targetStage) {
    const { error: rpcErr } = await params.adminClient.rpc("advance_contact_lifecycle", {
      _contact_id: params.contactId,
      _target: targetStage,
      _reason: "transcript_extraction",
    });
    if (rpcErr) {
      console.error("[transcript-apply] advance_contact_lifecycle failed:", rpcErr.message);
    } else {
      writes.lifecycle_advanced_to = targetStage;
    }
  }

  // 4. Persist the raw transcript on the dialpad_calls row (new column).
  try {
    let query = params.adminClient.from("dialpad_calls").update({ transcript: params.transcript });
    query = params.dialpadCallsRowId
      ? query.eq("id", params.dialpadCallsRowId)
      : query.eq("dialpad_call_id", params.dialpadCallId);
    const { error: tErr } = await query;
    if (tErr) {
      console.error("[transcript-apply] Failed to store raw transcript:", tErr.message);
    } else {
      writes.transcript_stored = true;
    }
  } catch (err) {
    console.error("[transcript-apply] Transcript store threw:", err);
  }

  // 5. Persist the NEPQ scorecard, if the AI returned one.
  if (params.insights.nepq_scorecard) {
    let resolvedCallLogId: string | null = params.callLogId ?? null;
    if (!resolvedCallLogId && params.dialpadCallId && !params.dialpadCallId.startsWith("test_")) {
      const { data: matched } = await params.adminClient
        .from("call_logs")
        .select("id")
        .eq("dialpad_call_id", params.dialpadCallId)
        .maybeSingle();
      resolvedCallLogId = matched?.id ?? null;
    }
    try {
      const { data: inserted, error: scoreErr } = await params.adminClient
        .from("call_scores")
        .insert({
          call_log_id: resolvedCallLogId,
          contact_id: params.contactId,
          dialpad_call_id: params.dialpadCallId,
          scorecard: params.insights.nepq_scorecard,
          overall_score: params.insights.nepq_scorecard.overall_score,
          broke_down_at: params.insights.nepq_scorecard.broke_down_at,
          booking_blocker: params.insights.nepq_scorecard.booking_blocker,
        })
        .select("id")
        .maybeSingle();
      if (scoreErr) {
        console.error("[transcript-apply] Failed to store call scorecard:", scoreErr.message);
      } else {
        writes.scorecard_stored = true;
        writes.scorecard_id = inserted?.id ?? null;
        writes.overall_score = params.insights.nepq_scorecard.overall_score;
      }
    } catch (err) {
      console.error("[transcript-apply] Scorecard insert threw:", err);
    }
  }

  // 6. Feed the Objection Bank with any objections captured on this call.
  if (Array.isArray(params.insights.objections) && params.insights.objections.length > 0) {
    try {
      await upsertObjectionsIntoBank(params.adminClient, {
        objections: params.insights.objections,
        contactId: params.contactId,
        callLogId: params.callLogId ?? null,
        ledToBooking: Boolean(params.insights.booked),
        userId: params.userId,
      });
    } catch (err) {
      console.error("[transcript-apply] Objection bank upsert threw:", err);
    }
  }

  return writes;
}

// Safe wrapper — never throws, always returns a summary. Used by the real
// webhook path and by the test action so nothing breaks before the Dialpad key
// or the AI gateway is fully live.
async function runTranscriptExtractionPipeline(params: {
  adminClient: ReturnType<typeof createClient>;
  contactId: string;
  userId: string;
  dialpadCallId: string;
  transcript: string | null | undefined;
  businessName?: string | null;
  phoneNumber?: string | null;
  dialpadCallsRowId?: string | null;
  callLogId?: string | null;
  source?: string;
}) {
  if (!params.transcript || params.transcript.trim().length < 40) {
    return { skipped: true as const, reason: "no_transcript" as const };
  }

  if (!Deno.env.get("LOVABLE_API_KEY")) {
    return { skipped: true as const, reason: "no_lovable_api_key" as const };
  }

  try {
    const insights = await extractTranscriptInsights({
      transcript: params.transcript,
      businessName: params.businessName,
      phoneNumber: params.phoneNumber,
    });

    if (!insights) {
      return { skipped: false as const, ok: false as const, reason: "extraction_failed" as const };
    }

    const writes = await applyTranscriptInsightsToContact({
      adminClient: params.adminClient,
      contactId: params.contactId,
      userId: params.userId,
      dialpadCallId: params.dialpadCallId,
      transcript: params.transcript,
      insights,
      dialpadCallsRowId: params.dialpadCallsRowId,
      callLogId: params.callLogId ?? null,
      source: params.source,
    });

    return { skipped: false as const, ok: true as const, insights, writes };
  } catch (err) {
    console.error("[transcript-pipeline] Unexpected failure:", err);
    return { skipped: false as const, ok: false as const, reason: "unexpected_error" as const, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────
// Booked-call scoring (targeted training analysis)
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// Transcript correction (booked calls only)
// ─────────────────────────────────────────────────────────────────────
// Dialpad ASR frequently mangles rep names, company words and trade
// vocabulary — e.g. "it's space from ode" for "it's Bede from Odin".
// Before scoring a booked transcript we run ONE Lovable-AI pass that
// corrects ONLY speech-recognition errors, preserving line structure and
// speaker labels. Same capped lane (kind='booked_call_scoring') as
// scoring, so cost stays in cents/day.

const TRANSCRIPT_CORRECTION_SYSTEM_PROMPT = `You correct speech-to-text errors in call transcripts. You output a CORRECTED transcript, nothing else.

HARD RULES:
- Fix ONLY automatic-speech-recognition mistakes: misheard names, company words, garbled phrases, obvious homophones.
- NEVER add, remove, paraphrase, summarise, translate, or reorder content.
- Preserve the EXACT line structure: same number of lines, same speaker labels/prefixes (e.g. "Rep:", "Prospect:", timestamps) in the same positions.
- Preserve punctuation, casing style, and filler words ("um", "uh", "yeah") as they appear.
- If a passage is unintelligible or ambiguous, leave it EXACTLY as-is. Never guess.
- Do NOT wrap the output in quotes, code fences, or JSON. Output the corrected transcript as plain text only.

You are given a GLOSSARY of names and terms that are commonly misheard on these calls. Use it to identify likely ASR errors and replace them with the correct spelling in-place. Only apply a glossary correction when the surrounding phrase clearly indicates the mistake (e.g. "it's <garbled> from <company misheard>"). Do not force glossary terms into unrelated passages.`;

function buildTranscriptCorrectionGlossary(params: {
  repNames: string[];
  businessName: string | null;
  dmName: string | null;
}): string {
  const reps = Array.from(new Set(params.repNames.filter(Boolean))).slice(0, 8);
  const lines: string[] = [];
  lines.push("COMPANY (the caller's company):");
  lines.push("- Odin Digital — commonly misheard as: ode, odin, oden, odine, odeon, oldin, orden, o'din, owdin");
  lines.push("- App name: Speedy Dialer — commonly misheard as: speedy dyler, speedy diver, speedy dial, speedy dallier");
  lines.push("");
  if (reps.length) {
    lines.push("REP NAMES (people making the outbound calls — a first name in the opener is almost always one of these):");
    for (const r of reps) lines.push(`- ${r}`);
    lines.push("Common Bede mishearings: space, bead, bed, beed, bade, bay, bee, be, peed, weed, bade, beed.");
    lines.push("");
  }
  if (params.businessName || params.dmName) {
    lines.push("LEAD (the prospect on this specific call):");
    if (params.businessName) lines.push(`- Business name: ${params.businessName}`);
    if (params.dmName) lines.push(`- Decision maker: ${params.dmName}`);
    lines.push("");
  }
  lines.push("SALES / MARKETING VOCABULARY (fix obvious ASR variants):");
  lines.push("- Google Ads, AdWords, Meta (Facebook/Instagram) Ads, SEO, landing page, cost per lead, CPL, retargeting, conversion, funnel, CRM, GoHighLevel, GHL");
  lines.push("");
  lines.push("AUSTRALIAN TRADE TERMS: tradie, sparky, chippy, plumber, sparkies, HVAC, aircon, split system, hot water, roofer, brickie, concreter, ute.");
  return lines.join("\n");
}

// Cheap similarity check: are the two transcripts materially different?
// We ignore whitespace/punctuation to avoid churn on cosmetic changes.
function transcriptChangedMaterially(before: string, after: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const a = norm(before);
  const b = norm(after);
  if (a === b) return false;
  // A tiny char-count delta with identical length is still "material" if any
  // token flipped — the normalised compare above already handles the punct case.
  return true;
}

async function correctTranscript(params: {
  transcript: string;
  businessName: string | null;
  dmName: string | null;
  repNames: string[];
}): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;
  const raw = params.transcript;
  if (!raw || raw.trim().length < 20) return null;

  const glossary = buildTranscriptCorrectionGlossary({
    repNames: params.repNames,
    businessName: params.businessName,
    dmName: params.dmName,
  });
  const userPrompt = [
    "GLOSSARY:",
    glossary,
    "",
    "TRANSCRIPT TO CORRECT (return the corrected transcript, same line structure, plain text only):",
    raw,
  ].join("\n");

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
          { role: "system", content: TRANSCRIPT_CORRECTION_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[transcript-correction] Gateway ${response.status}: ${body.slice(0, 400)}`);
      return null;
    }
    const result = await response.json().catch(() => null);
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    // Strip any accidental code fences / leading label the model may add.
    let corrected = content
      .replace(/^\s*```(?:text|markdown)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .replace(/^\s*(?:corrected transcript|output)\s*:\s*/i, "")
      .trim();
    if (!corrected) return null;
    // Sanity: if the model shortened by >25% it likely paraphrased — reject.
    if (corrected.length < raw.length * 0.75 || corrected.length > raw.length * 1.35) {
      console.warn(`[transcript-correction] length delta out of bounds (raw=${raw.length}, corrected=${corrected.length}) — rejecting`);
      return null;
    }
    return corrected;
  } catch (err) {
    console.error("[transcript-correction] Request failed:", err);
    return null;
  }
}

// Fetches display_name for each unique user_id in the batch — used to build
// the rep-names glossary passed to correctTranscript.
async function loadRepDisplayNames(
  adminClient: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(userIds.filter(Boolean)));
  if (uniq.length === 0) return new Map();
  const { data } = await adminClient
    .from("profiles")
    .select("user_id, display_name")
    .in("user_id", uniq);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const name = (row as any).display_name;
    if (typeof name === "string" && name.trim()) map.set((row as any).user_id, name.trim());
  }
  return map;
}

// Runs ONE Lovable-AI call per booked transcript that produces BOTH the
// standard NEPQ scorecard AND a compact "qualities" object (opener, discovery
// count/examples, objections handled, talk/listen estimate, pace-to-booking,
// standout lines). Gated by the enrichment_ai_budget (kind='booked_call_scoring')
// so this can never run away in cost.

const BOOKED_CALL_TRAINING_SYSTEM_PROMPT = `You are a senior sales coach reviewing a BOOKED outbound sales call for an Australian digital marketing agency selling to blue-collar trades (HVAC, plumbing, electrical, roofing).
You are trained in the NEPQ framework (Jeremy Miner / 7th Level), "Fanatical Prospecting" (Jeb Blount), and "Cold Calling Sucks" (Farrokh & Cegelski).
A meeting WAS booked on this call. Your job is (a) grade it against NEPQ (same rubric used across our call intelligence) AND (b) extract a compact TRAINING QUALITIES object so reps can learn what worked.

Return ONLY a single valid JSON object with this EXACT schema — no prose, no markdown:
{
  "nepq_scorecard": {
    "nepq_scores": {
      "connection": integer,        // 0-5
      "situation": integer,         // 0-5
      "problem_awareness": integer, // 0-5
      "solution_awareness": integer,// 0-5
      "consequence": integer,       // 0-5
      "transition": integer,        // 0-5
      "presentation": integer,      // 0-5
      "commitment": integer         // 0-5
    },
    "overall_score": integer,       // 0-100 holistic rating of the call vs the NEPQ framework
    "broke_down_at": "connection" | "situation" | "problem_awareness" | "solution_awareness" | "consequence" | "transition" | "presentation" | "commitment" | "none",
    "what_went_well": [string],     // 1-4 short bullets, ≤ 140 chars each
    "coaching_tips": [ { "stage": "connection"|"situation"|"problem_awareness"|"solution_awareness"|"consequence"|"transition"|"presentation"|"commitment", "tip": string } ],
    "booking_blocker": "booked"     // MUST be the literal string "booked" — a meeting was agreed on this call
  },
  "qualities": {
    "opener_style": string,             // 1 sentence describing the rep's opener (e.g. "Pattern-interrupt with permission ask", "Referral name-drop", "Direct value pitch")
    "opener_quote": string | null,      // the actual first line the rep said, verbatim (< 200 chars)
    "discovery": {
      "count": integer,                 // number of genuine discovery questions the rep asked (not rhetorical)
      "examples": [string]              // up to 4 verbatim discovery questions
    },
    "objections_handled": [             // each real prospect objection + a brief note on the technique used
      { "objection": string, "technique": string, "worked": boolean }
    ],
    "talk_listen_balance": {
      "rep_talk_percent": integer,      // 0-100, rough estimate from transcript volume
      "prospect_talk_percent": integer  // 0-100, together should sum ~100
    },
    "pace_to_booking": string,          // where in the call the booking happened, plain English (e.g. "Booked in first third — high urgency signal", "Booked after long value-build in second half")
    "standout_lines": [string]          // 1-4 short verbatim lines from the rep worth copying to a swipe file
  }
}

NEPQ rubric — score each stage 0 (absent/harmful) to 5 (textbook):
- connection: lower guard, take pressure off, calm trusted-advisor tone.
- situation: understand current reality with a couple of neutral questions.
- problem_awareness: surface emotional friction and cost of the problem.
- solution_awareness: get them picturing life after the problem in THEIR words.
- consequence: elevate cost of inaction / urgency without pressure.
- transition: bridge to pitch when the prospect's interest invites it.
- presentation: present ONLY against problems they named; two-way; hold price until value is built.
- commitment: clean committing question; handle objections logistical → fear → smokescreen.

Rules:
- booking_blocker MUST be the literal string "booked".
- Only score stages the rep actually reached. Stages that never occurred score 0.
- overall_score reflects the WHOLE call — a clean booked call should sit 60-95.
- Never invent facts. If a quality field cannot be determined, use [] or null as appropriate.
- Keep every string concise (under 240 chars) and free of markdown.`;

type CallQualities = {
  opener_style: string | null;
  opener_quote: string | null;
  discovery: { count: number; examples: string[] };
  objections_handled: Array<{ objection: string; technique: string; worked: boolean }>;
  talk_listen_balance: { rep_talk_percent: number; prospect_talk_percent: number };
  pace_to_booking: string | null;
  standout_lines: string[];
};

function validateCallQualities(raw: unknown): CallQualities {
  const empty: CallQualities = {
    opener_style: null,
    opener_quote: null,
    discovery: { count: 0, examples: [] },
    objections_handled: [],
    talk_listen_balance: { rep_talk_percent: 0, prospect_talk_percent: 0 },
    pace_to_booking: null,
    standout_lines: [],
  };
  if (!isRecord(raw)) return empty;
  const discoveryRaw = isRecord(raw.discovery) ? raw.discovery : {};
  const balRaw = isRecord(raw.talk_listen_balance) ? raw.talk_listen_balance : {};
  const objRaw = Array.isArray(raw.objections_handled) ? raw.objections_handled : [];
  const standoutRaw = Array.isArray(raw.standout_lines) ? raw.standout_lines : [];
  const examplesRaw = Array.isArray(discoveryRaw.examples) ? discoveryRaw.examples : [];

  const discovery = {
    count: clampInt(discoveryRaw.count, 0, 50, 0),
    examples: examplesRaw
      .map((e) => coerceInsightString(e, 240))
      .filter((s): s is string => Boolean(s))
      .slice(0, 6),
  };

  const objections_handled: CallQualities["objections_handled"] = [];
  for (const o of objRaw) {
    if (!isRecord(o)) continue;
    const objection = coerceInsightString(o.objection, 240);
    const technique = coerceInsightString(o.technique, 240);
    if (!objection) continue;
    objections_handled.push({
      objection,
      technique: technique ?? "(not described)",
      worked: o.worked === true,
    });
    if (objections_handled.length >= 8) break;
  }

  const rep_talk_percent = clampInt(balRaw.rep_talk_percent, 0, 100, 0);
  const prospect_talk_percent = clampInt(balRaw.prospect_talk_percent, 0, 100, 0);

  const standout_lines = standoutRaw
    .map((s) => coerceInsightString(s, 240))
    .filter((s): s is string => Boolean(s))
    .slice(0, 6);

  return {
    opener_style: coerceInsightString(raw.opener_style, 240),
    opener_quote: coerceInsightString(raw.opener_quote, 400),
    discovery,
    objections_handled,
    talk_listen_balance: { rep_talk_percent, prospect_talk_percent },
    pace_to_booking: coerceInsightString(raw.pace_to_booking, 300),
    standout_lines,
  };
}

async function extractBookedCallScoring(params: {
  transcript: string;
  businessName?: string | null;
  phoneNumber?: string | null;
}): Promise<{ nepq_scorecard: NepqScorecard | null; qualities: CallQualities } | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  const userPrompt = [
    "Grade and extract training qualities from the following BOOKED sales call transcript.",
    params.businessName ? `Prospect business: ${params.businessName}` : null,
    params.phoneNumber ? `Phone: ${params.phoneNumber}` : null,
    "",
    "Transcript:",
    params.transcript,
  ].filter(Boolean).join("\n");

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
          { role: "system", content: BOOKED_CALL_TRAINING_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`[booked-scoring] Gateway ${response.status}: ${body.slice(0, 400)}`);
      return null;
    }
    const result = await response.json().catch(() => null);
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) return null;
      try { parsed = JSON.parse(m[0]); } catch { return null; }
    }
    if (!isRecord(parsed)) return null;
    const nepq_scorecard = validateNepqScorecard((parsed as JsonRecord).nepq_scorecard);
    if (nepq_scorecard) {
      // Force booking_blocker to "booked" since this is a booked-call scorer.
      nepq_scorecard.booking_blocker = "booked";
    }
    const qualities = validateCallQualities((parsed as JsonRecord).qualities);
    return { nepq_scorecard, qualities };
  } catch (err) {
    console.error("[booked-scoring] Request failed:", err);
    return null;
  }
}

// Reads the AI budget row for booked_call_scoring, resets counters if the
// Melbourne day rolled over, and returns a reserver + persistor.
async function loadBookedScoringBudget(
  adminClient: ReturnType<typeof createClient>,
  opts?: { kind?: string; defaultCap?: number },
) {
  const kind = opts?.kind ?? "booked_call_scoring";
  const defaultCap = opts?.defaultCap ?? 100;
  const melbTodayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
  const { data } = await adminClient
    .from("enrichment_ai_budget")
    .select("id, day, calls_used, daily_cap")
    .eq("kind", kind)
    .maybeSingle();
  const row = data as { id: string; day: string; calls_used: number; daily_cap: number } | null;
  const dailyCap = row?.daily_cap ?? defaultCap;
  const usedToday = row?.day === melbTodayIso ? (row?.calls_used ?? 0) : 0;
  const remaining = Math.max(0, dailyCap - usedToday);
  const state = { made: 0 };
  return {
    dailyCap,
    usedToday,
    remaining,
    reserve(): boolean {
      if (state.made >= remaining) return false;
      state.made++;
      return true;
    },
    async persist() {
      if (state.made === 0) return;
      const newUsed = row?.day === melbTodayIso ? usedToday + state.made : state.made;
      if (row?.id) {
        await adminClient
          .from("enrichment_ai_budget")
          .update({ day: melbTodayIso, calls_used: newUsed, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      } else {
        await adminClient
          .from("enrichment_ai_budget")
          .upsert({ kind, day: melbTodayIso, calls_used: newUsed, daily_cap: dailyCap, updated_at: new Date().toISOString() }, { onConflict: "kind" });
      }
    },
    made: () => state.made,
  };
}

async function scoreBookedCalls(params: {
  adminClient: ReturnType<typeof createClient>;
  limit?: number;
}) {
  const cap = Math.min(Math.max(params.limit ?? 20, 1), 20);
  if (!Deno.env.get("LOVABLE_API_KEY")) {
    return { ok: false as const, reason: "no_lovable_api_key" };
  }

  const budget = await loadBookedScoringBudget(params.adminClient);
  if (budget.remaining <= 0) {
    return {
      ok: true as const,
      considered: 0,
      scored: 0,
      skipped: 0,
      errors: [] as string[],
      budget: { daily_cap: budget.dailyCap, used_today: budget.usedToday, remaining: 0 },
      reason: "daily_cap_reached" as const,
    };
  }

  // Eligible = booked call_logs joined to a dialpad_calls row with a transcript
  // and NO existing call_scores row. Pull enough headroom to survive dupes.
  const { data: eligible, error: eligErr } = await params.adminClient
    .from("call_logs")
    .select(`
      id,
      contact_id,
      user_id,
      dialpad_calls:dialpad_calls!dialpad_calls_call_log_id_fkey (
        id,
        dialpad_call_id,
        transcript,
        external_number
      ),
      contacts:contacts (business_name, dm_name)
    `)
    .eq("outcome", "booked")
    .order("created_at", { ascending: false })
    .limit(cap * 4);
  if (eligErr) return { ok: false as const, reason: eligErr.message };

  // Preload rep display names for the whole batch — used to ground the
  // transcript-correction glossary (e.g. Bede → not "space"/"bead").
  const repNameMap = await loadRepDisplayNames(
    params.adminClient,
    (eligible ?? []).map((r: any) => r.user_id).filter(Boolean),
  );
  const allRepNames = Array.from(new Set(repNameMap.values()));

  const scoredResults: Array<{
    call_log_id: string;
    business_name: string | null;
    overall_score: number;
    booking_blocker: string;
    broke_down_at: string;
    opener_style: string | null;
    discovery_count: number;
    transcript_corrected: boolean;
  }> = [];
  const errors: string[] = [];
  let considered = 0;
  let skipped = 0;
  let correctedCount = 0;

  for (const row of eligible ?? []) {
    // Each booked call consumes up to 2 slots (1 correction + 1 scoring).
    if (budget.made() + 2 > budget.remaining) break;
    if (budget.made() >= Math.min(cap * 2, budget.remaining)) break;
    const dpRaw = (row as any).dialpad_calls;
    const dpArr = Array.isArray(dpRaw) ? dpRaw : dpRaw ? [dpRaw] : [];
    const dp = dpArr.find((d: any) => d?.transcript && String(d.transcript).trim().length >= 40);
    if (!dp) { skipped++; continue; }

    // Skip if a call_scores row already exists for this call_log
    const { data: existing } = await params.adminClient
      .from("call_scores")
      .select("id")
      .eq("call_log_id", (row as any).id)
      .maybeSingle();
    if (existing) { skipped++; continue; }

    considered++;
    const businessName = (row as any).contacts?.business_name ?? null;
    const dmName = (row as any).contacts?.dm_name ?? null;
    const rawTranscript = String(dp.transcript);
    const repName = repNameMap.get((row as any).user_id) ?? null;
    const repNamesForCall = Array.from(new Set([
      repName,
      ...allRepNames,
    ].filter((s): s is string => Boolean(s))));

    // (1) Correction pass — reserve one budget slot for it. Falls back to
    // raw transcript if the correction call fails or is rejected.
    let transcript = rawTranscript;
    if (budget.reserve()) {
      const corrected = await correctTranscript({
        transcript: rawTranscript,
        businessName,
        dmName,
        repNames: repNamesForCall,
      });
      if (corrected && transcriptChangedMaterially(rawTranscript, corrected)) {
        transcript = corrected;
        correctedCount++;
        // Persist corrected version to call_logs.dialpad_transcript so the
        // Winning Calls library + downstream scoring see the corrected text.
        // Raw stays untouched in dialpad_calls.transcript.
        const { error: updErr } = await params.adminClient
          .from("call_logs")
          .update({ dialpad_transcript: corrected })
          .eq("id", (row as any).id);
        if (updErr) {
          errors.push(`call_log ${row.id}: correction persist failed: ${updErr.message}`);
        }
      }
    }

    // (2) Scoring pass — reserve one budget slot for it.
    if (!budget.reserve()) break;
    const extraction = await extractBookedCallScoring({
      transcript,
      businessName,
      phoneNumber: dp.external_number ?? null,
    });
    if (!extraction || !extraction.nepq_scorecard) {
      errors.push(`call_log ${row.id}: extraction failed`);
      continue;
    }

    const merged = {
      ...extraction.nepq_scorecard,
      qualities: extraction.qualities,
    };

    const { error: insErr } = await params.adminClient
      .from("call_scores")
      .insert({
        call_log_id: (row as any).id,
        contact_id: (row as any).contact_id,
        dialpad_call_id: dp.dialpad_call_id,
        scorecard: merged,
        overall_score: extraction.nepq_scorecard.overall_score,
        broke_down_at: extraction.nepq_scorecard.broke_down_at,
        booking_blocker: extraction.nepq_scorecard.booking_blocker,
      });
    if (insErr) {
      errors.push(`call_log ${row.id}: ${insErr.message}`);
      continue;
    }

    scoredResults.push({
      call_log_id: (row as any).id,
      business_name: businessName,
      overall_score: extraction.nepq_scorecard.overall_score,
      booking_blocker: extraction.nepq_scorecard.booking_blocker,
      broke_down_at: extraction.nepq_scorecard.broke_down_at,
      opener_style: extraction.qualities.opener_style,
      discovery_count: extraction.qualities.discovery.count,
      transcript_corrected: transcript !== rawTranscript,
    });
  }

  await budget.persist();

  return {
    ok: true as const,
    considered,
    scored: scoredResults.length,
    transcripts_corrected: correctedCount,
    skipped,
    errors: errors.slice(0, 10),
    budget: {
      daily_cap: budget.dailyCap,
      used_today: budget.usedToday + budget.made(),
      remaining: Math.max(0, budget.remaining - budget.made()),
    },
    results: scoredResults,
  };
}


// ─────────────────────────────────────────────────────────────────────
// AI Call Coach (wins AND losses → "better path" coaching per call,
// plus a per-rep aggregate profile in rep_coaching_profile).
// ─────────────────────────────────────────────────────────────────────
// Reuses the booked_call_scoring budget lane so total AI spend stays
// cents/day. dialpad_transcript is already ASR-corrected by the
// scoreBookedCalls pass for booked calls; non-booked outcomes fall back
// to the raw dialpad_transcript, which is good enough for coaching.

const COACH_MODEL = "google/gemini-3-flash-preview";
const COACHING_ELIGIBLE_OUTCOMES = ["booked", "not_interested", "follow_up", "dnc", "gatekeeper"] as const;

const COACH_SYSTEM_PROMPT = `You are a sharp, no-fluff Australian cold-call coach. You review ONE real outbound sales call transcript and produce concrete, specific coaching.

HARD RULES:
- Be direct and specific. NEVER give generic advice like "build more rapport", "listen more", "be confident".
- ALWAYS quote the transcript verbatim in "key_moment". Use the exact words the rep or prospect said.
- Ground "better_path" in what actually works. For stream "cold_first_touch", ground it FIRST in the WINNING OPENER EXCERPTS and WINNING PATTERNS from our own booked calls (real Australian tradies who booked from first-touch cold). Only fall back to generic methodology when our corpus has no example for the moment you're coaching. For warm streams (inbound_ad, cold_email, re_engagement, cold_follow_up), the standard inbound/closing methodology (agree-reduce-redirect, NEPQ, structured discovery, direct booking ask) IS the right lane — weight it accordingly.
- "example_lines" must sound like THIS rep, in THEIR casual Aussie tone from the transcript — no corporate script-speak, no "circle back", no "value add".
- For BOOKED calls: coaching = what made it work + ONE sharpening point (still specific, still quoted).
- Always find one genuine "went_well". If it's a disaster call, the "went_well" can be as small as "kept dialling" — but must be honest.
- NEVER present methodology as gospel. If the transcript shows something working that contradicts the framework (e.g. rep books a meeting with a "wrong" opener), say so explicitly and treat the real result as the evidence. Reality outranks theory.
- Do NOT use absolute industry benchmarks (e.g. "you should hit 90% pickup-to-conversation"). Only reference the INTERNAL BENCHMARK numbers supplied in the prompt — those are our real ceiling to coach toward.
- Output STRICT JSON only. No prose before or after. No markdown fences.

FUNNEL DIAGNOSIS (required): identify the FIRST stage of the 7-stage funnel where the call broke. Fix top-first — a broken opener makes everything downstream irrelevant. Stages in order: opener → resistance (first-minute brush-off) → discovery → problem_awareness → gap_build → ask (the booking ask) → objections. Use "none" only for a genuinely clean call.

FIVE PILLARS (required): score 1-5 (1 = poor, 5 = excellent) on tonality, command_of_call, probing, word_economy, objection_handling. Use null for objection_handling ONLY when no objection ever surfaced. Never null the other four.

Return this exact shape:
{
  "summary": "one line on what happened",
  "key_moment": "the exact quoted line(s) where the call was won or lost",
  "what_happened": "what the rep did at that moment",
  "better_path": "the specific alternative move, grounded in the winning patterns",
  "example_lines": ["1-3 exact things the rep could have said in their own casual Aussie style"],
  "skill_tag": "one of: opening, discovery, objection_handling, gatekeeper, closing_ask, follow_up_setup, tonality_pace",
  "went_well": "one thing done well",
  "drill": "a one-line roleplay drill instruction to practice the better path",
  "first_broken_stage": "one of: opener, resistance, discovery, problem_awareness, gap_build, ask, objections, none",
  "pillar_scores": { "tonality": 1-5, "command_of_call": 1-5, "probing": 1-5, "word_economy": 1-5, "objection_handling": 1-5 or null }
}`;

const REP_PROFILE_SYSTEM_PROMPT = `You are a sales manager writing a short coaching profile for ONE rep, based on their recent per-call coaching notes.

HARD RULES:
- Look for RECURRING patterns across the coaching notes. A one-off issue is not a focus area.
- "evidence" must cite REAL calls from the input (business_name + short quote or paraphrase from what_happened / key_moment). No made-up examples.
- "better_path" and "drill" must be specific and actionable, not generic advice.
- Output STRICT JSON only. No prose, no markdown fences.

Return this exact shape:
{
  "focus_areas": [
    { "area": "short label", "skill_tag": "opening|discovery|objection_handling|gatekeeper|closing_ask|follow_up_setup|tonality_pace",
      "evidence": "short, cites 1-2 real calls by business name", "better_path": "specific alternative move", "drill": "one-line practice drill" }
  ],
  "strengths": [
    { "area": "short label", "evidence": "short, cites real calls" }
  ]
}
Return AT MOST 3 focus_areas and AT MOST 2 strengths. Fewer is fine if the evidence isn't there.`;

// Build the "winning patterns" digest by scanning the qualities JSON on the
// top ~10 recent booked calls. This is cheap (one AI call per coach_calls
// run, no per-call cost) and grounds every coaching note in what actually
// works on booked calls.
async function buildWinningPatternsDigest(
  adminClient: ReturnType<typeof createClient>,
): Promise<{ digest: string; opener_excerpts: string[]; sample_size: number }> {
  const { data } = await adminClient
    .from("call_scores")
    .select("call_log_id, overall_score, scorecard, call_logs:call_logs!inner(outcome, dialpad_transcript, contacts:contacts(business_name))")
    .order("created_at", { ascending: false })
    .limit(30);
  const booked = (data ?? []).filter((r: any) => r.call_logs?.outcome === "booked");
  const top = booked
    .filter((r: any) => (r.overall_score ?? 0) >= 60)
    .sort((a: any, b: any) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
    .slice(0, 10);
  if (top.length === 0) {
    return { digest: "No booked-call qualities available yet. Ground coaching in fundamentals: pattern-interrupt opener, situation-questions before pitching, agreement-frame before the booking ask.", opener_excerpts: [], sample_size: 0 };
  }
  const qualities = top.map((r: any) => ({
    business: r.call_logs?.contacts?.business_name ?? null,
    score: r.overall_score,
    qualities: r.scorecard?.qualities ?? null,
  }));

  // 2-3 verbatim opener excerpts (first ~6 real dialogue lines) from the
  // highest-scoring booked calls. Strips the "Dialpad Transcript" header and
  // Dialpad metadata rows like "action_item_v2" / "whole_call_summary".
  const METADATA_RE = /^(action_item|ai_csat|call_purpose|whole_call_summary|ner|topic|sentence_level|speaker_turn|summary_fragment|dialpad_transcript)/i;
  const opener_excerpts: string[] = [];
  for (const r of top.slice(0, 3)) {
    const raw = (r.call_logs?.dialpad_transcript as string | null) ?? "";
    if (!raw) continue;
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^dialpad transcript$/i.test(l))
      .filter((l) => {
        const after = l.split(":").slice(1).join(":").trim();
        return after && !METADATA_RE.test(after);
      })
      .slice(0, 6);
    if (lines.length >= 2) {
      const label = r.call_logs?.contacts?.business_name ?? "booked call";
      opener_excerpts.push(`[${label} — score ${r.overall_score}]\n${lines.join("\n")}`);
    }
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { digest: "Winning-patterns AI summary unavailable (no LOVABLE_API_KEY). Use raw NEPQ fundamentals.", opener_excerpts, sample_size: top.length };
  }
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: COACH_MODEL,
        messages: [
          {
            role: "system",
            content: "Summarise winning-call patterns into a tight bullet list. 4 short bullets, one line each, covering: (1) OPENERS that landed, (2) DISCOVERY questions that opened the call up, (3) OBJECTION handling moves that worked, (4) how the BOOKING ASK landed. Use the actual qualities JSON as evidence. No preamble, bullets only.",
          },
          { role: "user", content: JSON.stringify(qualities) },
        ],
      }),
    });
    if (!resp.ok) return { digest: "Fallback: strong openers, at least 3 situation questions, address objection then re-ask, direct booking ask.", opener_excerpts, sample_size: top.length };
    const j = await resp.json().catch(() => null);
    const text = j?.choices?.[0]?.message?.content;
    const digest = typeof text === "string" && text.trim() ? text.trim() : "Fallback digest.";
    return { digest, opener_excerpts, sample_size: top.length };
  } catch {
    return { digest: "Fallback: strong openers, at least 3 situation questions, address objection then re-ask, direct booking ask.", opener_excerpts, sample_size: top.length };
  }
}

// Empirical internal benchmark computed from the last 60 days of call_logs.
// pickup = dialpad_talk_time_seconds >= 15 (past hello); 2min conversation =
// >= 120s. We return two rates: overall (all reps) and "booked-rep on booked-
// day" (the reps who actually booked, on days they booked — their realistic
// ceiling). No absolute industry claims — this is our real number.
async function computeInternalBenchmark(
  adminClient: ReturnType<typeof createClient>,
): Promise<{
  overall_pickup_to_2min_pct: number;
  booked_rep_pickup_to_2min_pct: number;
  sample_size_overall: number;
  sample_size_booked_reps: number;
  window_days: number;
}> {
  const windowDays = 60;
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { data } = await adminClient
    .from("call_logs")
    .select("user_id, outcome, dialpad_talk_time_seconds, created_at")
    .gte("created_at", since)
    .not("dialpad_talk_time_seconds", "is", null)
    .limit(20000);
  const rows = (data ?? []) as Array<{ user_id: string | null; outcome: string | null; dialpad_talk_time_seconds: number | null; created_at: string }>;

  const pickedUp = (r: typeof rows[number]) => (r.dialpad_talk_time_seconds ?? 0) >= 15;
  const twoMin = (r: typeof rows[number]) => (r.dialpad_talk_time_seconds ?? 0) >= 120;

  const overallPicked = rows.filter(pickedUp);
  const overallRate = overallPicked.length === 0 ? 0 : (overallPicked.filter(twoMin).length / overallPicked.length) * 100;

  // "booked-rep on booked-day": rep_user_id + YYYY-MM-DD pairs where that rep
  // booked at least once that day. Their conversation rate on those days is
  // the realistic internal ceiling.
  const bookedKeys = new Set<string>();
  for (const r of rows) {
    if (r.outcome === "booked" && r.user_id) {
      bookedKeys.add(`${r.user_id}|${r.created_at.slice(0, 10)}`);
    }
  }
  const ceilingPool = rows.filter((r) => r.user_id && bookedKeys.has(`${r.user_id}|${r.created_at.slice(0, 10)}`));
  const ceilingPicked = ceilingPool.filter(pickedUp);
  const ceilingRate = ceilingPicked.length === 0 ? 0 : (ceilingPicked.filter(twoMin).length / ceilingPicked.length) * 100;

  return {
    overall_pickup_to_2min_pct: Math.round(overallRate * 10) / 10,
    booked_rep_pickup_to_2min_pct: Math.round(ceilingRate * 10) / 10,
    sample_size_overall: overallPicked.length,
    sample_size_booked_reps: ceilingPicked.length,
    window_days: windowDays,
  };
}

// Lightweight stream classifier used to weight the coaching prompt. Priority:
// re_engagement -> inbound_ad -> cold_email -> cold_follow_up -> cold_first_touch.
async function classifyCallStream(
  adminClient: ReturnType<typeof createClient>,
  row: { id: string; contact_id: string; created_at: string },
  contact: { lead_source?: string | null; client_follow_up_date?: string | null } | null,
): Promise<"re_engagement" | "inbound_ad" | "cold_email" | "cold_follow_up" | "cold_first_touch"> {
  const callTime = new Date(row.created_at).getTime();

  // (a) re_engagement
  const [{ data: noShow }, { data: deals }] = await Promise.all([
    adminClient.from("pipeline_items").select("id, created_at, appointment_outcome").eq("contact_id", row.contact_id).eq("appointment_outcome", "no_show").limit(1),
    adminClient.from("client_deals").select("id, created_at").eq("contact_id", row.contact_id).limit(1),
  ]);
  const priorNoShow = (noShow ?? []).some((n: any) => new Date(n.created_at).getTime() < callTime);
  const priorDeal = (deals ?? []).some((d: any) => new Date(d.created_at).getTime() < callTime);
  if (priorNoShow || priorDeal || contact?.client_follow_up_date) return "re_engagement";

  const src = (contact?.lead_source ?? "").toLowerCase();
  if (src && /(ad|form|website)/.test(src)) return "inbound_ad";
  if (src && /email/.test(src)) return "cold_email";

  // (d) prior answered call on same contact
  const { data: priorCalls } = await adminClient
    .from("call_logs")
    .select("id, created_at, outcome, dialpad_talk_time_seconds")
    .eq("contact_id", row.contact_id)
    .lt("created_at", row.created_at)
    .limit(5);
  const hasPrior = (priorCalls ?? []).some((c: any) => (c.dialpad_talk_time_seconds ?? 0) >= 15 || c.outcome === "follow_up");
  if (hasPrior) return "cold_follow_up";

  return "cold_first_touch";
}

const STREAM_RUBRICS: Record<string, string> = {
  cold_first_touch: "Zero permission. The opener is 90% of the game. Grade booking ask LENIENTLY — if you got blown out in 15s, coach the opener, not the missing ask. Ground the better_path in the WINNING OPENER EXCERPTS below (real cold openers that booked Australian tradies). The generic inbound/closing methodology is a fallback ONLY.",
  cold_follow_up: "We've spoken before. Opener MUST reference the prior conversation. Big mistake = running a cold opener from scratch or clearly not knowing the CRM notes. Grade booking ask MODERATELY.",
  inbound_ad: "They raised their hand. Speed-to-lead and a form/ad-referenced opener are non-negotiable. Big mistakes = generic cold opener and OVER-QUALIFYING. Grade booking ask STRICTLY — short, direct, book them.",
  cold_email: "They replied to our email. Opener references the email. Grade booking ask MODERATE-TO-STRICT.",
  re_engagement: "Warmest non-inbound lead. Opener references specific history, direct 'what happened' question. Grade booking ask STRICTEST — off the phone without a booking or a clear reason = hard flag.",
};

function tryParseJson(raw: string): any | null {
  return tryParseJsonImpl(raw);
}

const FUNNEL_STAGES = ["opener", "resistance", "discovery", "problem_awareness", "gap_build", "ask", "objections", "none"] as const;
const PILLAR_KEYS = ["tonality", "command_of_call", "probing", "word_economy", "objection_handling"] as const;

/** Coerce first_broken_stage + pillar_scores into the exact contract shape. */
function normaliseCoachFields(obj: any): any {
  const stage = String(obj?.first_broken_stage ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  obj.first_broken_stage = (FUNNEL_STAGES as readonly string[]).includes(stage) ? stage : "none";
  const raw = obj?.pillar_scores && typeof obj.pillar_scores === "object" ? obj.pillar_scores : {};
  const scores: Record<string, number | null> = {};
  for (const k of PILLAR_KEYS) {
    const v = Number((raw as any)[k]);
    if (Number.isFinite(v)) scores[k] = Math.min(5, Math.max(1, Math.round(v)));
    else scores[k] = k === "objection_handling" ? null : 3;
  }
  obj.pillar_scores = scores;
  return obj;
}

function tryParseJsonImpl(raw: string): any | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try { return JSON.parse(cleaned); } catch { /* try to salvage */ }
  const m = cleaned.match(/\{[\s\S]*\}$/);
  if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
  return null;
}

async function coachOneCall(params: {
  transcript: string;
  outcome: string;
  businessName: string | null;
  industry: string | null;
  winningDigest: string;
  winningOpenerExcerpts: string[];
  stream: "cold_first_touch" | "cold_follow_up" | "inbound_ad" | "cold_email" | "re_engagement";
  internalBenchmark: {
    overall_pickup_to_2min_pct: number;
    booked_rep_pickup_to_2min_pct: number;
    sample_size_overall: number;
    sample_size_booked_reps: number;
    window_days: number;
  };
}): Promise<any | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;
  const rubric = STREAM_RUBRICS[params.stream] ?? STREAM_RUBRICS.cold_first_touch;
  const bench = params.internalBenchmark;
  const benchLine = `INTERNAL BENCHMARK (last ${bench.window_days} days, our own data — coach toward this ceiling, do NOT invent absolute industry numbers): overall pickup→2min conversation rate = ${bench.overall_pickup_to_2min_pct}% (n=${bench.sample_size_overall}); on days our booking reps booked, their rate = ${bench.booked_rep_pickup_to_2min_pct}% (n=${bench.sample_size_booked_reps}).`;
  const openerBlock = params.winningOpenerExcerpts.length
    ? `WINNING OPENER EXCERPTS — verbatim first ~6 lines from our highest-scoring booked calls (use these as ground truth for cold_first_touch openers):\n\n${params.winningOpenerExcerpts.join("\n\n---\n\n")}`
    : "WINNING OPENER EXCERPTS: none available yet — fall back to methodology.";
  const userPrompt = [
    `OUTCOME: ${params.outcome}`,
    `STREAM: ${params.stream}`,
    `BUSINESS: ${params.businessName ?? "unknown"}${params.industry ? ` (${params.industry})` : ""}`,
    "",
    `STREAM RUBRIC: ${rubric}`,
    "",
    benchLine,
    "",
    openerBlock,
    "",
    "WINNING PATTERNS (what works on booked calls — ground better_path in these):",
    params.winningDigest,
    "",
    "TRANSCRIPT:",
    params.transcript,
  ].join("\n");
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: COACH_MODEL,
        messages: [
          { role: "system", content: COACH_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[coach_calls] Gateway ${resp.status}: ${body.slice(0, 400)}`);
      return null;
    }
    const j = await resp.json().catch(() => null);
    const content = j?.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const parsed = tryParseJson(content);
    if (!parsed || typeof parsed !== "object") return null;
    // Minimal shape check — at least a key_moment + better_path.
    if (!parsed.key_moment || !parsed.better_path) return null;
    normaliseCoachFields(parsed);
    return parsed;
  } catch (err) {
    console.error("[coach_calls] coachOneCall failed:", err);
    return null;
  }
}

async function rebuildRepCoachingProfile(params: {
  adminClient: ReturnType<typeof createClient>;
  userId: string;
  windowDays?: number;
}): Promise<{ ok: boolean; calls: number; reason?: string }> {
  const windowDays = params.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { data: rows, error } = await params.adminClient
    .from("call_coaching")
    .select("call_log_id, outcome, coaching, created_at, contacts:contacts(business_name, industry)")
    .eq("user_id", params.userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) return { ok: false, calls: 0, reason: error.message };
  const notes = rows ?? [];
  if (notes.length === 0) return { ok: true, calls: 0, reason: "no_coaching_rows" };

  const digest = notes.map((r: any) => ({
    business: r.contacts?.business_name ?? null,
    industry: r.contacts?.industry ?? null,
    outcome: r.outcome,
    skill_tag: r.coaching?.skill_tag ?? null,
    what_happened: r.coaching?.what_happened ?? null,
    key_moment: r.coaching?.key_moment ?? null,
    better_path: r.coaching?.better_path ?? null,
    went_well: r.coaching?.went_well ?? null,
  }));

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  let profile: { focus_areas: any[]; strengths: any[] } = { focus_areas: [], strengths: [] };
  if (LOVABLE_API_KEY) {
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: COACH_MODEL,
          messages: [
            { role: "system", content: REP_PROFILE_SYSTEM_PROMPT },
            { role: "user", content: `Recent coaching notes for this rep (last ${windowDays} days, ${digest.length} calls):\n\n${JSON.stringify(digest)}` },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (resp.ok) {
        const j = await resp.json().catch(() => null);
        const content = j?.choices?.[0]?.message?.content;
        const parsed = tryParseJson(typeof content === "string" ? content : "");
        if (parsed && typeof parsed === "object") {
          profile = {
            focus_areas: Array.isArray(parsed.focus_areas) ? parsed.focus_areas.slice(0, 3) : [],
            strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 2) : [],
          };
        }
      } else {
        const body = await resp.text().catch(() => "");
        console.error(`[coach_calls] profile ${resp.status}: ${body.slice(0, 300)}`);
      }
    } catch (err) {
      console.error("[coach_calls] rebuildRepCoachingProfile failed:", err);
    }
  }

  const { error: upErr } = await params.adminClient
    .from("rep_coaching_profile")
    .upsert({
      user_id: params.userId,
      focus_areas: profile.focus_areas,
      strengths: profile.strengths,
      calls_analyzed: notes.length,
      window_days: windowDays,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  if (upErr) return { ok: false, calls: notes.length, reason: upErr.message };
  return { ok: true, calls: notes.length };
}

async function coachCalls(params: {
  adminClient: ReturnType<typeof createClient>;
  limit?: number;
}) {
  const cap = Math.min(Math.max(params.limit ?? 15, 1), 30);
  if (!Deno.env.get("LOVABLE_API_KEY")) {
    return { ok: false as const, reason: "no_lovable_api_key" };
  }

  // Coach has its OWN budget lane so booked_call_scoring hitting its cap
  // doesn't silently starve coaching (that regression froze coaching from
  // 24 Jul onward). Default cap 100 coach ops/day.
  const budget = await loadBookedScoringBudget(params.adminClient, { kind: "coach_calls", defaultCap: 100 });
  if (budget.remaining <= 0) {
    return {
      ok: true as const,
      coached: 0,
      considered: 0,
      profiles_rebuilt: 0,
      reason: "daily_cap_reached" as const,
      budget: { daily_cap: budget.dailyCap, used_today: budget.usedToday, remaining: 0 },
    };
  }

  // Eligibility: transcript >200 chars, allowed outcome, no existing coaching row.
  // We fetch a wider pool then filter out any call_log_ids that already have a
  // call_coaching row (LEFT JOIN via a second query — cheaper than a NOT IN
  // subquery on a growing table).
  const { data: candidates, error } = await params.adminClient
    .from("call_logs")
    .select("id, contact_id, user_id, outcome, dialpad_transcript, created_at, contacts:contacts(business_name, industry, lead_source, client_follow_up_date)")
    .in("outcome", ["booked", "not_interested", "follow_up", "dnc", "gatekeeper"])
    .not("dialpad_transcript", "is", null)
    .order("created_at", { ascending: true })
    .limit(cap * 8);
  if (error) return { ok: false as const, reason: error.message };
  const pool = (candidates ?? []).filter((r: any) => typeof r.dialpad_transcript === "string" && r.dialpad_transcript.length > 200);
  if (pool.length === 0) {
    return { ok: true as const, coached: 0, considered: 0, profiles_rebuilt: 0, reason: "no_candidates" as const, budget: { daily_cap: budget.dailyCap, used_today: budget.usedToday, remaining: budget.remaining } };
  }
  const ids = pool.map((r: any) => r.id);
  const { data: existing } = await params.adminClient
    .from("call_coaching")
    .select("call_log_id")
    .in("call_log_id", ids);
  const already = new Set((existing ?? []).map((r: any) => r.call_log_id));
  const eligible = pool.filter((r: any) => !already.has(r.id)).slice(0, cap);

  if (eligible.length === 0) {
    return { ok: true as const, coached: 0, considered: 0, profiles_rebuilt: 0, reason: "backlog_empty" as const, budget: { daily_cap: budget.dailyCap, used_today: budget.usedToday, remaining: budget.remaining } };
  }

  // ONE winning-patterns digest per run (1 AI call).
  if (!budget.reserve()) {
    return { ok: true as const, coached: 0, considered: 0, profiles_rebuilt: 0, reason: "budget_too_low_for_digest" as const, budget: { daily_cap: budget.dailyCap, used_today: budget.usedToday, remaining: budget.remaining } };
  }
  const { digest, opener_excerpts, sample_size: digestSampleSize } = await buildWinningPatternsDigest(params.adminClient);
  const internalBenchmark = await computeInternalBenchmark(params.adminClient);

  const coached: Array<{ call_log_id: string; user_id: string; business_name: string | null; outcome: string; skill_tag: string | null }> = [];
  const errors: string[] = [];
  const affectedUsers = new Set<string>();
  let considered = 0;

  for (const row of eligible) {
    if (budget.made() >= budget.remaining) break;
    if (!budget.reserve()) break;
    considered++;
    const stream = await classifyCallStream(
      params.adminClient,
      { id: (row as any).id, contact_id: (row as any).contact_id, created_at: (row as any).created_at },
      (row as any).contacts ?? null,
    );
    const coaching = await coachOneCall({
      transcript: (row as any).dialpad_transcript,
      outcome: (row as any).outcome,
      businessName: (row as any).contacts?.business_name ?? null,
      industry: (row as any).contacts?.industry ?? null,
      winningDigest: digest,
      winningOpenerExcerpts: opener_excerpts,
      stream,
      internalBenchmark,
    });
    if (!coaching) {
      errors.push(`call_log ${(row as any).id}: coaching AI failed`);
      continue;
    }
    // Force the stream field from code — don't let the AI guess.
    coaching.stream = stream;
    const { error: insErr } = await params.adminClient
      .from("call_coaching")
      .insert({
        call_log_id: (row as any).id,
        contact_id: (row as any).contact_id,
        user_id: (row as any).user_id,
        outcome: (row as any).outcome,
        coaching,
        model: COACH_MODEL,
      });
    if (insErr) {
      errors.push(`call_log ${(row as any).id}: insert failed: ${insErr.message}`);
      continue;
    }
    if ((row as any).user_id) affectedUsers.add((row as any).user_id);
    coached.push({
      call_log_id: (row as any).id,
      user_id: (row as any).user_id,
      business_name: (row as any).contacts?.business_name ?? null,
      outcome: (row as any).outcome,
      skill_tag: coaching.skill_tag ?? null,
    });
  }

  // Rebuild rep_coaching_profile per affected user (1 AI call each).
  const profileResults: Array<{ user_id: string; calls: number; ok: boolean; reason?: string }> = [];
  for (const uid of affectedUsers) {
    if (budget.made() >= budget.remaining) {
      profileResults.push({ user_id: uid, calls: 0, ok: false, reason: "budget_exhausted" });
      continue;
    }
    if (!budget.reserve()) break;
    const res = await rebuildRepCoachingProfile({ adminClient: params.adminClient, userId: uid });
    profileResults.push({ user_id: uid, ...res });
  }

  await budget.persist();

  return {
    ok: true as const,
    considered,
    coached: coached.length,
    profiles_rebuilt: profileResults.filter((p) => p.ok).length,
    winning_digest_sample_size: digestSampleSize,
    winning_digest_preview: digest.slice(0, 400),
    winning_opener_excerpts_count: opener_excerpts.length,
    internal_benchmark: internalBenchmark,
    results: coached,
    profiles: profileResults,
    errors: errors.slice(0, 10),
    budget: {
      daily_cap: budget.dailyCap,
      used_today: budget.usedToday + budget.made(),
      remaining: Math.max(0, budget.remaining - budget.made()),
    },
  };
}


// One-off backfill: correct EXISTING booked-call transcripts using the same
// correction lane. For each candidate we (a) read raw transcript from
// dialpad_calls, (b) run correctTranscript against it, (c) if it changed
// materially, write to call_logs.dialpad_transcript AND delete any existing
// call_scores row so the next scoreBookedCalls pass re-scores against the
// corrected text. Raw stays untouched in dialpad_calls.transcript.
async function backfillCorrectBookedTranscripts(params: {
  adminClient: ReturnType<typeof createClient>;
  limit: number;
  rescore: boolean;
}) {
  if (!Deno.env.get("LOVABLE_API_KEY")) {
    return { ok: false as const, reason: "no_lovable_api_key" };
  }
  const budget = await loadBookedScoringBudget(params.adminClient);
  if (budget.remaining <= 0) {
    return {
      ok: true as const,
      considered: 0,
      corrected: 0,
      unchanged: 0,
      reason: "daily_cap_reached" as const,
      budget: { daily_cap: budget.dailyCap, used_today: budget.usedToday, remaining: 0 },
    };
  }

  const cap = Math.min(Math.max(params.limit, 1), 100);
  const { data: candidates, error } = await params.adminClient
    .from("call_logs")
    .select(`
      id,
      user_id,
      dialpad_transcript,
      contacts:contacts (business_name, dm_name),
      dialpad_calls:dialpad_calls!dialpad_calls_call_log_id_fkey (
        id,
        transcript
      )
    `)
    .eq("outcome", "booked")
    .order("created_at", { ascending: false })
    .limit(Math.max(cap * 4, 60));
  if (error) return { ok: false as const, reason: error.message };

  const repNameMap = await loadRepDisplayNames(
    params.adminClient,
    (candidates ?? []).map((r: any) => r.user_id).filter(Boolean),
  );
  const allRepNames = Array.from(new Set(repNameMap.values()));

  const samples: Array<{ call_log_id: string; business_name: string | null; before: string; after: string }> = [];
  const rescoredIds: string[] = [];
  const errors: string[] = [];
  let considered = 0;
  let correctedCount = 0;
  let unchangedCount = 0;

  for (const row of candidates ?? []) {
    if (correctedCount >= cap) break;
    if (budget.made() >= budget.remaining) break;
    const dpRaw = (row as any).dialpad_calls;
    const dpArr = Array.isArray(dpRaw) ? dpRaw : dpRaw ? [dpRaw] : [];
    const dp = dpArr.find((d: any) => d?.transcript && String(d.transcript).trim().length >= 40);
    if (!dp) continue;
    const rawTranscript = String(dp.transcript);
    const existingCallLogTranscript = typeof (row as any).dialpad_transcript === "string" ? (row as any).dialpad_transcript : null;
    // Already corrected on a previous pass — call_logs no longer matches raw.
    if (existingCallLogTranscript && existingCallLogTranscript.trim() && existingCallLogTranscript !== rawTranscript) {
      unchangedCount++;
      continue;
    }
    considered++;

    const businessName = (row as any).contacts?.business_name ?? null;
    const dmName = (row as any).contacts?.dm_name ?? null;
    const repName = repNameMap.get((row as any).user_id) ?? null;
    const repNamesForCall = Array.from(new Set([repName, ...allRepNames].filter((s): s is string => Boolean(s))));

    if (!budget.reserve()) break;
    const corrected = await correctTranscript({
      transcript: rawTranscript,
      businessName,
      dmName,
      repNames: repNamesForCall,
    });
    if (!corrected || !transcriptChangedMaterially(rawTranscript, corrected)) {
      unchangedCount++;
      continue;
    }

    const { error: updErr } = await params.adminClient
      .from("call_logs")
      .update({ dialpad_transcript: corrected })
      .eq("id", (row as any).id);
    if (updErr) {
      errors.push(`call_log ${row.id}: persist failed: ${updErr.message}`);
      continue;
    }
    correctedCount++;

    // Grab a compact before/after line sample for the report — pick the first
    // line that actually changed so the diff is meaningful.
    if (samples.length < 3) {
      const beforeLines = rawTranscript.split(/\r?\n/);
      const afterLines = corrected.split(/\r?\n/);
      const maxLen = Math.min(beforeLines.length, afterLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (beforeLines[i] !== afterLines[i] && beforeLines[i].trim().length > 8) {
          samples.push({
            call_log_id: (row as any).id,
            business_name: businessName,
            before: beforeLines[i].slice(0, 300),
            after: afterLines[i].slice(0, 300),
          });
          break;
        }
      }
    }

    if (params.rescore) {
      // Delete existing call_scores row so scoreBookedCalls will rescore this
      // call against the corrected transcript on its next pass.
      const { error: delErr } = await params.adminClient
        .from("call_scores")
        .delete()
        .eq("call_log_id", (row as any).id);
      if (delErr) {
        errors.push(`call_log ${row.id}: rescore reset failed: ${delErr.message}`);
      } else {
        rescoredIds.push((row as any).id);
      }
    }
  }

  await budget.persist();

  return {
    ok: true as const,
    considered,
    corrected: correctedCount,
    unchanged: unchangedCount,
    rescore_reset: rescoredIds.length,
    samples,
    errors: errors.slice(0, 10),
    budget: {
      daily_cap: budget.dailyCap,
      used_today: budget.usedToday + budget.made(),
      remaining: Math.max(0, budget.remaining - budget.made()),
    },
  };
}


async function processPendingTranscriptSyncs(params: {
  adminClient: ReturnType<typeof createClient>;
  apiKey: string;
  limit?: number;
}) {
  if (!params.apiKey) {
    // Safe no-op until DIALPAD_API_KEY is configured. Prevents crashes on the
    // scheduled cron path before the real Dialpad key is available.
    return { processed: 0, synced: 0, failed: 0, skipped: 0, errors: [] as string[], reason: "DIALPAD_API_KEY not configured" };
  }
  // Extract-then-apply pipeline runs opportunistically after each successful
  // transcript sync (see runTranscriptExtractionPipeline). The pipeline itself
  // no-ops when LOVABLE_API_KEY is missing, so the outer loop stays healthy.
  const limit = coerceBoundedLimit(params.limit, 25, 1, 100);
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();

  const { data: retryableRows, error: retryableError } = await params.adminClient
    .from("dialpad_calls")
    .select("id, dialpad_call_id, sync_status, call_state, created_at, updated_at")
    .in("sync_status", ["processing", "failed"])
    .is("transcript_synced_at", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (retryableError) throw retryableError;

  const remainingLimit = Math.max(0, limit - (retryableRows?.length ?? 0));
  let stalePendingRows: typeof retryableRows = [];

  if (remainingLimit > 0) {
    const { data: pendingRows, error: pendingError } = await params.adminClient
      .from("dialpad_calls")
      .select("id, dialpad_call_id, sync_status, call_state, created_at, updated_at")
      .eq("sync_status", "pending")
      .is("transcript_synced_at", null)
      .lte("created_at", staleBefore)
      .order("updated_at", { ascending: true })
      .limit(remainingLimit);

    if (pendingError) throw pendingError;
    stalePendingRows = pendingRows ?? [];
  }

  const seenIds = new Set<string>();
  const candidates = [...(retryableRows ?? []), ...(stalePendingRows ?? [])].filter((row) => {
    if (seenIds.has(row.id)) return false;
    seenIds.add(row.id);
    return true;
  });

  if (candidates.length === 0) {
    return { processed: 0, synced: 0, failed: 0, skipped: 0, errors: [] as string[] };
  }

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    if (!candidate.dialpad_call_id) {
      await params.adminClient
        .from("dialpad_calls")
        .update({
          sync_status: "failed",
          sync_error: "Missing dialpad_call_id for transcript retry",
        })
        .eq("id", candidate.id);
      failed += 1;
      errors.push(`${candidate.id}: missing dialpad_call_id`);
      continue;
    }

    const retryState = "hangup";

    try {
      const result = await syncWebhookPayload({
        adminClient: params.adminClient,
        apiKey: params.apiKey,
        payload: {
          call_id: candidate.dialpad_call_id,
          state: retryState,
        },
      });

      if (result.ignored) {
        const reason = typeof result.reason === "string" ? result.reason : "Transcript sync ignored";
        await params.adminClient
          .from("dialpad_calls")
          .update({
            sync_status: "failed",
            sync_error: reason,
          })
          .eq("id", candidate.id);
        failed += 1;
        errors.push(`${candidate.dialpad_call_id}: ${reason}`);
        continue;
      }

      if (result.sync_status === "synced") {
        synced += 1;
        continue;
      }

      const reason = typeof result.sync_status === "string"
        ? `Transcript retry left row in ${result.sync_status}`
        : "Transcript retry did not reach synced state";

      await params.adminClient
        .from("dialpad_calls")
        .update({
          sync_status: "failed",
          sync_error: reason,
        })
        .eq("id", candidate.id);

      failed += 1;
      skipped += 1;
      errors.push(`${candidate.dialpad_call_id}: ${reason}`);
    } catch (syncError) {
      const reason = syncError instanceof Error ? syncError.message : "Transcript sync retry failed";
      await params.adminClient
        .from("dialpad_calls")
        .update({
          sync_status: "failed",
          sync_error: reason,
        })
        .eq("id", candidate.id);
      failed += 1;
      errors.push(`${candidate.dialpad_call_id}: ${reason}`);
    }
  }

  return {
    processed: candidates.length,
    synced,
    failed,
    skipped,
    errors,
  };
}

// ── Process AI Summary and Push to GHL ──────────────────────────────────
function buildObjectionEventNote(objection: {
  objection_type?: string;
  prospect_wording?: string;
  rep_response?: string;
  outcome?: string;
  coaching_verdict?: string;
  coaching_note?: string;
  evidence?: string[];
  drill_candidate?: boolean;
  linked_module?: string;
}) {
  const lines = ["Training Objection Event"];

  if (objection.objection_type) lines.push(`- Objection: ${objection.objection_type}`);
  if (objection.prospect_wording) lines.push(`- Prospect wording: ${objection.prospect_wording}`);
  if (objection.rep_response) lines.push(`- Rep response: ${objection.rep_response}`);
  if (objection.outcome) lines.push(`- Outcome: ${objection.outcome}`);
  if (objection.coaching_verdict) lines.push(`- Coaching verdict: ${objection.coaching_verdict}`);
  if (objection.coaching_note) lines.push(`- Coaching note: ${objection.coaching_note}`);
  if (objection.linked_module) lines.push(`- Linked module: ${objection.linked_module}`);
  if (typeof objection.drill_candidate === "boolean") lines.push(`- Drill candidate: ${objection.drill_candidate ? "yes" : "no"}`);
  if (Array.isArray(objection.evidence) && objection.evidence.length > 0) {
    lines.push("- Evidence:");
    for (const item of objection.evidence) {
      if (typeof item === "string" && item.trim()) lines.push(`  • ${item.trim()}`);
    }
  }

  return lines.join("\n");
}

async function processAiSummaryAndPushToGhl(params: {
  adminClient: ReturnType<typeof createClient>;
  contactId: string;
  userId: string;
  dialpadCallId: string;
  transcript: string;
  phoneNumber?: string;
  callDurationSeconds?: number | null;
  callDate?: string | null;
}) {
  const GHL_API_KEY = Deno.env.get("GHL_API_KEY");
  if (!GHL_API_KEY) {
    console.warn("[AI→GHL] GHL_API_KEY not configured — skipping GHL push");
  }

  // Look up rep name from profiles
  const { data: profile } = await params.adminClient
    .from("profiles")
    .select("display_name, email")
    .eq("user_id", params.userId)
    .maybeSingle();

  const repName = profile?.display_name ?? profile?.email?.split("@")[0] ?? "Unknown";

  // Generate AI summary
  const aiResult = await generateAiSummary({
    transcript: params.transcript,
    repName,
    phoneNumber: params.phoneNumber,
    callDurationSeconds: params.callDurationSeconds,
    callDate: params.callDate,
  });

  if (!aiResult) {
    console.warn("[AI→GHL] AI summary generation failed — skipping");
    return { aiGenerated: false, ghlNotePushed: false, ghlFieldsPushed: false };
  }

  // Save AI summary to contact_notes in Supabase
  if (aiResult.note) {
    await upsertContactNote(params.adminClient, {
      contactId: params.contactId,
      createdBy: params.userId,
      dialpadCallId: params.dialpadCallId,
      source: "dialpad_summary",
      content: aiResult.note,
    }).catch((err: unknown) => {
      console.error("[AI→GHL] Failed to save AI note to Supabase:", err);
    });
  }

  if (Array.isArray(aiResult.objections)) {
    for (let index = 0; index < aiResult.objections.length; index += 1) {
      const objection = aiResult.objections[index];
      if (!objection || typeof objection !== "object") continue;
      const objectionType = typeof objection.objection_type === "string" ? objection.objection_type.trim() : "";
      const coachingNote = typeof objection.coaching_note === "string" ? objection.coaching_note.trim() : "";
      if (!objectionType && !coachingNote) continue;

      await upsertContactNote(params.adminClient, {
        contactId: params.contactId,
        createdBy: params.userId,
        dialpadCallId: `${params.dialpadCallId}:objection:${index + 1}`,
        source: "dialpad_training_objection",
        content: buildObjectionEventNote(objection),
      }).catch((err: unknown) => {
        console.error("[AI→GHL] Failed to save objection event note to Supabase:", err);
      });
    }
  }

  // Look up ghl_contact_id from contacts table
  const { data: contact } = await params.adminClient
    .from("contacts")
    .select("ghl_contact_id, phone")
    .eq("id", params.contactId)
    .maybeSingle();

  let ghlContactId = contact?.ghl_contact_id;
  let ghlNotePushed = false;
  let ghlFieldsPushed = false;

  if (ghlContactId && GHL_API_KEY) {
    // Push the formatted note to GHL
    if (aiResult.note) {
      ghlNotePushed = await pushNoteToGhl({
        ghlApiKey: GHL_API_KEY,
        ghlContactId,
        noteBody: aiResult.note,
      });
    }

    // Push structured fields to GHL custom fields
    if (aiResult.fields && Object.keys(aiResult.fields).length > 0) {
      // Fetch existing custom fields for append logic
      const existingCustomFields = await fetchGhlContactCustomFields(GHL_API_KEY, ghlContactId);

      ghlFieldsPushed = await pushFieldsToGhl({
        ghlApiKey: GHL_API_KEY,
        ghlContactId,
        fields: aiResult.fields,
        existingCustomFields: existingCustomFields ?? undefined,
      });
    }
  } else if (!ghlContactId && GHL_API_KEY) {
    try {
      ghlContactId = await attemptAutoLinkGhlContact({
        adminClient: params.adminClient,
        contactId: params.contactId,
        ghlApiKey: GHL_API_KEY,
        phone: contact?.phone,
      });

      if (ghlContactId) {
        if (aiResult.note) {
          ghlNotePushed = await pushNoteToGhl({
            ghlApiKey: GHL_API_KEY,
            ghlContactId,
            noteBody: aiResult.note,
          });
        }

        if (aiResult.fields && Object.keys(aiResult.fields).length > 0) {
          const existingCustomFields = await fetchGhlContactCustomFields(GHL_API_KEY, ghlContactId);
          ghlFieldsPushed = await pushFieldsToGhl({
            ghlApiKey: GHL_API_KEY,
            ghlContactId,
            fields: aiResult.fields,
            existingCustomFields: existingCustomFields ?? undefined,
          });
        }
      } else if (contact?.phone) {
        await enqueuePendingGhlPush({
          adminClient: params.adminClient,
          contactId: params.contactId,
          dialpadCallId: params.dialpadCallId,
          userId: params.userId,
          aiNote: aiResult.note ?? null,
          aiFields: aiResult.fields ?? {},
          lastError: "No GHL contact found during auto-link",
        });
      } else {
        console.log(`[AI→GHL] No ghl_contact_id for contact ${params.contactId} — queued for retry (no location ID or phone)`);
        await enqueuePendingGhlPush({
          adminClient: params.adminClient,
          contactId: params.contactId,
          dialpadCallId: params.dialpadCallId,
          userId: params.userId,
          aiNote: aiResult.note ?? null,
          aiFields: aiResult.fields ?? {},
          lastError: "Missing ghl_contact_id and auto-link prerequisites",
        });
      }
    } catch (linkErr) {
      console.error(`[AI→GHL] Auto-link attempt failed:`, linkErr);
      await enqueuePendingGhlPush({
        adminClient: params.adminClient,
        contactId: params.contactId,
        dialpadCallId: params.dialpadCallId,
        userId: params.userId,
        aiNote: aiResult.note ?? null,
        aiFields: aiResult.fields ?? {},
        lastError: linkErr instanceof Error ? linkErr.message : "Auto-link failed",
      });
    }
  }

  return { aiGenerated: true, ghlNotePushed, ghlFieldsPushed, fieldsExtracted: Object.keys(aiResult.fields ?? {}).length };
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

// ── Recording helpers ────────────────────────────────────────────────
// Extracts the first available recording reference from a Dialpad /call/{id}
// payload. Prefers `recording_details[]` (typed + id) and falls back to the
// legacy `admin_recording_urls[]` string array.
function pickDialpadRecording(call: unknown): { id: string | null; type: string; url: string } | null {
  if (!isRecord(call)) return null;
  const details = (call as JsonRecord).recording_details;
  if (Array.isArray(details) && details.length > 0) {
    const first = details[0];
    if (isRecord(first)) {
      const url = typeof first.url === "string" ? first.url : null;
      if (url) {
        return {
          id: typeof first.id === "string" ? first.id : String(first.id ?? "") || null,
          type: typeof first.recording_type === "string" ? first.recording_type : "admincallrecording",
          url,
        };
      }
    }
  }
  const admin = (call as JsonRecord).admin_recording_urls;
  if (Array.isArray(admin) && admin.length > 0 && typeof admin[0] === "string") {
    // Blob URL of shape https://dialpad.com/blob/adminrecording/<id>.mp3
    const url = admin[0] as string;
    const m = url.match(/\/blob\/[^/]+\/(\d+)\.mp3/);
    return { id: m?.[1] ?? null, type: "admincallrecording", url };
  }
  return null;
}

// Creates a public recording share link via Dialpad's Recording Share Link API.
// `privacy: "public"` returns a URL that redirects to a signed blob (audio/mpeg),
// suitable for direct <audio src="…"> playback in our app.
async function createDialpadRecordingShareLink(params: {
  apiKey: string;
  recordingId: string;
  recordingType?: string;
  privacy?: "public" | "company" | "owner" | "admin";
}): Promise<{ ok: true; id: string; access_link: string } | { ok: false; status: number; error: string }> {
  const body = {
    recording_id: params.recordingId,
    recording_type: params.recordingType || "admincallrecording",
    privacy: params.privacy || "public",
  };
  const res = await fetch(`${DIALPAD_BASE}/recordingsharelink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  }
  try {
    const parsed = JSON.parse(text);
    const link = typeof parsed.access_link === "string" ? parsed.access_link : null;
    const id = typeof parsed.id === "string" ? parsed.id : null;
    if (!link) return { ok: false, status: 502, error: "Missing access_link in response" };
    return { ok: true, id: id ?? "", access_link: link };
  } catch (err) {
    return { ok: false, status: 502, error: `Parse error: ${err instanceof Error ? err.message : err}` };
  }
}

// Backfills recording_id/recording_type/recording_url on existing dialpad_calls
// rows by re-fetching the Dialpad /call/{id} payload. NO AI is invoked.
async function backfillDialpadRecordings(params: {
  adminClient: ReturnType<typeof createClient>;
  apiKey: string;
  limit: number;
  minTalk: number;
}) {
  const { adminClient, apiKey, limit, minTalk } = params;
  const { data: rows, error } = await adminClient
    .from("dialpad_calls")
    .select("id, dialpad_call_id, talk_time_seconds")
    .is("recording_id", null)
    .gte("talk_time_seconds", minTalk)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) return { ok: false as const, error: error.message };
  const list = rows ?? [];
  let checked = 0;
  let updated = 0;
  const errors: string[] = [];
  const CONCURRENCY = 6;
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const cur = list[idx++];
      checked += 1;
      try {
        const detail = await fetchDialpadCallInfo(String(cur.dialpad_call_id), apiKey);
        const rec = pickDialpadRecording(detail);
        if (!rec) continue;
        const { error: upErr } = await adminClient
          .from("dialpad_calls")
          .update({
            recording_id: rec.id,
            recording_type: rec.type,
            recording_url: rec.url,
          })
          .eq("id", cur.id);
        if (upErr) {
          errors.push(`${cur.dialpad_call_id}: ${upErr.message}`);
        } else {
          updated += 1;
        }
      } catch (err) {
        errors.push(`${cur.dialpad_call_id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()));
  return { ok: true as const, considered: list.length, checked, updated, errors: errors.slice(0, 20) };
}

// ── Webhook + subscription registration (idempotent) ──────────────────
// Creates (or reuses) a Dialpad webhook pointed at our edge function URL and
// binds a call-event subscription to it so lifecycle events (connected +
// hangup) fire to us. Safe to re-run: matches by hook_url on the webhook and
// by webhook_id on the subscription.
async function registerDialpadWebhook(params: { apiKey: string; hookUrl: string; secret: string; force?: boolean }) {
  const { apiKey, hookUrl, secret, force = false } = params;
  const authHeaders = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // Helper: paginated list of a Dialpad collection endpoint.
  async function listAll(path: string): Promise<JsonRecord[]> {
    const out: JsonRecord[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const url = new URL(`${DIALPAD_BASE}${path}`);
      url.searchParams.set("limit", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url.toString(), { headers: authHeaders });
      const text = await res.text();
      if (!res.ok) throw new Error(`${path} ${res.status}: ${text}`);
      const parsed = JSON.parse(text);
      const items: unknown[] = Array.isArray(parsed?.items) ? parsed.items
        : Array.isArray(parsed) ? parsed : [];
      for (const it of items) if (isRecord(it)) out.push(it as JsonRecord);
      cursor = typeof parsed?.cursor === "string" && parsed.cursor ? parsed.cursor : null;
      if (!cursor) break;
    }
    return out;
  }

  const diagnostics: { deleted_subscriptions: (string | number)[]; deleted_webhooks: (string | number)[] } = {
    deleted_subscriptions: [],
    deleted_webhooks: [],
  };

  // Discover office_id via /offices (company-scoped API keys have no /users/me).
  // Prefer is_primary_office=true, else the first office returned.
  let officeId: number | string | null = null;
  try {
    const officesRes = await fetch(`${DIALPAD_BASE}/offices?limit=100`, { headers: authHeaders });
    const officesText = await officesRes.text();
    if (officesRes.ok) {
      const parsed = JSON.parse(officesText);
      const items: unknown[] = Array.isArray(parsed?.items) ? parsed.items
        : Array.isArray(parsed) ? parsed
        : [];
      let primary: JsonRecord | null = null;
      let first: JsonRecord | null = null;
      for (const item of items) {
        if (!isRecord(item)) continue;
        const rec = item as JsonRecord;
        if (!first) first = rec;
        if (rec.is_primary_office === true && !primary) primary = rec;
      }
      const chosen = primary ?? first;
      const oid = chosen ? chosen.id : null;
      if (typeof oid === "string" || typeof oid === "number") officeId = oid;
    }
  } catch { /* ignore */ }

  const listWebhooks = await fetch(`${DIALPAD_BASE}/webhooks?limit=100`, { headers: authHeaders });
  const listWebhooksText = await listWebhooks.text();
  if (!listWebhooks.ok) {
    return { ok: false, stage: "list_webhooks", status: listWebhooks.status, error: listWebhooksText };
  }
  let existingWebhookId: number | string | null = null;
  const matchingWebhookIds: (number | string)[] = [];
  try {
    const parsed = JSON.parse(listWebhooksText);
    const items: unknown[] = Array.isArray(parsed?.items) ? parsed.items
      : Array.isArray(parsed) ? parsed
      : [];
    for (const item of items) {
      if (isRecord(item) && typeof item.hook_url === "string" && item.hook_url === hookUrl) {
        const id = (item as JsonRecord).id;
        if (typeof id === "string" || typeof id === "number") {
          matchingWebhookIds.push(id);
          if (existingWebhookId === null) existingWebhookId = id;
        }
      }
    }
  } catch { /* ignore parse errors, will create new */ }

  // Force mode: purge every subscription bound to our webhook(s), then the
  // webhook(s) themselves, and rebuild from scratch. Used when the previous
  // registration is silently not delivering events.
  if (force && matchingWebhookIds.length > 0) {
    try {
      const allSubs = await listAll("/subscriptions/call");
      const wanted = new Set(matchingWebhookIds.map(String));
      for (const sub of allSubs) {
        const bound = sub.webhook_id ?? (isRecord(sub.webhook) ? (sub.webhook as JsonRecord).id : null);
        if (bound !== null && bound !== undefined && wanted.has(String(bound))) {
          const subId = sub.id;
          if (typeof subId === "string" || typeof subId === "number") {
            const del = await fetch(`${DIALPAD_BASE}/subscriptions/call/${subId}`, {
              method: "DELETE",
              headers: authHeaders,
            });
            await del.text();
            if (del.ok) diagnostics.deleted_subscriptions.push(subId);
          }
        }
      }
    } catch { /* continue — best-effort cleanup */ }

    for (const wid of matchingWebhookIds) {
      const del = await fetch(`${DIALPAD_BASE}/webhooks/${wid}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      await del.text();
      if (del.ok) diagnostics.deleted_webhooks.push(wid);
    }
    existingWebhookId = null;
  }

  let webhookId = existingWebhookId;
  if (!webhookId) {
    const createHook = await fetch(`${DIALPAD_BASE}/webhooks`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ hook_url: hookUrl, secret }),
    });
    const createHookText = await createHook.text();
    if (!createHook.ok) {
      return { ok: false, stage: "create_webhook", status: createHook.status, error: createHookText };
    }
    try {
      const parsed = JSON.parse(createHookText);
      const id = isRecord(parsed) ? (parsed as JsonRecord).id : null;
      if (typeof id === "string" || typeof id === "number") webhookId = id;
    } catch { /* fall through */ }
    if (!webhookId) {
      return { ok: false, stage: "create_webhook_parse", status: 500, error: createHookText };
    }
  }

  // Look for an existing call-event subscription bound to this webhook.
  const listSubs = await fetch(`${DIALPAD_BASE}/subscriptions/call?limit=100`, { headers: authHeaders });
  const listSubsText = await listSubs.text();
  if (!listSubs.ok) {
    return {
      ok: false,
      stage: "list_subscriptions",
      status: listSubs.status,
      error: listSubsText,
      webhook_id: webhookId,
    };
  }
  let existingSubId: number | string | null = null;
  try {
    const parsed = JSON.parse(listSubsText);
    const items: unknown[] = Array.isArray(parsed?.items) ? parsed.items
      : Array.isArray(parsed) ? parsed
      : [];
    for (const item of items) {
      if (!isRecord(item)) continue;
      const rec = item as JsonRecord;
      const subWebhookId = rec.webhook_id ?? (isRecord(rec.webhook) ? (rec.webhook as JsonRecord).id : null);
      if (String(subWebhookId) === String(webhookId)) {
        const id = rec.id;
        if (typeof id === "string" || typeof id === "number") existingSubId = id;
        break;
      }
    }
  } catch { /* ignore */ }

  let subscriptionId = existingSubId;
  if (!subscriptionId) {
    // The Dialpad Create schema is `endpoint_id`; older docs used `webhook_id`.
    // Send both so it works on either revision. When we know the office, scope
    // the subscription to it so events are delivered for every rep on the
    // company — without an explicit target the subscription silently defaults
    // to the API key owner's own calls only, which is the "registered but not
    // delivering" symptom we saw with the July 8 subscription.
    const subBody: JsonRecord = {
      endpoint_id: webhookId,
      webhook_id: webhookId,
      enabled: true,
      group_calls_only: false,
      call_states: ["connected", "hangup"],
    };
    if (officeId !== null) {
      subBody.target_type = "office";
      subBody.target_id = officeId;
    }
    const createSub = await fetch(`${DIALPAD_BASE}/subscriptions/call`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(subBody),
    });
    const createSubText = await createSub.text();
    if (!createSub.ok) {
      return {
        ok: false,
        stage: "create_subscription",
        status: createSub.status,
        error: createSubText,
        webhook_id: webhookId,
        office_id: officeId,
        diagnostics,
      };
    }
    try {
      const parsed = JSON.parse(createSubText);
      const id = isRecord(parsed) ? (parsed as JsonRecord).id : null;
      if (typeof id === "string" || typeof id === "number") subscriptionId = id;
    } catch { /* fall through */ }
    if (!subscriptionId) {
      return {
        ok: false,
        stage: "create_subscription_parse",
        status: 500,
        error: createSubText,
        webhook_id: webhookId,
      };
    }
  }

  return {
    ok: true,
    webhook_id: webhookId,
    subscription_id: subscriptionId,
    hook_url: hookUrl,
    reused_webhook: existingWebhookId !== null,
    reused_subscription: existingSubId !== null,
    office_id: officeId,
    target_scope: officeId !== null ? "office" : "api_key_owner",
    diagnostics,
  };
}

// Read-only diagnostic: fetches the current webhooks, call subscriptions, and
// the API key owner's office so we can see what Dialpad thinks the delivery
// config is when POSTs aren't arriving.
async function diagnoseDialpadWebhook(params: { apiKey: string; hookUrl: string }) {
  const { apiKey, hookUrl } = params;
  const authHeaders = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  async function safeJson(path: string) {
    try {
      const res = await fetch(`${DIALPAD_BASE}${path}`, { headers: authHeaders });
      const text = await res.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep text */ }
      return { status: res.status, ok: res.ok, body };
    } catch (err) {
      return { status: 0, ok: false, body: err instanceof Error ? err.message : String(err) };
    }
  }

  const [company, offices, webhooks, subs] = await Promise.all([
    safeJson("/company"),
    safeJson("/offices?limit=100"),
    safeJson("/webhooks?limit=100"),
    safeJson("/subscriptions/call?limit=100"),
  ]);

  return { ok: true, hook_url: hookUrl, company, offices, webhooks, subscriptions: subs };
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

function msFieldToSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.max(0, Math.round(value / 1000));
}

function isoDiffSeconds(startIso: unknown, endIso: unknown): number | null {
  if (typeof startIso !== "string" || typeof endIso !== "string") return null;
  const s = Date.parse(startIso);
  const e = Date.parse(endIso);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.max(0, Math.round((e - s) / 1000));
}

// Dialpad GET /call/{id} exposes talk time as `duration` and total call time as
// `total_duration`, BOTH in **milliseconds** (e.g. 247026.805). Fall back to
// (date_ended − date_connected) / (date_ended − date_started) using the raw
// numeric ms-epoch strings Dialpad returns.
function extractDialpadDurations(payload: DialpadWebhookPayload, callInfo: unknown) {
  const info = isRecord(callInfo) ? callInfo : null;
  const pRec = (payload ?? {}) as JsonRecord;

  const pickMs = (rec: JsonRecord | null, keys: string[]) => {
    if (!rec) return null;
    for (const k of keys) {
      const v = rec[k];
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (Number.isFinite(n) && n >= 0) return Math.max(0, Math.round(n / 1000));
    }
    return null;
  };
  const pickEpochMs = (rec: JsonRecord | null, keys: string[]) => {
    if (!rec) return null;
    for (const k of keys) {
      const v = rec[k];
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  const connectedMs = pickEpochMs(info, ["date_connected"]) ?? pickEpochMs(pRec, ["date_connected"]);
  const startedMs = pickEpochMs(info, ["date_started", "date_rang"]) ?? pickEpochMs(pRec, ["date_started", "date_rang"]);
  const endedMs = pickEpochMs(info, ["date_ended"]) ?? pickEpochMs(pRec, ["date_ended"]);

  const talkTimeSeconds =
    pickMs(info, ["duration", "duration_ms"]) ??
    pickMs(pRec, ["duration", "duration_ms"]) ??
    (connectedMs && endedMs && endedMs >= connectedMs
      ? Math.max(0, Math.round((endedMs - connectedMs) / 1000))
      : null);

  const totalDurationSeconds =
    pickMs(info, ["total_duration", "total_duration_ms"]) ??
    pickMs(pRec, ["total_duration", "total_duration_ms"]) ??
    (startedMs && endedMs && endedMs >= startedMs
      ? Math.max(0, Math.round((endedMs - startedMs) / 1000))
      : null);

  return { talkTimeSeconds, totalDurationSeconds };
}

async function upsertContactNote(adminClient: ReturnType<typeof createClient>, params: {
  contactId: string;
  createdBy: string;
  dialpadCallId: string;
  source: "dialpad_summary" | "dialpad_transcript" | "dialpad_training_objection";
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
  const base = new Date(trackedCreatedAt).getTime();
  const queryWindow = async (mins: number) => {
    const start = new Date(base - mins * 60 * 1000).toISOString();
    const end = new Date(base + mins * 60 * 1000).toISOString();
    const { data, error } = await adminClient
      .from("call_logs")
      .select("id, created_at")
      .eq("contact_id", contactId)
      .eq("user_id", userId)
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn(`[findCallLogByFallback] query error (${mins}m): ${error.message}`);
      return null;
    }
    return data ?? [];
  };

  // Tight window first: nearest in time wins.
  const tight = await queryWindow(15);
  if (tight && tight.length > 0) {
    // Pick the one whose created_at is closest to trackedCreatedAt.
    let best = tight[0];
    let bestDelta = Math.abs(new Date(best.created_at).getTime() - base);
    for (const row of tight.slice(1)) {
      const d = Math.abs(new Date(row.created_at).getTime() - base);
      if (d < bestDelta) { best = row; bestDelta = d; }
    }
    return best.id;
  }
  // Widen ONLY when there's a single candidate in the wider window.
  const wide = await queryWindow(60);
  if (wide && wide.length === 1) return wide[0].id;
  return null;
}

async function getTranscriptEligibleCallLog(adminClient: ReturnType<typeof createClient>, callLogId: string | null) {
  if (!callLogId) {
    return { eligible: false as const, reason: "No linked call log for transcript workflow", outcome: null };
  }

  const { data, error } = await adminClient
    .from("call_logs")
    .select("id, outcome")
    .eq("id", callLogId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const outcome = normalizeCallOutcome(data?.outcome);
  if (!outcome) {
    return { eligible: false as const, reason: "Call outcome missing for transcript workflow", outcome: null };
  }

  if (!TRANSCRIPT_RELEVANT_OUTCOMES.has(outcome)) {
    return {
      eligible: false as const,
      reason: `Transcript workflow skipped for outcome ${outcome}`,
      outcome,
    };
  }

  return { eligible: true as const, reason: null, outcome, callLogId: data.id };
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

  const LIVE_STATES = new Set(["calling", "ringing", "connected"]);
  const isLiveStateUpdate = LIVE_STATES.has(payload.state);

  let trackedCall = await findTrackedDialpadCall(adminClient, payload);

  // Highest-precedence linkage for CTI-originated calls: explicit contact_id/user_id in webhook payload.
  if (!trackedCall) {
    const webhookCallId = payload.call_id ? String(payload.call_id) : null;
    const linkage = extractPayloadLinkage(payload);

    if (webhookCallId && linkage.contactId) {
      let resolvedUserId = linkage.userId;

      if (!resolvedUserId) {
        const { data: recentUser } = await adminClient
          .from("call_logs")
          .select("user_id")
          .eq("contact_id", linkage.contactId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        resolvedUserId = recentUser?.user_id ?? null;
      }

      if (!resolvedUserId) {
        const { data: anyUser } = await adminClient
          .from("profiles")
          .select("user_id")
          .limit(1)
          .maybeSingle();
        resolvedUserId = anyUser?.user_id ?? null;
      }

      if (resolvedUserId) {
        await adminClient.from("dialpad_calls").upsert({
          dialpad_call_id: webhookCallId,
          contact_id: linkage.contactId,
          user_id: resolvedUserId,
          sync_status: "pending",
          call_state: normalizeDialpadState(payload.state) ?? "unknown",
        }, { onConflict: "dialpad_call_id" });

        trackedCall = await findTrackedDialpadCall(adminClient, payload);
      }
    }
  }

  // For live state webhooks, if no tracked call exists yet, try to create one using webhook payload
  if (!trackedCall && isLiveStateUpdate) {
    const webhookCallId = payload.call_id ? String(payload.call_id) : null;
    if (webhookCallId && payload.external_number) {
      // Try to find the contact + user by matching a recent pending dialpad_calls record without a call_id
      // or by matching the phone number to a contact
      console.log(`[webhook] Live state ${payload.state} for untracked call_id=${webhookCallId} — skipping (no tracked record yet)`);
    }
    return { ignored: false, reason: `Live state ${payload.state} — no tracked call to update`, call_state: payload.state };
  }

  if (!trackedCall) {
    // ── Fallback: handle untracked calls ──────────────────────────────────
    // If this is a hangup event with an external_number, try to find the
    // contact by phone and create a dialpad_calls record on the fly.
    // This handles calls made directly from Dialpad (not via the dialer CTI).
    if (payload.state === "hangup" && payload.external_number) {
      const webhookCallId = payload.call_id ? String(payload.call_id) : null;
      if (webhookCallId) {
        console.log(`[webhook] Untracked hangup for call_id=${webhookCallId} external=${payload.external_number} — attempting fallback contact match`);

        try {
          // Normalise the external number and search for a matching contact
          let normalizedPhone: string;
          try {
            normalizedPhone = normalizePhoneNumberToE164(payload.external_number);
          } catch {
            normalizedPhone = payload.external_number.replace(/\D/g, "");
          }

          // Search contacts by canonical phone first, then exact raw fallback.
          let matchedContact: { id: string; ghl_contact_id: string | null } | null = null;

          const { data: e164Match } = await adminClient
            .from("contacts")
            .select("id, ghl_contact_id")
            .eq("phone", normalizedPhone)
            .limit(1)
            .maybeSingle();

          if (e164Match) {
            matchedContact = e164Match;
          } else {
            const { data: rawMatch } = await adminClient
              .from("contacts")
              .select("id, ghl_contact_id")
              .eq("phone", payload.external_number)
              .limit(1)
              .maybeSingle();

            if (rawMatch) {
              matchedContact = rawMatch;
            }
          }

          if (matchedContact) {
            console.log(`[webhook] Fallback matched contact_id=${matchedContact.id} for external=${payload.external_number}`);

            // Find the user who might have made this call (use the most recently active dialer user)
            const { data: recentUser } = await adminClient
              .from("call_logs")
              .select("user_id")
              .eq("contact_id", matchedContact.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            // Try to map a Dialpad user id from the webhook payload to a Supabase user
            // via dialpad_settings — this is the most reliable way to attribute a
            // direct-Dialpad ("manual") call to the correct rep.
            let userId: string | null = recentUser?.user_id ?? null;

            try {
              const payloadDialpadUserIds = uniqueNormalizedStrings([
                payload.user_id,
                (payload as unknown as JsonRecord).target_id,
                (payload as unknown as JsonRecord).operator_id,
                (payload as unknown as JsonRecord).owner_id,
              ]);

              // Probe the live Dialpad call object for any user id we can resolve.
              const probeCallInfo = await fetchDialpadCallInfo(webhookCallId, apiKey);
              const callObjectUserIds = probeCallInfo && isRecord(probeCallInfo)
                ? extractDialpadUserIds(probeCallInfo)
                : [];

              const candidateDialpadUserIds = uniqueNormalizedStrings([
                ...payloadDialpadUserIds,
                ...callObjectUserIds,
              ]);

              if (candidateDialpadUserIds.length > 0) {
                const { data: settingsMatch } = await adminClient
                  .from("dialpad_settings")
                  .select("user_id, dialpad_user_id")
                  .in("dialpad_user_id", candidateDialpadUserIds)
                  .eq("is_active", true)
                  .limit(1)
                  .maybeSingle();

                if (settingsMatch?.user_id) {
                  userId = settingsMatch.user_id;
                  console.log(`[webhook] Resolved manual-dial user_id=${userId} from dialpad_user_id=${settingsMatch.dialpad_user_id}`);
                }
              }
            } catch (resolveErr) {
              console.warn("[webhook] Failed to resolve dialpad user from settings:", resolveErr);
            }

            // Last resort: if still unresolved, fall back to the first profile so the call
            // is at least counted somewhere (matches previous behavior).
            if (!userId) {
              const { data: anyUser } = await adminClient
                .from("profiles")
                .select("user_id")
                .limit(1)
                .maybeSingle();
              userId = anyUser?.user_id ?? null;
            }

            if (userId) {
              // Create a dialpad_calls tracking record on the fly
              const { data: newTracked, error: insertErr } = await adminClient
                .from("dialpad_calls")
                .insert({
                  dialpad_call_id: webhookCallId,
                  user_id: userId,
                  contact_id: matchedContact.id,
                  sync_status: "pending",
                  call_state: "hangup",
                })
                .select("id, user_id, contact_id, call_log_id, dialpad_call_id, created_at")
                .single();

              if (!insertErr && newTracked) {
                console.log(`[webhook] Created fallback dialpad_calls record id=${newTracked.id} for untracked call`);

                // Now process this call through the normal pipeline
                // Re-run syncWebhookPayload will find the tracked call this time
                // But to avoid recursion, just inline the processing here:
                const dialpadCallId = webhookCallId;
                const callInfo = await fetchDialpadCallInfo(dialpadCallId, apiKey);
                const { talkTimeSeconds, totalDurationSeconds } = extractDialpadDurations(payload, callInfo);
                const summary = typeof payload.recap_summary === "string" && payload.recap_summary.trim()
                  ? payload.recap_summary.trim()
                  : await fetchDialpadAiRecap(dialpadCallId, apiKey);
                const transcript = await fetchDialpadTranscript(dialpadCallId, apiKey);

                const hasSummary = Boolean(summary);
                const hasTranscript = Boolean(transcript);
                const syncedAt = hasSummary || hasTranscript ? new Date().toISOString() : null;

                // Try to find a matching call_log
                let resolvedCallLogId: string | null = null;
                const { data: byDialpadId } = await adminClient
                  .from("call_logs")
                  .select("id")
                  .eq("dialpad_call_id", dialpadCallId)
                  .limit(1)
                  .maybeSingle();
                if (byDialpadId?.id) resolvedCallLogId = byDialpadId.id;

                if (!resolvedCallLogId) {
                  resolvedCallLogId = await findCallLogByFallback(
                    adminClient,
                    matchedContact.id,
                    userId,
                    newTracked.created_at,
                  );
                }

                // ── Manual-dial backfill ─────────────────────────────────────
                // If no call_log exists for this Dialpad call, create one so it
                // counts as a "dial" in dashboards/targets/leaderboards. We pick
                // a conservative outcome based on talk time; the rep can correct
                // it later from the contact history.
                if (!resolvedCallLogId) {
                  const inferredOutcome: "no_answer" | "voicemail" =
                    talkTimeSeconds !== null && talkTimeSeconds >= 5 && talkTimeSeconds <= 45
                      ? "voicemail"
                      : "no_answer";

                  const callStartedIso = (() => {
                    const started = typeof payload.date_started === "number" ? payload.date_started : null;
                    if (started && Number.isFinite(started)) {
                      const ms = started > 1e12 ? started : started * 1000;
                      return new Date(ms).toISOString();
                    }
                    return new Date().toISOString();
                  })();

                  const insertPayload: Record<string, unknown> = {
                    contact_id: matchedContact.id,
                    user_id: userId,
                    outcome: inferredOutcome,
                    notes: "Auto-logged from Dialpad (manual dial — placed outside the in-app dialer).",
                    dialpad_call_id: dialpadCallId,
                    created_at: callStartedIso,
                  };
                  if (talkTimeSeconds !== null) insertPayload.dialpad_talk_time_seconds = talkTimeSeconds;
                  if (totalDurationSeconds !== null) insertPayload.dialpad_total_duration_seconds = totalDurationSeconds;
                  if (summary) insertPayload.dialpad_summary = summary;
                  if (transcript) insertPayload.dialpad_transcript = transcript;
                  if (syncedAt) insertPayload.transcript_synced_at = syncedAt;

                  const { data: backfilled, error: backfillErr } = await adminClient
                    .from("call_logs")
                    .insert(insertPayload)
                    .select("id")
                    .single();

                  if (backfillErr) {
                    console.warn(`[webhook] Failed to backfill call_log for manual dial:`, backfillErr.message);
                  } else if (backfilled?.id) {
                    resolvedCallLogId = backfilled.id;
                    console.log(`[webhook] Backfilled call_log id=${resolvedCallLogId} for manual Dialpad call ${dialpadCallId} (outcome=${inferredOutcome})`);
                  }
                }

                if (resolvedCallLogId) {
                  const updatePayload: Record<string, unknown> = { dialpad_call_id: dialpadCallId };
                  if (summary !== undefined) updatePayload.dialpad_summary = summary;
                  if (transcript !== undefined) updatePayload.dialpad_transcript = transcript;
                  if (syncedAt) updatePayload.transcript_synced_at = syncedAt;
                  if (talkTimeSeconds !== null) updatePayload.dialpad_talk_time_seconds = talkTimeSeconds;
                  if (totalDurationSeconds !== null) updatePayload.dialpad_total_duration_seconds = totalDurationSeconds;

                  await adminClient.from("call_logs").update(updatePayload).eq("id", resolvedCallLogId);
                  await adminClient.from("dialpad_calls").update({ call_log_id: resolvedCallLogId }).eq("id", newTracked.id);
                }

                if (hasSummary) {
                  await upsertContactNote(adminClient, {
                    contactId: matchedContact.id,
                    createdBy: userId,
                    dialpadCallId,
                    source: "dialpad_summary",
                    content: buildSummaryNote(summary!, payload),
                  });
                }

                if (hasTranscript) {
                  await upsertContactNote(adminClient, {
                    contactId: matchedContact.id,
                    createdBy: userId,
                    dialpadCallId,
                    source: "dialpad_transcript",
                    content: transcript!,
                  });
                }

                // AI Summary + GHL push
                let aiResult: { aiGenerated: boolean; ghlNotePushed: boolean; ghlFieldsPushed: boolean; fieldsExtracted?: number } | null = null;
                if (hasTranscript && transcript && talkTimeSeconds != null && talkTimeSeconds > 15) {
                  try {
                    aiResult = await processAiSummaryAndPushToGhl({
                      adminClient,
                      contactId: matchedContact.id,
                      userId,
                      dialpadCallId,
                      transcript,
                      phoneNumber: payload.external_number ?? undefined,
                      callDurationSeconds: talkTimeSeconds,
                      callDate: new Date().toLocaleDateString("en-AU"),
                    });
                  } catch (aiErr) {
                    console.error(`[webhook fallback] AI summary failed:`, aiErr);
                  }
                }

                const nextStatus = hasSummary || hasTranscript ? "synced" : "processing";
                await adminClient.from("dialpad_calls").update({
                  sync_status: nextStatus,
                  transcript_synced_at: syncedAt ?? undefined,
                  sync_error: nextStatus === "processing" ? "Waiting for Dialpad transcript or summary" : null,
                }).eq("id", newTracked.id);

                return {
                  ignored: false,
                  fallback_matched: true,
                  dialpad_call_id: dialpadCallId,
                  contact_id: matchedContact.id,
                  sync_status: nextStatus,
                  transcript_synced: hasTranscript,
                  summary_synced: hasSummary,
                  talk_time_seconds: talkTimeSeconds,
                  call_log_linked: !!resolvedCallLogId,
                  ai_summary_generated: aiResult?.aiGenerated ?? false,
                  ghl_note_pushed: aiResult?.ghlNotePushed ?? false,
                };
              }
            }
          }
        } catch (fallbackErr) {
          console.error(`[webhook] Fallback contact match failed:`, fallbackErr);
        }
      }
    }

    return { ignored: true, reason: "Tracked Dialpad call not found" };
  }

  // For live state updates (calling/ringing/connected), just update call_state and return
  if (isLiveStateUpdate) {
    const normalizedState = normalizeDialpadState(payload.state);
    await adminClient
      .from("dialpad_calls")
      .update({ call_state: normalizedState })
      .eq("id", trackedCall.id);
    
    console.log(`[webhook] Updated call_state to ${normalizedState} for dialpad_call_id=${trackedCall.dialpad_call_id}`);
    return {
      ignored: false,
      dialpad_call_id: trackedCall.dialpad_call_id,
      call_state: normalizedState,
      sync_status: "pending",
    };
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

  const transcriptEligibleCall = await getTranscriptEligibleCallLog(adminClient, resolvedCallLogId);

  if (resolvedCallLogId) {
    const updatePayload: Record<string, unknown> = {
      dialpad_call_id: dialpadCallId,
    };
    if (talkTimeSeconds !== null) updatePayload.dialpad_talk_time_seconds = talkTimeSeconds;
    if (totalDurationSeconds !== null) updatePayload.dialpad_total_duration_seconds = totalDurationSeconds;
    if (transcriptEligibleCall.eligible) {
      if (summary !== undefined) updatePayload.dialpad_summary = summary;
      if (transcript !== undefined) updatePayload.dialpad_transcript = transcript;
      if (syncedAt) updatePayload.transcript_synced_at = syncedAt;
    }

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

  if (transcriptEligibleCall.eligible && hasSummary) {
    await upsertContactNote(adminClient, {
      contactId: trackedCall.contact_id,
      createdBy: trackedCall.user_id,
      dialpadCallId,
      source: "dialpad_summary",
      content: buildSummaryNote(summary!, payload),
    });
  }

  if (transcriptEligibleCall.eligible && hasTranscript) {
    await upsertContactNote(adminClient, {
      contactId: trackedCall.contact_id,
      createdBy: trackedCall.user_id,
      dialpadCallId,
      source: "dialpad_transcript",
      content: transcript!,
    });
  }

  // ── Transcript → Prospect record extraction ─────────────────────────
  // Runs whenever we have a real transcript. Safely no-ops if the AI
  // gateway key is missing, so pre-key deployments stay healthy.
  if (transcriptEligibleCall.eligible && hasTranscript && transcript) {
    try {
      // Business name lookup for a richer prompt (optional).
      const { data: contactRow } = await adminClient
        .from("contacts")
        .select("business_name, phone")
        .eq("id", trackedCall.contact_id)
        .maybeSingle();

      const pipelineResult = await runTranscriptExtractionPipeline({
        adminClient,
        contactId: trackedCall.contact_id,
        userId: trackedCall.user_id,
        dialpadCallId,
        transcript,
        businessName: contactRow?.business_name ?? null,
        phoneNumber: payload.external_number ?? contactRow?.phone ?? null,
        dialpadCallsRowId: trackedCall.id,
        callLogId: resolvedCallLogId ?? null,
        source: "Dialpad transcript",
      });
      console.log(`[syncWebhookPayload] Transcript extraction pipeline: ${JSON.stringify(pipelineResult).slice(0, 400)}`);
    } catch (extractionErr) {
      console.error("[syncWebhookPayload] Transcript extraction failed (non-fatal):", extractionErr);
    }
  }

  // ── AI Summary Processing & GHL Push ──────────────────────────────────
  let aiResult: { aiGenerated: boolean; ghlNotePushed: boolean; ghlFieldsPushed: boolean; fieldsExtracted?: number } | null = null;
  if (transcriptEligibleCall.eligible && hasTranscript && transcript && talkTimeSeconds != null && talkTimeSeconds > 15) {
    console.log(`[syncWebhookPayload] Triggering AI summary for dialpad_call_id=${dialpadCallId} (talk_time=${talkTimeSeconds}s)`);
    try {
      aiResult = await processAiSummaryAndPushToGhl({
        adminClient,
        contactId: trackedCall.contact_id,
        userId: trackedCall.user_id,
        dialpadCallId,
        transcript,
        phoneNumber: payload.external_number ?? undefined,
        callDurationSeconds: talkTimeSeconds,
        callDate: new Date().toLocaleDateString("en-AU"),
      });
      console.log(`[syncWebhookPayload] AI summary result: generated=${aiResult.aiGenerated} ghlNote=${aiResult.ghlNotePushed} ghlFields=${aiResult.ghlFieldsPushed} fieldsExtracted=${aiResult.fieldsExtracted ?? 0}`);
    } catch (aiErr) {
      console.error(`[syncWebhookPayload] AI summary processing failed:`, aiErr);
    }
  } else if (transcriptEligibleCall.eligible && hasTranscript) {
    console.log(`[syncWebhookPayload] Skipping AI summary for dialpad_call_id=${dialpadCallId} — talk_time=${talkTimeSeconds ?? 'null'}s (below 15s threshold)`);
  }

  const nextStatus = transcriptEligibleCall.eligible
    ? hasSummary || hasTranscript
      ? "synced"
      : payload.state === "hangup"
        ? "processing"
        : "pending"
    : "synced";

  const nextError = transcriptEligibleCall.eligible
    ? nextStatus === "processing"
      ? "Waiting for Dialpad transcript or summary"
      : null
    : transcriptEligibleCall.reason;

  const { error: trackingError } = await adminClient
    .from("dialpad_calls")
    .update({
      sync_status: nextStatus,
      call_state: payload.state === "hangup" ? "hangup" : undefined,
      transcript_synced_at: transcriptEligibleCall.eligible ? syncedAt ?? undefined : undefined,
      sync_error: nextError,
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
    ai_summary_generated: aiResult?.aiGenerated ?? false,
    ghl_note_pushed: aiResult?.ghlNotePushed ?? false,
    ghl_fields_pushed: aiResult?.ghlFieldsPushed ?? false,
    ghl_fields_extracted: aiResult?.fieldsExtracted ?? 0,
  };
}

// ── Dialpad call-history PULL (polling) ──────────────────────────────
// Free, reliable replacement for the webhook. Pulls the office's recent
// calls, stores metadata + Dialpad's own transcript + Dialpad's own
// ai_recap. Does NOT invoke Lovable AI, NEPQ scoring, or objection
// extraction — those live in processPendingTranscriptSyncs and stay off.

const DIALPAD_OFFICE_ID_DEFAULT = "5928921344909312";
const DIALPAD_SYNC_KEY = "office_call_history";

function toDialpadEpochMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Dialpad returns ms epoch for date_* fields.
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(value);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function isoOrNull(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function pickExternalNumber(call: JsonRecord): string | null {
  // Dialpad /call payloads use external_number for the non-Dialpad party.
  const contact = isRecord(call.contact) ? call.contact : null;
  const candidates = [
    call.external_number,
    contact?.phone,
    call.from_number,
    call.to_number,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

// Extract the digits-only representation of a phone value and return its last
// 9 digits (which is the AU-friendly suffix that survives +61 vs 0 vs spacing).
function phoneDigitsSuffix(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D+/g, "");
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

// Look up a contact by the last 9 digits of an external phone number, matching
// both contacts.phone and contacts.dm_phone (spacing-insensitive). If multiple
// candidates match, prefer the one with a recent call_log from the given rep
// near the given time; otherwise fall back to most-recently-called.
async function resolveContactByPhoneDigits(
  adminClient: ReturnType<typeof createClient>,
  externalPhone: string | null | undefined,
  repUserId: string | null,
  nearIso: string | null,
): Promise<string | null> {
  const suffix = phoneDigitsSuffix(externalPhone);
  if (!suffix) return null;

  const { data, error } = await adminClient.rpc("find_contacts_by_phone_digits", { _digits: suffix });
  if (error) {
    console.warn(`[resolveContactByPhoneDigits] RPC error: ${error.message}`);
    return null;
  }
  const rows = (data ?? []) as { id: string; last_called_at: string | null }[];
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0].id;

  if (repUserId && nearIso) {
    const base = new Date(nearIso).getTime();
    if (Number.isFinite(base)) {
      const start = new Date(base - 60 * 60 * 1000).toISOString();
      const end = new Date(base + 60 * 60 * 1000).toISOString();
      const ids = rows.map((r) => r.id);
      const { data: cl } = await adminClient
        .from("call_logs")
        .select("contact_id, created_at")
        .in("contact_id", ids)
        .eq("user_id", repUserId)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      if (cl && cl.length > 0) {
        // Nearest in time wins.
        let best = cl[0];
        let bestDelta = Math.abs(new Date(best.created_at).getTime() - base);
        for (const row of cl.slice(1)) {
          const d = Math.abs(new Date(row.created_at).getTime() - base);
          if (d < bestDelta) { best = row; bestDelta = d; }
        }
        return best.contact_id as string;
      }
    }
  }
  // Fallback: most-recently-called (rows are already ordered by last_called_at desc).
  return rows[0].id;
}

function pickDialpadTargetUserId(call: JsonRecord): string | null {
  const targetKind = typeof call.target_kind === "string" ? call.target_kind : null;
  const targetRec = isRecord(call.target) ? call.target : null;
  const targetId = call.target_id ?? targetRec?.id;
  if (targetKind === "user" && (typeof targetId === "string" || typeof targetId === "number")) {
    return String(targetId);
  }
  // Fallbacks: some payloads expose the user via `user_id` or `target.user_id`.
  const alt = call.user_id ?? targetRec?.user_id;
  if (typeof alt === "string" || typeof alt === "number") return String(alt);
  if (typeof targetId === "string" || typeof targetId === "number") return String(targetId);
  return null;
}

async function listDialpadCallsByTarget(params: {
  apiKey: string;
  targetType: "office" | "user";
  targetId: string;
  startedAfterMs: number;
  startedBeforeMs: number;
  hardCap?: number;
}): Promise<JsonRecord[]> {
  const { apiKey, targetType, targetId, startedAfterMs, startedBeforeMs, hardCap = 2000 } = params;
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
  const results: JsonRecord[] = [];
  let cursor: string | null = null;
  let pages = 0;
  const maxPages = 40;

  while (pages < maxPages && results.length < hardCap) {
    const url = new URL(`${DIALPAD_BASE}/call`);
    url.searchParams.set("started_after", String(startedAfterMs));
    url.searchParams.set("started_before", String(startedBeforeMs));
    url.searchParams.set("target_type", targetType);
    url.searchParams.set("target_id", targetId);
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Dialpad /call list failed (${targetType}=${targetId}): ${res.status} ${body.slice(0, 400)}`,
      );
    }
    const payload = await res.json();
    const items = Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload)
        ? payload
        : [];
    for (const item of items) {
      if (isRecord(item)) results.push(item as JsonRecord);
    }
    cursor = typeof payload?.cursor === "string" && payload.cursor ? payload.cursor : null;
    pages += 1;
    if (!cursor) break;
  }

  return results;
}

// Deleted / disabled Dialpad user IDs — never query them (they 404).
const DIALPAD_DISABLED_USER_IDS = new Set<string>([
  "6532825673768960", // Dean (deleted)
  "6732964712554496", // Kobi (deleted)
]);

async function syncDialpadCallHistory(params: {
  adminClient: ReturnType<typeof createClient>;
  apiKey: string;
  officeId?: string;
  sinceOverrideMs?: number | null;
  untilOverrideMs?: number | null;
  windowMinutes?: number;
  hardCap?: number;
}) {
  const { adminClient, apiKey } = params;
  const officeId = params.officeId || DIALPAD_OFFICE_ID_DEFAULT;
  const hardCap = params.hardCap ?? 2000;
  const nowMs =
    params.untilOverrideMs && Number.isFinite(params.untilOverrideMs)
      ? params.untilOverrideMs
      : Date.now();

  // Determine window start
  let sinceMs: number;
  if (params.sinceOverrideMs && Number.isFinite(params.sinceOverrideMs)) {
    sinceMs = params.sinceOverrideMs;
  } else {
    const { data: state } = await adminClient
      .from("dialpad_sync_state")
      .select("last_synced_at")
      .eq("key", DIALPAD_SYNC_KEY)
      .maybeSingle();
    const lastMs = state?.last_synced_at ? Date.parse(state.last_synced_at as string) : NaN;
    if (Number.isFinite(lastMs)) {
      sinceMs = lastMs - 10 * 60 * 1000; // 10-min overlap
    } else {
      const win = params.windowMinutes ?? 24 * 60;
      sinceMs = nowMs - win * 60 * 1000;
    }
  }

  // Preload dialpad_user_id -> platform user_id map (all rows), plus active list
  const { data: settings } = await adminClient
    .from("dialpad_settings")
    .select("user_id, dialpad_user_id, is_active");
  const userIdByDialpadUser = new Map<string, string>();
  const activeDialpadUserIds: string[] = [];
  for (const row of settings ?? []) {
    if (!row.dialpad_user_id || !row.user_id) continue;
    const dpid = String(row.dialpad_user_id);
    userIdByDialpadUser.set(dpid, row.user_id as string);
    if (row.is_active === false) continue;
    if (DIALPAD_DISABLED_USER_IDS.has(dpid)) continue;
    activeDialpadUserIds.push(dpid);
  }

  console.log(
    `[sync_dialpad_call_history] since=${new Date(sinceMs).toISOString()} until=${new Date(nowMs).toISOString()} activeUsers=${activeDialpadUserIds.length} office=${officeId}`,
  );

  // ── PRIMARY: per-active-user sweep (captures outbound + inbound). ──
  const pulledByUser: Record<string, number> = {};
  const dedup = new Map<string, JsonRecord>();
  const errors: string[] = [];

  for (const dpid of activeDialpadUserIds) {
    try {
      const userCalls = await listDialpadCallsByTarget({
        apiKey,
        targetType: "user",
        targetId: dpid,
        startedAfterMs: sinceMs,
        startedBeforeMs: nowMs,
        hardCap,
      });
      pulledByUser[dpid] = userCalls.length;
      for (const c of userCalls) {
        const id = c.call_id ?? c.id;
        if (id != null) dedup.set(String(id), c);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[sync_dialpad_call_history] user sweep failed dpid=${dpid}: ${msg}`);
      errors.push(`user ${dpid}: ${msg}`);
    }
  }

  // ── SECONDARY: office sweep (catches office-level calls). ──
  let officePulled = 0;
  try {
    const officeCalls = await listDialpadCallsByTarget({
      apiKey,
      targetType: "office",
      targetId: officeId,
      startedAfterMs: sinceMs,
      startedBeforeMs: nowMs,
      hardCap,
    });
    officePulled = officeCalls.length;
    for (const c of officeCalls) {
      const id = c.call_id ?? c.id;
      if (id != null && !dedup.has(String(id))) dedup.set(String(id), c);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[sync_dialpad_call_history] office sweep failed: ${msg}`);
    errors.push(`office ${officeId}: ${msg}`);
  }

  const calls = Array.from(dedup.values());
  if (calls.length === 0 && errors.length > 0) {
    await adminClient.from("dialpad_sync_state").upsert({
      key: DIALPAD_SYNC_KEY,
      last_run_at: new Date().toISOString(),
      last_error: errors.join(" | "),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    return {
      ok: false as const,
      error: errors.join(" | "),
      pulled: 0,
      linked: 0,
      with_talk_time: 0,
      pulled_by_user: pulledByUser,
    };
  }

  // Cap detail fallback fetches per run.
  const MAX_DETAIL_FETCHES = 2000;
  let detailFetches = 0;

  let linked = 0;
  let withTalkTime = 0;
  let skipped = 0;

  const CONCURRENCY = 6;
  const detailBudget = { remaining: MAX_DETAIL_FETCHES };

  async function processOne(originalCall: JsonRecord) {
    const dialpadCallId = originalCall.call_id ?? originalCall.id;
    if (dialpadCallId == null) { skipped += 1; return; }
    const dialpadCallIdStr = String(dialpadCallId);

    let call = originalCall;
    // Listing rows lack duration_ms; fetch the full call object (free, no AI).
    if (detailBudget.remaining > 0) {
      detailBudget.remaining -= 1;
      detailFetches += 1;
      try {
        const detail = await fetchDialpadCallInfo(dialpadCallIdStr, apiKey);
        if (isRecord(detail)) {
          call = { ...originalCall, ...detail };
        }
      } catch (err) {
        console.warn(
          `[sync_dialpad_call_history] detail fetch failed call=${dialpadCallIdStr}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    let durations = extractDialpadDurations(call as unknown as DialpadWebhookPayload, call);

    const startedMs =
      (typeof call.date_started_iso === "string" ? Date.parse(call.date_started_iso as string) : NaN) ||
      toDialpadEpochMs(call.date_started ?? call.date_rang ?? call.date_connected);
    const endedMs =
      (typeof call.date_ended_iso === "string" ? Date.parse(call.date_ended_iso as string) : NaN) ||
      toDialpadEpochMs(call.date_ended);
    const state = normalizeDialpadState(call.state) ?? null;
    const talk = durations.talkTimeSeconds ?? 0;
    const isConnected =
      talk > 0 ||
      state === "connected" ||
      (state === "hangup" && !!call.date_connected);
    const externalNumber = pickExternalNumber(call);
    const normalizedExternal = externalNumber ? normalizePhoneNumberToE164(externalNumber) : null;
    const direction = typeof call.direction === "string" ? call.direction : null;

    const dialpadTargetUser = pickDialpadTargetUserId(call);
    const repUserId = dialpadTargetUser ? userIdByDialpadUser.get(dialpadTargetUser) ?? null : null;

    // Parallelize contact lookup + transcript + recap. Skip transcript/recap for
    // very short/unconnected calls (nothing to transcribe, saves API round trips).
    const wantEnrichment = isConnected && talk >= 10;
    const nearIso = startedMs ? new Date(startedMs).toISOString() : null;
    const [contactId, transcriptRes, recapRes] = await Promise.all([
      resolveContactByPhoneDigits(adminClient, externalNumber, repUserId, nearIso),
      wantEnrichment
        ? fetchDialpadTranscript(dialpadCallIdStr, apiKey).catch(() => null)
        : Promise.resolve(null),
      wantEnrichment
        ? fetchDialpadAiRecap(dialpadCallIdStr, apiKey).catch(() => null)
        : Promise.resolve(null),
    ]);

    const transcript: string | null = transcriptRes ?? null;
    const dialpadSummary: string | null = recapRes ?? null;

    let callLogId: string | null = null;
    if (repUserId && contactId && startedMs) {
      callLogId = await findCallLogByFallback(
        adminClient,
        contactId,
        repUserId,
        new Date(startedMs).toISOString(),
      );
    }

    const upsertRow: Record<string, unknown> = {
      dialpad_call_id: dialpadCallIdStr,
      contact_id: contactId,
      user_id: repUserId,
      call_log_id: callLogId,
      call_state: state,
      direction,
      talk_time_seconds: durations.talkTimeSeconds,
      total_duration_seconds: durations.totalDurationSeconds,
      started_at: isoOrNull(startedMs),
      ended_at: isoOrNull(endedMs),
      external_number: normalizedExternal ?? externalNumber,
      is_connected: isConnected,
      transcript,
      dialpad_summary: dialpadSummary,
      transcript_synced_at: transcript ? new Date().toISOString() : null,
      sync_status: "synced",
      sync_error: null,
    };
    const rec = pickDialpadRecording(call);
    if (rec) {
      upsertRow.recording_id = rec.id;
      upsertRow.recording_type = rec.type;
      upsertRow.recording_url = rec.url;
    }

    const { error: upErr } = await adminClient
      .from("dialpad_calls")
      .upsert(upsertRow, { onConflict: "dialpad_call_id" });
    if (upErr) {
      console.warn(`[sync_dialpad_call_history] upsert failed call=${dialpadCallIdStr}: ${upErr.message}`);
      skipped += 1;
      return;
    }

    if (callLogId) {
      linked += 1;
      const patch: Record<string, unknown> = { dialpad_call_id: dialpadCallIdStr };
      if (durations.talkTimeSeconds != null) patch.dialpad_talk_time_seconds = durations.talkTimeSeconds;
      if (durations.totalDurationSeconds != null) patch.dialpad_total_duration_seconds = durations.totalDurationSeconds;
      if (transcript) {
        patch.dialpad_transcript = transcript;
        patch.transcript_synced_at = new Date().toISOString();
      }
      if (dialpadSummary) patch.dialpad_summary = dialpadSummary;
      const { error: clErr } = await adminClient
        .from("call_logs")
        .update(patch)
        .eq("id", callLogId);
      if (clErr) {
        console.warn(`[sync_dialpad_call_history] call_logs backfill failed id=${callLogId}: ${clErr.message}`);
      }
    }
    if (talk > 0) withTalkTime += 1;
  }

  // Worker-pool over the deduped calls.
  let cursorIdx = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, calls.length) }, async () => {
      while (true) {
        const idx = cursorIdx++;
        if (idx >= calls.length) return;
        try { await processOne(calls[idx]); }
        catch (err) {
          skipped += 1;
          console.warn(`[sync_dialpad_call_history] processOne threw: ${err instanceof Error ? err.message : err}`);
        }
      }
    }),
  );

  await adminClient.from("dialpad_sync_state").upsert({
    key: DIALPAD_SYNC_KEY,
    last_synced_at: new Date(nowMs).toISOString(),
    last_run_at: new Date().toISOString(),
    last_pulled: calls.length,
    last_linked: linked,
    last_error: errors.length ? errors.join(" | ") : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });

  console.log(
    `[sync_dialpad_call_history] done pulled=${calls.length} linked=${linked} withTalkTime=${withTalkTime} skipped=${skipped} detailFetches=${detailFetches} officePulled=${officePulled}`,
  );

  // Opportunistic booked-call scoring. Runs a small batch inline after each
  // sync so newly booked transcripts get NEPQ scored quickly. Hard-capped by
  // enrichment_ai_budget (kind='booked_call_scoring'); safe to fire every
  // sync — a no-op when nothing is eligible or the daily cap is reached.
  let bookedScoringSummary: unknown = null;
  try {
    if (Deno.env.get("LOVABLE_API_KEY")) {
      bookedScoringSummary = await scoreBookedCalls({ adminClient, limit: 5 });
    }
  } catch (err) {
    console.warn(`[sync_dialpad_call_history] booked scoring failed: ${err instanceof Error ? err.message : err}`);
  }

  return {
    ok: true as const,
    endpoint: "GET /call?target_type={user|office}&target_id=...",
    office_id: officeId,
    active_dialpad_user_ids: activeDialpadUserIds,
    pulled_by_user: pulledByUser,
    office_pulled: officePulled,
    detail_fetches: detailFetches,
    since: new Date(sinceMs).toISOString(),
    until: new Date(nowMs).toISOString(),
    pulled: calls.length,
    linked,
    with_talk_time: withTalkTime,
    skipped,
    errors,
    booked_scoring: bookedScoringSummary,
  };
}

// Re-link EXISTING dialpad_calls rows using the fixed phone-suffix matcher,
// rep mapping, and call_log window logic. Also cleans stored transcripts
// (drops Dialpad's interleaved AI marker lines) in-place. No Lovable AI.
async function relinkDialpadCalls(params: {
  adminClient: ReturnType<typeof createClient>;
  limit?: number;
  only_unmatched?: boolean;
}) {
  const { adminClient } = params;
  const limit = params.limit ?? 5000;

  const { data: settings } = await adminClient
    .from("dialpad_settings")
    .select("user_id, dialpad_user_id");
  const userIdByDialpadUser = new Map<string, string>();
  for (const row of settings ?? []) {
    if (!row.dialpad_user_id || !row.user_id) continue;
    const dpid = String(row.dialpad_user_id);
    if (DIALPAD_DISABLED_USER_IDS.has(dpid)) continue;
    userIdByDialpadUser.set(dpid, row.user_id as string);
  }

  // Build a fallback: if only ONE active rep exists, we can safely assign
  // rep-less rows to them. (In this project only Bede is active — the deleted
  // Dean/Kobi IDs are blocked above.)
  const activeUserIds = Array.from(new Set(userIdByDialpadUser.values()));
  const soleRepUserId = activeUserIds.length === 1 ? activeUserIds[0] : null;

  let query = adminClient
    .from("dialpad_calls")
    .select("id, dialpad_call_id, external_number, contact_id, user_id, call_log_id, started_at, talk_time_seconds, total_duration_seconds, transcript, dialpad_summary")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (params.only_unmatched) {
    query = query.is("contact_id", null);
  }
  const { data: rows, error } = await query;
  if (error) {
    return { ok: false as const, error: error.message };
  }

  const stats = {
    scanned: 0,
    contacts_matched: 0,
    user_ids_set: 0,
    call_logs_linked: 0,
    call_logs_updated: 0,
    transcripts_cleaned: 0,
    transcripts_dropped: 0,
  };

  for (const row of rows ?? []) {
    stats.scanned += 1;
    const patch: Record<string, unknown> = {};

    // 1. Rep mapping. Prefer existing; else look up via Dialpad call target.
    let repUserId: string | null = (row.user_id as string | null) ?? null;
    if (!repUserId) {
      // We don't have target_user stored on the row, so we can't reliably
      // re-derive per-call — but if only one active rep exists, attribute.
      if (soleRepUserId) {
        repUserId = soleRepUserId;
        patch.user_id = repUserId;
        stats.user_ids_set += 1;
      }
    }

    // 2. Contact matching (digits-suffix).
    let contactId: string | null = (row.contact_id as string | null) ?? null;
    if (!contactId) {
      const nearIso = typeof row.started_at === "string" ? row.started_at : null;
      contactId = await resolveContactByPhoneDigits(
        adminClient,
        row.external_number as string | null,
        repUserId,
        nearIso,
      );
      if (contactId) {
        patch.contact_id = contactId;
        stats.contacts_matched += 1;
      }
    }

    // 3. Call-log link.
    let callLogId: string | null = (row.call_log_id as string | null) ?? null;
    if (!callLogId && repUserId && contactId && row.started_at) {
      callLogId = await findCallLogByFallback(
        adminClient,
        contactId,
        repUserId,
        row.started_at as string,
      );
      if (callLogId) {
        patch.call_log_id = callLogId;
        stats.call_logs_linked += 1;
      }
    }

    // 4. Transcript cleaning (in-place).
    let transcript: string | null = (row.transcript as string | null) ?? null;
    if (transcript) {
      const cleaned = cleanFormattedTranscript(transcript);
      if (cleaned !== transcript) {
        if (cleaned === null) {
          patch.transcript = null;
          transcript = null;
          stats.transcripts_dropped += 1;
        } else {
          patch.transcript = cleaned;
          transcript = cleaned;
          stats.transcripts_cleaned += 1;
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error: upErr } = await adminClient
        .from("dialpad_calls")
        .update(patch)
        .eq("id", row.id as string);
      if (upErr) {
        console.warn(`[relink_dialpad_calls] update failed id=${row.id}: ${upErr.message}`);
        continue;
      }
    }

    // 5. Backfill call_log fields when linked.
    if (callLogId) {
      const clPatch: Record<string, unknown> = {
        dialpad_call_id: row.dialpad_call_id,
      };
      if (row.talk_time_seconds != null) clPatch.dialpad_talk_time_seconds = row.talk_time_seconds;
      if (row.total_duration_seconds != null) clPatch.dialpad_total_duration_seconds = row.total_duration_seconds;
      if (transcript) {
        clPatch.dialpad_transcript = transcript;
        clPatch.transcript_synced_at = new Date().toISOString();
      }
      if (row.dialpad_summary) clPatch.dialpad_summary = row.dialpad_summary;
      const { error: clErr } = await adminClient
        .from("call_logs")
        .update(clPatch)
        .eq("id", callLogId);
      if (clErr) {
        console.warn(`[relink_dialpad_calls] call_logs backfill failed id=${callLogId}: ${clErr.message}`);
      } else {
        stats.call_logs_updated += 1;
      }
    }
  }

  return { ok: true as const, ...stats };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // DIALPAD_API_KEY may be unset in staging / pre-launch — actions that talk
  // to Dialpad still fail loudly below, but the transcript-extraction test
  // action and other Dialpad-independent paths can proceed without it.
  const DIALPAD_API_KEY = Deno.env.get("DIALPAD_API_KEY") ?? "";
  // Actions that must still run when DIALPAD_API_KEY is unset. The transcript
  // drain is safe to schedule at any time — processPendingTranscriptSyncs
  // performs a no-op with `reason: "DIALPAD_API_KEY not configured"` when the
  // key is missing, so the cron stays inert until the key is added.
  const DIALPAD_KEY_OPTIONAL_ACTIONS = new Set([
    "test_transcript_extraction",
    "process_pending_transcript_syncs",
    // record_cti_call only writes to our own dialpad_calls table (no Dialpad
    // REST call), so it must work even when DIALPAD_API_KEY is unset.
    "record_cti_call",
    // score_booked_calls only reads existing transcripts and calls the
    // Lovable AI gateway — no Dialpad REST access needed.
    "score_booked_calls",
    "backfill_correct_booked_transcripts",
    "coach_calls",
    "preview_coach_context",
  ]);
  let peekedAction: string | null = null;
  if (req.method === "POST") {
    try {
      const peekBody = await req.clone().json();
      if (peekBody && typeof peekBody.action === "string") peekedAction = peekBody.action;
    } catch {
      peekedAction = null;
    }
  }
  if (!DIALPAD_API_KEY && !(peekedAction && DIALPAD_KEY_OPTIONAL_ACTIONS.has(peekedAction))) {
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
  const cronSecret = Deno.env.get("DIALPAD_INTERNAL_CRON_SECRET");
  const incomingCronSecret = req.headers.get("x-cron-secret");

  if (!authHeader && cronSecret && incomingCronSecret === cronSecret) {
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : null;

    if (action === "process_pending_ghl_pushes") {
      const limit = coerceBoundedLimit(body.limit, 25, 1, 100);
      const summary = await processPendingGhlPushes({ adminClient, limit });
      return jsonResponse({ ok: true, ...summary }, 200);
    }
    if (action === "pending_ghl_push_metrics") {
      const metrics = await getPendingGhlPushMetrics({ adminClient });
      return jsonResponse({ ok: true, ...metrics }, 200);
    }
    if (action === "requeue_failed_pending_ghl_pushes") {
      const limit = coerceBoundedLimit(body.limit, 100, 1, 500);
      const result = await requeueFailedPendingGhlPushes({ adminClient, limit });
      return jsonResponse({ ok: true, ...result }, 200);
    }
    if (action === "process_pending_transcript_syncs") {
      const limit = coerceBoundedLimit(body.limit, 25, 1, 100);
      const result = await processPendingTranscriptSyncs({ adminClient, apiKey: DIALPAD_API_KEY, limit });
      return jsonResponse({ ok: true, ...result }, 200);
    }
    if (action === "register_dialpad_webhook") {
      if (!DIALPAD_API_KEY) {
        return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
      }
      const webhookSecret = Deno.env.get("DIALPAD_WEBHOOK_SECRET");
      if (!webhookSecret) {
        return jsonResponse({ error: "DIALPAD_WEBHOOK_SECRET is not configured" }, 500);
      }
      const hookUrl = `${supabaseUrl}/functions/v1/dialpad`;
      const force = body?.force === true;
      const result = await registerDialpadWebhook({ apiKey: DIALPAD_API_KEY, hookUrl, secret: webhookSecret, force });
      return jsonResponse(result, result.ok ? 200 : 502);
    }
    if (action === "diagnose_dialpad_webhook") {
      if (!DIALPAD_API_KEY) {
        return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
      }
      const hookUrl = `${supabaseUrl}/functions/v1/dialpad`;
      const result = await diagnoseDialpadWebhook({ apiKey: DIALPAD_API_KEY, hookUrl });
      return jsonResponse(result, 200);
    }
    if (action === "sync_dialpad_call_history") {
      if (!DIALPAD_API_KEY) {
        return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
      }
      const officeId = typeof body.office_id === "string" ? body.office_id : undefined;
      const windowMinutes = typeof body.window_minutes === "number" ? body.window_minutes : undefined;
      const sinceOverrideMs = typeof body.since_ms === "number" ? body.since_ms : undefined;
      const untilOverrideMs = typeof body.until_ms === "number" ? body.until_ms : undefined;
      const hardCap = typeof body.hard_cap === "number" ? body.hard_cap : undefined;
      const result = await syncDialpadCallHistory({
        adminClient,
        apiKey: DIALPAD_API_KEY,
        officeId,
        windowMinutes,
        sinceOverrideMs,
        untilOverrideMs,
        hardCap,
      });
      return jsonResponse(result, result.ok ? 200 : 502);
    }
    if (action === "relink_dialpad_calls") {
      const limit = typeof body.limit === "number" ? body.limit : undefined;
      const only_unmatched = body.only_unmatched === true;
      const result = await relinkDialpadCalls({ adminClient, limit, only_unmatched });
      return jsonResponse(result, result.ok ? 200 : 502);
    }
    if (action === "backfill_recordings") {
      if (!DIALPAD_API_KEY) {
        return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
      }
      const limit = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 500) : 200;
      const min_talk = typeof body.min_talk === "number" ? body.min_talk : 30;
      const result = await backfillDialpadRecordings({ adminClient, apiKey: DIALPAD_API_KEY, limit, minTalk: min_talk });
      return jsonResponse(result, result.ok ? 200 : 502);
    }
    if (action === "score_booked_calls") {
      const limit = typeof body.limit === "number" ? body.limit : 20;
      const result = await scoreBookedCalls({ adminClient, limit });
      return jsonResponse(result, 200);
    }
    if (action === "backfill_correct_booked_transcripts") {
      const limit = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 100) : 25;
      const rescore = body.rescore !== false;
      const result = await backfillCorrectBookedTranscripts({ adminClient, limit, rescore });
      return jsonResponse(result, 200);
    }
    if (action === "coach_calls") {
      const limit = typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 30) : 15;
      const result = await coachCalls({ adminClient, limit });
      return jsonResponse(result, 200);
    }
    if (action === "preview_coach_context") {
      // Read-only preview of what the coach prompt is grounded in on this run:
      // the empirical internal benchmark, the winning-patterns digest, and
      // the verbatim opener excerpts we now inject for cold_first_touch.
      const [digestResult, benchmark] = await Promise.all([
        buildWinningPatternsDigest(adminClient),
        computeInternalBenchmark(adminClient),
      ]);
      return jsonResponse({
        ok: true,
        internal_benchmark: benchmark,
        winning_digest: digestResult.digest,
        winning_opener_excerpts: digestResult.opener_excerpts,
        winning_sample_size: digestResult.sample_size,
      }, 200);
    }

    return jsonResponse({ error: "Unknown cron action" }, 400);
  }

  if (!authHeader) {
    const webhookSecret = Deno.env.get("DIALPAD_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return jsonResponse({ error: "DIALPAD_WEBHOOK_SECRET is not configured" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    try {
      // Signature verification is always required for webhook payloads.
      const payload = await extractWebhookPayload(req, webhookSecret, false);
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

  // Check admin role for gated actions
  const { data: adminRoleRow } = await adminClient
    .from("user_roles")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  const isAdmin = !!adminRoleRow;

  try {
    const { action, ...params } = await req.json();

    let dialpadResponse: Response;

    switch (action) {
      case "record_cti_call": {
        // No-op: the CTI iframe emits its LOCAL widget id which 404s against
        // Dialpad's REST API. The Dialpad webhook is now the sole source of
        // truth for dialpad_calls rows (keyed by the real REST call_id), and
        // links back to the rep's call_log via phone→contact→most-recent
        // call_log within a ±15 min window. Frontend keeps calling this action
        // for backwards compatibility, but it must not create junk rows.
        return jsonResponse({ ok: true, ignored: true, reason: "record_cti_call is a no-op; webhook owns row creation" }, 200);
      }

      case "get_call_recording": {
        if (!DIALPAD_API_KEY) {
          return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
        }
        const dialpadCallId = typeof params?.dialpad_call_id === "string" ? params.dialpad_call_id : null;
        const dialpadCallsRowId = typeof params?.id === "string" ? params.id : null;
        if (!dialpadCallId && !dialpadCallsRowId) {
          return jsonResponse({ error: "dialpad_call_id or id required" }, 400);
        }
        const query = adminClient
          .from("dialpad_calls")
          .select("id, dialpad_call_id, recording_id, recording_type, recording_url, recording_share_link, recording_share_created_at")
          .limit(1);
        const { data: row, error: rowErr } = dialpadCallsRowId
          ? await query.eq("id", dialpadCallsRowId).maybeSingle()
          : await query.eq("dialpad_call_id", dialpadCallId as string).maybeSingle();
        if (rowErr) return jsonResponse({ error: rowErr.message }, 500);
        if (!row) return jsonResponse({ error: "Call not found" }, 404);

        // Reuse cached share link if under 6 days old (Dialpad share links are
        // long-lived, but we refresh weekly to be safe).
        const cachedAt = row.recording_share_created_at ? Date.parse(row.recording_share_created_at as string) : NaN;
        const cacheFresh = Number.isFinite(cachedAt) && Date.now() - cachedAt < 6 * 24 * 60 * 60 * 1000;
        if (row.recording_share_link && cacheFresh) {
          return jsonResponse({ ok: true, access_link: row.recording_share_link, cached: true }, 200);
        }

        // Resolve recording id — refetch call detail if we don't have one yet.
        let recordingId = row.recording_id as string | null;
        let recordingType = (row.recording_type as string | null) ?? "admincallrecording";
        let recordingUrl = row.recording_url as string | null;
        if (!recordingId) {
          const detail = await fetchDialpadCallInfo(String(row.dialpad_call_id), DIALPAD_API_KEY);
          const rec = pickDialpadRecording(detail);
          if (!rec || !rec.id) {
            return jsonResponse({ error: "No recording available for this call" }, 404);
          }
          recordingId = rec.id;
          recordingType = rec.type;
          recordingUrl = rec.url;
          await adminClient
            .from("dialpad_calls")
            .update({ recording_id: rec.id, recording_type: rec.type, recording_url: rec.url })
            .eq("id", row.id);
        }

        const share = await createDialpadRecordingShareLink({
          apiKey: DIALPAD_API_KEY,
          recordingId,
          recordingType,
          privacy: "public",
        });
        if (!share.ok) {
          return jsonResponse({ error: `Share link failed: ${share.error}`, status: share.status }, 502);
        }
        await adminClient
          .from("dialpad_calls")
          .update({
            recording_share_link: share.access_link,
            recording_share_link_id: share.id,
            recording_share_created_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        return jsonResponse({ ok: true, access_link: share.access_link, cached: false, recording_url: recordingUrl }, 200);
      }

      case "register_dialpad_webhook": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admin role required" }, 403);
        }
        if (!DIALPAD_API_KEY) {
          return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
        }
        const webhookSecret = Deno.env.get("DIALPAD_WEBHOOK_SECRET");
        if (!webhookSecret) {
          return jsonResponse({ error: "DIALPAD_WEBHOOK_SECRET is not configured" }, 500);
        }
        const hookUrl = `${supabaseUrl}/functions/v1/dialpad`;
        const force = params?.force === true;
        const result = await registerDialpadWebhook({ apiKey: DIALPAD_API_KEY, hookUrl, secret: webhookSecret, force });
        return jsonResponse(result, result.ok ? 200 : 502);
      }

      case "diagnose_dialpad_webhook": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admin role required" }, 403);
        }
        if (!DIALPAD_API_KEY) {
          return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
        }
        const hookUrl = `${supabaseUrl}/functions/v1/dialpad`;
        const result = await diagnoseDialpadWebhook({ apiKey: DIALPAD_API_KEY, hookUrl });
        return jsonResponse(result, 200);
      }

      case "sync_dialpad_call_history": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admin role required" }, 403);
        }
        if (!DIALPAD_API_KEY) {
          return jsonResponse({ error: "DIALPAD_API_KEY is not configured" }, 500);
        }
        const officeId = typeof params.office_id === "string" ? params.office_id : undefined;
        const windowMinutes = typeof params.window_minutes === "number" ? params.window_minutes : undefined;
        const sinceOverrideMs = typeof params.since_ms === "number" ? params.since_ms : undefined;
        const hardCap = typeof params.hard_cap === "number" ? params.hard_cap : undefined;
        const result = await syncDialpadCallHistory({
          adminClient,
          apiKey: DIALPAD_API_KEY,
          officeId,
          windowMinutes,
          sinceOverrideMs,
          hardCap,
        });
        return jsonResponse(result, result.ok ? 200 : 502);
      }

      case "relink_dialpad_calls": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admin role required" }, 403);
        }
        const limit = typeof params.limit === "number" ? params.limit : undefined;
        const result = await relinkDialpadCalls({ adminClient, limit });
        return jsonResponse(result, result.ok ? 200 : 502);
      }

      case "initiate_call": {
        const dialpadUserAuth = await resolveAuthorizedDialpadUserId({
          adminClient,
          userId: user.id,
          requestedDialpadUserId: params.dialpad_user_id,
          isAdmin,
        });
        if (!dialpadUserAuth.ok) {
          return jsonResponse(dialpadUserAuth.body, dialpadUserAuth.status);
        }

        const dialpadUserId = dialpadUserAuth.dialpadUserId;
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

        // ── Auto-disable DND before dialing and restore it after call creation has had time to settle ──
        let wasDnd = false;
        let dndTemporarilyDisabled = false;

        try {
          const userDetails = await fetchDialpadUserDetails(DIALPAD_API_KEY, dialpadUserId).catch(() => null);
          if (userDetails?.ok && isRecord(userDetails.data)) {
            wasDnd = userDetails.data.do_not_disturb === true;
          } else if (userDetails && !userDetails.ok) {
            console.warn(`[initiate_call] DND preflight check failed with status=${userDetails.status}, proceeding anyway`);
          }

          if (wasDnd) {
            console.log(`[initiate_call] User ${dialpadUserId} is in DND — temporarily disabling`);
            const toggleOff = await toggleDialpadDoNotDisturb(DIALPAD_API_KEY, dialpadUserId);
            if (!toggleOff.ok) {
              return jsonResponse({
                ok: false,
                error: "Unable to disable Dialpad DND before placing the call.",
                message: toggleOff.body,
                status_code: 502,
              }, 502);
            }

            const disabled = await waitForDialpadDndState({
              apiKey: DIALPAD_API_KEY,
              dialpadUserId,
              expectedEnabled: false,
              attempts: 8,
              delayMs: 300,
            });

            if (!disabled) {
              return jsonResponse({
                ok: false,
                error: "Dialpad DND did not switch off in time.",
                message: "Please try again in a second.",
                status_code: 409,
              }, 409);
            }

            dndTemporarilyDisabled = true;
          }

          let initiateResponse: Response;
          let initiateData: unknown;

          const runInitiateCall = async () => {
            const response = await fetch(`${DIALPAD_BASE}/users/${dialpadUserId}/initiate_call`, {
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

            const data = await response.json().catch(() => null);
            return { response, data };
          };

          ({ response: initiateResponse, data: initiateData } = await runInitiateCall());

          if (!initiateResponse.ok && dndTemporarilyDisabled && isDialpadDndAvailabilityError(initiateData)) {
            console.warn(`[initiate_call] Dialpad still reports DND/unavailable after disable for user=${dialpadUserId}; retrying once`);
            await sleep(700);
            ({ response: initiateResponse, data: initiateData } = await runInitiateCall());
          }

          if (!initiateResponse.ok) {
            const initiateMessage = extractDialpadErrorMessage(initiateData) ?? "";
            const lowerMessage = initiateMessage.toLowerCase();

            const isNoAppsError = lowerMessage.includes("no apps available");
            if (isNoAppsError) {
              const fallbackBody: Record<string, unknown> = {
                phone_number: normalizedPhone,
                user_id: dialpadUserId,
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

            const isAlreadyOnCall = lowerMessage.includes("currently on a call");
            if (isAlreadyOnCall) {
              console.log(`[initiate_call] User already on a call — running call discovery for user=${dialpadUserId} phone=${normalizedPhone}`);
            } else {
              dialpadResponse = new Response(JSON.stringify(initiateData), {
                status: initiateResponse.status,
                headers: { "Content-Type": "application/json" },
              });
              break;
            }
          }


          // ── Try to extract call_id directly from initiate_call response ──
          const directCallId = getDialpadCallId(initiateData);
          if (directCallId) {
            console.log(`[initiate_call] Got call_id=${directCallId} directly from initiate_call response`);

            if (params.contact_id) {
              await adminClient.from("dialpad_calls").upsert({
                dialpad_call_id: directCallId,
                contact_id: params.contact_id,
                user_id: user.id,
                sync_status: "pending",
                call_state: "calling",
              }, { onConflict: "dialpad_call_id" }).then(() => {});
            }

            dialpadResponse = new Response(JSON.stringify({
              call_id: directCallId,
              dialpad_call_id: directCallId,
              state: "calling",
              call_resolved: true,
              ...((isRecord(initiateData) ? initiateData : {}) as Record<string, unknown>),
            }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          } else {
            // Fallback: discover via active call list polling
            console.log(`[initiate_call] No call_id in response, starting call discovery for user=${dialpadUserId} phone=${normalizedPhone}`);
            const matchedCall = await findMatchingActiveCallWithRetries({
              action: "initiate_call",
              apiKey: DIALPAD_API_KEY,
              dialpadUserId,
              normalizedPhone,
              delays: [0, 200, 400, 800, 1200, 1600],
            });

            const foundCallId = matchedCall ? getDialpadCallId(matchedCall.call) : null;
            const foundCallState = matchedCall ? normalizeDialpadState(matchedCall.call.state) : null;

            if (foundCallId) {
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
              console.warn(`[initiate_call] Could not discover call_id for user=${dialpadUserId}`);
              dialpadResponse = new Response(JSON.stringify({
                ...((isRecord(initiateData) ? initiateData : {}) as Record<string, unknown>),
                state: "calling",
                call_resolved: false,
              }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              });
            }
          }
        } finally {
          if (dndTemporarilyDisabled) {
            scheduleDialpadDndRestore({
              apiKey: DIALPAD_API_KEY,
              dialpadUserId,
              delayMs: 1800,
            });
          }
        }
        break;
      }

      case "get_caller_ids": {
        const dialpadUserAuth = await resolveAuthorizedDialpadUserId({
          adminClient,
          userId: user.id,
          requestedDialpadUserId: params.dialpad_user_id,
          isAdmin,
        });
        if (!dialpadUserAuth.ok) {
          return jsonResponse(dialpadUserAuth.body, dialpadUserAuth.status);
        }

        const dialpadUserId = dialpadUserAuth.dialpadUserId;

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
        const dialpadUserAuth = await resolveAuthorizedDialpadUserId({
          adminClient,
          userId: user.id,
          requestedDialpadUserId: params.dialpad_user_id,
          isAdmin,
        });
        if (!dialpadUserAuth.ok) {
          return jsonResponse(dialpadUserAuth.body, dialpadUserAuth.status);
        }

        const dialpadUserId = dialpadUserAuth.dialpadUserId;

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
        const dialpadUserAuth = await resolveAuthorizedDialpadUserId({
          adminClient,
          userId: user.id,
          requestedDialpadUserId: params.dialpad_user_id,
          isAdmin,
        });
        if (!dialpadUserAuth.ok) {
          return jsonResponse(dialpadUserAuth.body, dialpadUserAuth.status);
        }

        const resolveDialpadUserId = dialpadUserAuth.dialpadUserId;
        let resolvePhone: string;
        try {
          resolvePhone = normalizePhoneNumberToE164(params.phone);
        } catch {
          return jsonResponse({ error: "Invalid phone number" }, 400);
        }

        console.log(`[resolve_call] Searching for active call: user=${resolveDialpadUserId} phone=${resolvePhone}`);

        // ── First check if initiate_call already created a dialpad_calls record ──
        if (params.contact_id) {
          const recentWindow = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          const { data: existingTracked } = await adminClient
            .from("dialpad_calls")
            .select("dialpad_call_id, call_state")
            .eq("contact_id", params.contact_id)
            .eq("user_id", user.id)
            .gte("created_at", recentWindow)
            .order("created_at", { ascending: false })
            .limit(1);

          if (existingTracked && existingTracked.length > 0) {
            const tracked = existingTracked[0];
            console.log(`[resolve_call] Found existing tracked call_id=${tracked.dialpad_call_id} state=${tracked.call_state} from DB`);

            // Optionally refresh state from Dialpad API
            let currentState = tracked.call_state;
            try {
              const statusRes = await fetch(`${DIALPAD_BASE}/call/${tracked.dialpad_call_id}`, {
                headers: { Authorization: `Bearer ${DIALPAD_API_KEY}` },
              });
              if (statusRes.ok) {
                const statusData = await statusRes.json().catch(() => null);
                const apiState = normalizeDialpadState(isRecord(statusData) ? statusData.state : null);
                if (apiState) currentState = apiState;
              } else {
                await statusRes.text().catch(() => null);
              }
            } catch { /* ignore */ }

            return jsonResponse({
              ok: true,
              action: "resolve_call",
              call_id: tracked.dialpad_call_id,
              dialpad_call_id: tracked.dialpad_call_id,
              state: currentState ?? "calling",
              call_resolved: true,
            }, 200);
          }
        }

        // ── Fallback: active call list discovery ──
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
        const dialpadUserAuth = await resolveAuthorizedDialpadUserId({
          adminClient,
          userId: user.id,
          requestedDialpadUserId: params.dialpad_user_id,
          isAdmin,
        });
        if (!dialpadUserAuth.ok) {
          return jsonResponse(dialpadUserAuth.body, dialpadUserAuth.status);
        }

        const fhDialpadUserId = dialpadUserAuth.dialpadUserId;
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

      case "check_user_status": {
        const dialpadUserAuth = await resolveAuthorizedDialpadUserId({
          adminClient,
          userId: user.id,
          requestedDialpadUserId: params.dialpad_user_id,
          isAdmin,
        });
        if (!dialpadUserAuth.ok) {
          return jsonResponse(dialpadUserAuth.body, dialpadUserAuth.status);
        }

        const checkUserId = dialpadUserAuth.dialpadUserId;

        const statusResponse = await fetch(`${DIALPAD_BASE}/users/${checkUserId}`, {
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            Accept: "application/json",
          },
        });

        if (!statusResponse.ok) {
          return jsonResponse({
            ok: false,
            ready: false,
            reason: "Unable to check Dialpad user status",
          }, 200);
        }

        const userData = await statusResponse.json();
        const isOnCall = userData?.on_call === true;
        const isDnd = userData?.do_not_disturb === true;
        const isAvailable = userData?.is_available !== false;

        return jsonResponse({
          ok: true,
          ready: true,
          on_call: isOnCall,
          do_not_disturb: isDnd,
          is_available: isAvailable,
        }, 200);
      }

      case "process_pending_ghl_pushes": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admins only" }, 403);
        }

        const limit = coerceBoundedLimit(params.limit, 25, 1, 100);
        const summary = await processPendingGhlPushes({ adminClient, limit });
        return jsonResponse({ ok: true, ...summary }, 200);
      }

      case "pending_ghl_push_metrics": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admins only" }, 403);
        }

        const metrics = await getPendingGhlPushMetrics({ adminClient });
        return jsonResponse({ ok: true, ...metrics }, 200);
      }

      case "requeue_failed_pending_ghl_pushes": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admins only" }, 403);
        }

        const limit = coerceBoundedLimit(params.limit, 100, 1, 500);
        const result = await requeueFailedPendingGhlPushes({ adminClient, limit });
        return jsonResponse({ ok: true, ...result }, 200);
      }

      case "process_pending_transcript_syncs": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admins only" }, 403);
        }

        const limit = coerceBoundedLimit(params.limit, 25, 1, 100);
        const result = await processPendingTranscriptSyncs({ adminClient, apiKey: DIALPAD_API_KEY, limit });
        return jsonResponse({ ok: true, ...result }, 200);
      }

      case "score_booked_calls": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admins only" }, 403);
        }
        const limit = coerceBoundedLimit(params.limit, 20, 1, 20);
        const result = await scoreBookedCalls({ adminClient, limit });
        return jsonResponse(result, 200);
      }

      case "backfill_correct_booked_transcripts": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admins only" }, 403);
        }
        const limit = coerceBoundedLimit(params.limit, 25, 1, 100);
        const rescore = params.rescore !== false; // default true
        const result = await backfillCorrectBookedTranscripts({ adminClient, limit, rescore });
        return jsonResponse(result, 200);
      }

      case "test_transcript_extraction": {
        // Staging action: runs the full extract+apply pipeline against an
        // inline sample HVAC transcript so the wiring can be verified end-to-end
        // BEFORE the real Dialpad API key / webhook / transcripts are live.
        const contactId = typeof params.contact_id === "string" ? params.contact_id.trim() : "";
        if (!contactId) {
          return jsonResponse({ error: "contact_id is required" }, 400);
        }

        const { data: contactRow, error: contactErr } = await adminClient
          .from("contacts")
          .select("id, business_name, phone")
          .eq("id", contactId)
          .maybeSingle();
        if (contactErr) {
          return jsonResponse({ error: contactErr.message }, 500);
        }
        if (!contactRow) {
          return jsonResponse({ error: "contact not found" }, 404);
        }

        const transcript = typeof params.transcript === "string" && params.transcript.trim().length > 40
          ? params.transcript
          : SAMPLE_HVAC_TRANSCRIPT;
        const syntheticDialpadCallId = `test_${contactId}_${Date.now()}`;

        // If caller didn't pin a call_log_id, attach the scorecard to this
        // contact's most recent call_log so it renders in the activity timeline.
        let callLogIdForTest: string | null = typeof params.call_log_id === "string" ? params.call_log_id : null;
        if (!callLogIdForTest) {
          const { data: recentCall } = await adminClient
            .from("call_logs")
            .select("id")
            .eq("contact_id", contactId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          callLogIdForTest = recentCall?.id ?? null;
        }

        const pipelineResult = await runTranscriptExtractionPipeline({
          adminClient,
          contactId,
          userId: user.id,
          dialpadCallId: syntheticDialpadCallId,
          transcript,
          businessName: contactRow.business_name,
          phoneNumber: contactRow.phone,
          callLogId: callLogIdForTest,
          source: "Sample transcript (staging test)",
        });

        return jsonResponse({
          ok: true,
          sample_used: transcript === SAMPLE_HVAC_TRANSCRIPT,
          synthetic_dialpad_call_id: syntheticDialpadCallId,
          transcript_length: transcript.length,
          pipeline: pipelineResult,
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
          call_state: normalizeDialpadState(isRecord(data) ? data.state : null) ?? "calling",
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
