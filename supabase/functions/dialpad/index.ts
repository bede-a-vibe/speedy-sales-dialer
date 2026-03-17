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
      .select("id, user_id, contact_id, call_log_id, dialpad_call_id")
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
  const summary = typeof payload.recap_summary === "string" && payload.recap_summary.trim()
    ? payload.recap_summary.trim()
    : await fetchDialpadAiRecap(dialpadCallId, apiKey);

  const transcript = payload.state === "call_transcription" || payload.state === "hangup"
    ? await fetchDialpadTranscript(dialpadCallId, apiKey)
    : null;

  const hasSummary = Boolean(summary);
  const hasTranscript = Boolean(transcript);
  const syncedAt = hasSummary || hasTranscript ? new Date().toISOString() : null;

  if (trackedCall.call_log_id || dialpadCallId) {
    let callLogQuery = adminClient
      .from("call_logs")
      .update({
        dialpad_summary: summary ?? undefined,
        dialpad_transcript: transcript ?? undefined,
        transcript_synced_at: syncedAt ?? undefined,
      });

    callLogQuery = trackedCall.call_log_id
      ? callLogQuery.eq("id", trackedCall.call_log_id)
      : callLogQuery.eq("dialpad_call_id", dialpadCallId);

    const { error: callLogError } = await callLogQuery;
    if (callLogError) {
      throw new Error(callLogError.message);
    }
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

        dialpadResponse = await fetch(`${DIALPAD_BASE}/call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone_number: normalizedPhone,
            user_id: params.dialpad_user_id,
            custom_data: params.contact_id ? JSON.stringify({ contact_id: params.contact_id, user_id: user.id }) : undefined,
          }),
        });
        break;
      }

      case "log_call": {
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

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

        dialpadResponse = await fetch(`${DIALPAD_BASE}/call`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone_number: normalizedPhone,
            user_id: dialpadUserId,
          }),
        });
        break;
      }

      case "get_call_status": {
        dialpadResponse = await fetch(`${DIALPAD_BASE}/call/${params.call_id}`, {
          headers: { Authorization: `Bearer ${DIALPAD_API_KEY}` },
        });
        break;
      }

      case "hangup_call": {
        if (!params.call_id) {
          return jsonResponse({ error: "call_id is required" }, 400);
        }

        const callStatusResponse = await fetch(`${DIALPAD_BASE}/call/${params.call_id}`, {
          headers: { Authorization: `Bearer ${DIALPAD_API_KEY}` },
        });

        const callStatusData = await callStatusResponse.json().catch(() => null);
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
        if (isTerminalDialpadState(callState)) {
          return jsonResponse(buildDialpadClientPayload({
            action,
            data: callStatusData,
            dialpadCallId: String(params.call_id),
            alreadyEnded: true,
            message: "This call has already ended.",
          }), 200);
        }

        dialpadResponse = await fetch(`${DIALPAD_BASE}/call/${params.call_id}/actions/hangup`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DIALPAD_API_KEY}`,
            Accept: "application/json",
          },
        });

        const hangupData = await dialpadResponse.json().catch(() => null);
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
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

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

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    const data = await dialpadResponse.json().catch(() => null);
    if (!dialpadResponse.ok) {
      const message = extractDialpadErrorMessage(data);
      const status = isDialpadRateLimitError(data) ? 429 : dialpadResponse.status;

      return jsonResponse({
        error: status === 429
          ? "Dialpad rate limit reached. Wait a few seconds and try again."
          : `Dialpad API error [${dialpadResponse.status}]`,
        details: data,
        message,
      }, status);
    }

    if (action === "initiate_call" && params.contact_id) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const dialpadCallId = getDialpadCallId(data);

      if (dialpadCallId) {
        const { error: trackingError } = await adminClient.from("dialpad_calls").insert({
          dialpad_call_id: dialpadCallId,
          contact_id: params.contact_id,
          user_id: user.id,
          sync_status: "pending",
        });

        if (trackingError) {
          return jsonResponse({
            ...data,
            dialpad_call_id: dialpadCallId,
            tracking_warning: trackingError.message,
          }, 200);
        }

        return jsonResponse({
          ...data,
          dialpad_call_id: dialpadCallId,
          tracking_created_at: formatDialpadDate(Date.now()),
        }, 200);
      }
    }

    return jsonResponse(data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
