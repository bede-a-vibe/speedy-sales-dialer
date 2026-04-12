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

You MUST return a valid JSON object with two keys:
1. "fields" — structured key/value pairs for CRM custom fields
2. "note" — a formatted rich text summary for the CRM contact note

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

Only include sections where meaningful information exists. Omit empty sections entirely.`;

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
    return parsed as { fields?: Record<string, unknown>; note?: string };
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


async function processPendingTranscriptSyncs(params: {
  adminClient: ReturnType<typeof createClient>;
  apiKey: string;
  limit?: number;
}) {
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

    const retryState = candidate.call_state === "hangup" ? "hangup" : "call_transcription";

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

            // If no recent call log, try to find any active user
            let userId = recentUser?.user_id;
            if (!userId) {
              const { data: anyUser } = await adminClient
                .from("profiles")
                .select("user_id")
                .limit(1)
                .maybeSingle();
              userId = anyUser?.user_id;
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

// ── Pending Transcript Sync Retry ───────────────────────────────────────
async function processPendingTranscriptSyncs(params: {
  adminClient: ReturnType<typeof createClient>;
  apiKey: string;
  limit?: number;
}) {
  const limit = coerceBoundedLimit(params.limit, 25, 1, 100);
  const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();

  const { data: rows, error } = await params.adminClient
    .from("dialpad_calls")
    .select("id, dialpad_call_id, contact_id, user_id, call_log_id, created_at, sync_status")
    .in("sync_status", ["pending", "processing", "error"])
    .eq("call_state", "hangup")
    .lte("created_at", twoMinutesAgo)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  if (!rows || rows.length === 0) {
    return { processed: 0, synced: 0, skipped: 0, failed: 0, errors: [] as string[] };
  }

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const callInfo = await fetchDialpadCallInfo(row.dialpad_call_id, params.apiKey);
      const summary = await fetchDialpadAiRecap(row.dialpad_call_id, params.apiKey);
      const transcript = await fetchDialpadTranscript(row.dialpad_call_id, params.apiKey);

      const hasSummary = Boolean(summary);
      const hasTranscript = Boolean(transcript);

      if (!hasSummary && !hasTranscript) {
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        if (ageMs > 48 * 60 * 60_000) {
          await params.adminClient.from("dialpad_calls").update({
            sync_status: "error",
            sync_error: "Transcript not available from Dialpad after retry window",
          }).eq("id", row.id);
          failed++;
          errors.push(`${row.dialpad_call_id}: expired after 48h`);
        } else {
          skipped++;
        }
        continue;
      }

      const syncedAt = new Date().toISOString();
      const { talkTimeSeconds, totalDurationSeconds } = extractDialpadDurations(
        {} as DialpadWebhookPayload,
        callInfo,
      );

      // Resolve call_log_id
      let resolvedCallLogId = row.call_log_id;
      if (!resolvedCallLogId) {
        const { data: byDialpadId } = await params.adminClient
          .from("call_logs")
          .select("id")
          .eq("dialpad_call_id", row.dialpad_call_id)
          .limit(1)
          .maybeSingle();
        if (byDialpadId?.id) resolvedCallLogId = byDialpadId.id;
      }
      if (!resolvedCallLogId) {
        resolvedCallLogId = await findCallLogByFallback(
          params.adminClient,
          row.contact_id,
          row.user_id,
          row.created_at,
        );
      }

      // Update call_logs
      if (resolvedCallLogId) {
        const updatePayload: Record<string, unknown> = { dialpad_call_id: row.dialpad_call_id };
        if (summary) updatePayload.dialpad_summary = summary;
        if (transcript) updatePayload.dialpad_transcript = transcript;
        updatePayload.transcript_synced_at = syncedAt;
        if (talkTimeSeconds !== null) updatePayload.dialpad_talk_time_seconds = talkTimeSeconds;
        if (totalDurationSeconds !== null) updatePayload.dialpad_total_duration_seconds = totalDurationSeconds;

        await params.adminClient.from("call_logs").update(updatePayload).eq("id", resolvedCallLogId);

        // Link dialpad_calls to call_log if not already linked
        if (!row.call_log_id) {
          await params.adminClient.from("dialpad_calls").update({ call_log_id: resolvedCallLogId }).eq("id", row.id);
        }
      }

      // Upsert contact_notes
      if (hasSummary) {
        await upsertContactNote(params.adminClient, {
          contactId: row.contact_id,
          createdBy: row.user_id,
          dialpadCallId: row.dialpad_call_id,
          source: "dialpad_summary",
          content: buildSummaryNote(summary!, {} as DialpadWebhookPayload),
        });
      }
      if (hasTranscript) {
        await upsertContactNote(params.adminClient, {
          contactId: row.contact_id,
          createdBy: row.user_id,
          dialpadCallId: row.dialpad_call_id,
          source: "dialpad_transcript",
          content: transcript!,
        });
      }

      // AI summary + GHL push for qualifying calls
      if (hasTranscript && transcript && talkTimeSeconds != null && talkTimeSeconds > 15) {
        try {
          await processAiSummaryAndPushToGhl({
            adminClient: params.adminClient,
            contactId: row.contact_id,
            userId: row.user_id,
            dialpadCallId: row.dialpad_call_id,
            transcript,
            callDurationSeconds: talkTimeSeconds,
            callDate: new Date(row.created_at).toLocaleDateString("en-AU"),
          });
        } catch (aiErr) {
          console.error(`[transcript_retry] AI summary failed for ${row.dialpad_call_id}:`, aiErr);
        }
      }

      // Mark synced
      await params.adminClient.from("dialpad_calls").update({
        sync_status: "synced",
        transcript_synced_at: syncedAt,
        sync_error: null,
      }).eq("id", row.id);

      synced++;
    } catch (rowErr) {
      const errMsg = rowErr instanceof Error ? rowErr.message : "Unknown error";
      console.error(`[transcript_retry] Failed for ${row.dialpad_call_id}:`, rowErr);
      await params.adminClient.from("dialpad_calls").update({
        sync_status: "error",
        sync_error: errMsg,
      }).eq("id", row.id).catch(() => {});
      failed++;
      errors.push(`${row.dialpad_call_id}: ${errMsg}`);
    }
  }

  return { processed: rows.length, synced, skipped, failed, errors };
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

    return jsonResponse({ error: "Unknown cron action" }, 400);
  }

  if (!authHeader) {
    const webhookSecret = Deno.env.get("DIALPAD_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return jsonResponse({ error: "DIALPAD_WEBHOOK_SECRET is not configured" }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    try {
      const allowUnsignedWebhookJson = Deno.env.get("DIALPAD_WEBHOOK_ALLOW_UNSIGNED_JSON") === "true";
      const payload = await extractWebhookPayload(req, webhookSecret, allowUnsignedWebhookJson);
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

      case "process_pending_transcript_syncs": {
        if (!isAdmin) {
          return jsonResponse({ error: "Admins only" }, 403);
        }

        const limit = coerceBoundedLimit(params.limit, 25, 1, 100);
        const summary = await processPendingTranscriptSyncs({ adminClient, apiKey: DIALPAD_API_KEY, limit });
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
