import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Inlined from src/shared/ghlPipelineContract.ts to avoid cross-boundary import
type GhlPipelineType = "follow_up" | "booked";

const GHL_PIPELINE_DEFAULTS = {
  follow_up: {
    // Main "Odin Digital" location — Sales Pipeline / Contacted stage
    pipelineId: "6CHrrf2yQfsHCOJ8RkwK",
    stageId: "0b02d920-b119-4e69-9c6a-8b543aa612b0",
  },
} as const;

function resolveGhlOpportunityTarget(params: {
  pipelineType: GhlPipelineType;
  pipelineId?: string | null;
  pipelineStageId?: string | null;
}): { pipelineId?: string; pipelineStageId?: string } {
  if (params.pipelineType === "follow_up") {
    return {
      pipelineId: params.pipelineId || GHL_PIPELINE_DEFAULTS.follow_up.pipelineId,
      pipelineStageId: params.pipelineStageId || GHL_PIPELINE_DEFAULTS.follow_up.stageId,
    };
  }
  return {
    pipelineId: params.pipelineId || undefined,
    pipelineStageId: params.pipelineStageId || undefined,
  };
}

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ghlHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Version: GHL_VERSION,
  };
}

async function ghlFetch(
  path: string,
  apiKey: string,
  opts: { method?: string; body?: unknown; params?: Record<string, string> } = {},
) {
  const url = new URL(`${GHL_BASE}${path}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: ghlHeaders(apiKey),
  };
  if (opts.body) init.body = JSON.stringify(opts.body);

  const res = await fetch(url.toString(), init);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`GHL ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Actions ────────────────────────────────────────────────────────────

async function searchContacts(
  apiKey: string,
  locationId: string,
  body: Record<string, unknown>,
) {
  return ghlFetch("/contacts/search", apiKey, {
    method: "POST",
    body: { ...body, locationId },
  });
}

async function getContact(apiKey: string, contactId: string) {
  return ghlFetch(`/contacts/${contactId}`, apiKey);
}

async function createContact(
  apiKey: string,
  locationId: string,
  body: Record<string, unknown>,
) {
  return ghlFetch("/contacts/", apiKey, {
    method: "POST",
    body: { ...body, locationId },
  });
}

async function updateContact(
  apiKey: string,
  contactId: string,
  body: Record<string, unknown>,
) {
  return ghlFetch(`/contacts/${contactId}`, apiKey, {
    method: "PUT",
    body,
  });
}

async function addNote(
  apiKey: string,
  contactId: string,
  body: { body: string; userId?: string },
) {
  return ghlFetch(`/contacts/${contactId}/notes`, apiKey, {
    method: "POST",
    body,
  });
}

async function addTag(
  apiKey: string,
  contactId: string,
  tags: string[],
) {
  return ghlFetch(`/contacts/${contactId}/tags`, apiKey, {
    method: "POST",
    body: { tags },
  });
}

async function createTask(
  apiKey: string,
  contactId: string,
  body: Record<string, unknown>,
) {
  return ghlFetch(`/contacts/${contactId}/tasks`, apiKey, {
    method: "POST",
    body,
  });
}

async function createOpportunity(
  apiKey: string,
  locationId: string,
  body: Record<string, unknown>,
) {
  const pipelineType = body.pipelineType === "follow_up" || body.pipelineType === "booked"
    ? body.pipelineType
    : null;

  const resolvedTarget = pipelineType
    ? resolveGhlOpportunityTarget({
      pipelineType,
      pipelineId: typeof body.pipelineId === "string" ? body.pipelineId : null,
      pipelineStageId: typeof body.pipelineStageId === "string" ? body.pipelineStageId : null,
    })
    : {
      pipelineId: typeof body.pipelineId === "string" ? body.pipelineId : undefined,
      pipelineStageId: typeof body.pipelineStageId === "string" ? body.pipelineStageId : undefined,
    };

  const { pipelineType: _pipelineType, ...rest } = body;

  return ghlFetch("/opportunities/", apiKey, {
    method: "POST",
    body: {
      ...rest,
      locationId,
      pipelineId: resolvedTarget.pipelineId,
      pipelineStageId: resolvedTarget.pipelineStageId,
    },
  });
}

async function createCalendarEvent(
  apiKey: string,
  locationId: string,
  body: Record<string, unknown>,
) {
  return ghlFetch("/calendars/events/appointments", apiKey, {
    method: "POST",
    body: { locationId, ...body },
  });
}

async function getCalendarFreeSlots(
  apiKey: string,
  calendarId: string,
  startDate: string,
  endDate: string,
  timezone: string,
) {
  // GHL requires startDate/endDate as Unix millisecond timestamps (numbers as strings),
  // not date strings like "2026-04-28". Convert here so callers can keep passing dates.
  const toMs = (input: string, endOfDay: boolean): string => {
    // Already a numeric ms timestamp? Pass through.
    if (/^\d{10,}$/.test(input.trim())) return input.trim();
    // Pure YYYY-MM-DD → start or end of that day in UTC (close enough for slot search;
    // GHL filters by the timezone param when returning slots).
    const datePartMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
    if (datePartMatch) {
      const [, y, m, d] = datePartMatch;
      const date = endOfDay
        ? new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999))
        : new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0));
      return String(date.getTime());
    }
    // Fall back to Date parsing (ISO strings, etc.)
    const ms = new Date(input).getTime();
    if (Number.isFinite(ms)) return String(ms);
    throw new Error(`Invalid date for free-slots: ${input}`);
  };

  return ghlFetch(`/calendars/${calendarId}/free-slots`, apiKey, {
    params: {
      startDate: toMs(startDate, false),
      endDate: toMs(endDate, true),
      timezone,
    },
  });
}

async function getOpportunity(apiKey: string, opportunityId: string) {
  return ghlFetch(`/opportunities/${opportunityId}`, apiKey);
}

async function updateOpportunity(
  apiKey: string,
  opportunityId: string,
  body: Record<string, unknown>,
) {
  return ghlFetch(`/opportunities/${opportunityId}`, apiKey, {
    method: "PUT",
    body,
  });
}

async function searchOpportunities(
  apiKey: string,
  locationId: string,
  pipelineId: string | undefined,
  contactId: string,
) {
  const params: Record<string, string> = { location_id: locationId, contact_id: contactId };
  if (pipelineId) params.pipeline_id = pipelineId;
  return ghlFetch("/opportunities/search", apiKey, {
    method: "GET",
    params,
  });
}

async function getCalendars(apiKey: string, locationId: string) {
  return ghlFetch("/calendars/", apiKey, {
    params: { locationId },
  });
}

async function getPipelines(apiKey: string, locationId: string) {
  return ghlFetch("/opportunities/pipelines", apiKey, {
    params: { locationId },
  });
}

async function getSmartLists(apiKey: string, locationId: string) {
  // GHL search endpoint with empty filters returns all contacts;
  // smart lists are fetched via saved search / filters
  return ghlFetch("/contacts/search", apiKey, {
    method: "POST",
    body: { locationId, pageSize: 1 },
  });
}

async function getCustomFields(apiKey: string, locationId: string) {
  return ghlFetch("/locations/" + locationId + "/customFields", apiKey);
}

async function getUsers(apiKey: string, locationId: string) {
  return ghlFetch("/users/search", apiKey, {
    method: "GET",
    params: { locationId, companyId: locationId },
  });
}

// Complete GHL custom field key → ID mapping for the main "Odin Digital" location
const GHL_FIELD_KEY_TO_ID: Record<string, string> = {
  "contact.google_business_profile": "ndqiVBUh3uLV3Ldv2U3y",
  "contact.gbp_rating": "tURFlUlaFptokRxVtTnY",
  "contact.review_number": "zFL0ugGivKLRaT66Rb2z",
  "contact.number_quality": "RwPm1QYWjsKFPGV9yfPn",
  "contact.prospect_tier": "tj6IENIKIjrRNOwAlQrH",
  "contact.next_followup_date": "eCycdDk2CeGl8XBx8F9w",
  "contact.trade_type": "2PCgu75uet5x1Un3LfUW",
  "contact.total_call_attempts": "YjMRd5Rjibg5QrvtsxUa",
  "contact.best_time_to_call": "wnwsciJlfvJRXZzPTv6J",
  "contact.gatekeeper_name": "lCSsKeALjcWqPnta12QT",
  "contact.gatekeeper_notes": "R8wxTGh9n3EY3LDD6ape",
  "contact.decision_maker_name": "wJZYqVWVftkCpRKpsh1E",
  "contact.decision_maker_direct_line": "6OndJoC6WKbN9Ffq4WRp",
  "contact.decision_maker_email": "eS6oYJUK2UMnXijxSdCZ",
  "contact.decision_maker_linkedin": "EKgMkT1U5xu2aj6AoWzw",
  "contact.best_route_to_dm": "9bpBi9hiziafLWKKA0DN",
  "contact.abn": "iCiidz5RzuRYi8Iw8gVe",
  "contact.work_type": "axtUmGxV7tWXytJKBfC8",
  "contact.business_size": "Ew9OeEvZKjU7qqBddGv1",
  "contact.years_in_business": "XRMlhtuvmgirf0PULKZK",
  "contact.current_marketing_agency": "gCrMGwsqXWSZtafyRpbz",
  "contact.has_google_ads": "ZG3QeG2W3Ik6becivAGs",
  "contact.has_facebookmeta_ads": "38OdKPZZEzcS8R8rjRWD",
  "contact.seo_visibility": "DmuVdRMa7GUo75ELoAUe",
  "contact.budget_indication": "xDIkLFvyamCIbjxKFqjP",
  "contact.authority_level": "TAreuAl3hcsnzbtfL5sN",
  "contact.buying_timeline": "GnGTus8dpsw9BjoHxaf7",
  "contact.buying_signal_strength": "mw0QdEQOuoAfRlHZBYSN",
  "contact.last_call_sentiment": "ybcmHrjLXc8UN8H7jlcl",
  "contact.key_quote": "aQMw8XHDdYocQrOWft8h",
  "contact.agreed_next_steps": "XIh2qkCyBZui0vEwND4f",
  "contact.meeting_booked_date": "f9YIjyfnCTLsPYChFyHo",
  "contact.dialer_contact_id": "6teOm5mV7adBxuifGj1M",
  "contact.lead_status": "jkEml3ZgsT39j0dw5wb4",
  "contact.lifecycle_stage": "P2jB7XrffoxEXQjhlBSD",
  "contact.vertical": "iuGlU9siAP2jJcpKbXcf",
  "contact.import_batch": "gGdOpEyLBLYIusTc0QRk",
  "contact.appointment_status": "atUoeSFgJf44uN6cbGHV",
  "contact.noshow_count": "k1lvtr2msSPEf8kSqMwI",
};

/**
 * Resolve a custom field identifier: if it's a known field key (e.g. "contact.decision_maker_name"),
 * return the GHL field ID. Otherwise assume it's already a raw ID and pass through.
 */
function resolveFieldId(idOrKey: string): string {
  return GHL_FIELD_KEY_TO_ID[idOrKey] ?? idOrKey;
}

async function updateContactFields(
  apiKey: string,
  contactId: string,
  customFields: Array<{ id: string; field_value: unknown }>,
) {
  // Resolve field keys to GHL IDs before sending. Any keys that don't map
  // to a known GHL custom-field ID are skipped with a warning — the GHL
  // custom field must be created in the location first.
  const resolved: Array<{ id: string; field_value: unknown }> = [];
  for (const f of customFields) {
    if (!f.id) continue;
    const mapped = GHL_FIELD_KEY_TO_ID[f.id];
    if (mapped) {
      resolved.push({ id: mapped, field_value: f.field_value });
      continue;
    }
    // If the input already looks like a raw GHL ID (not a "contact.*" key), pass through.
    if (!f.id.startsWith("contact.")) {
      resolved.push({ id: f.id, field_value: f.field_value });
      continue;
    }
    console.warn(`[GHL updateContactFields] Skipping unmapped custom field key "${f.id}" — create it in the GHL location and add its ID to GHL_FIELD_KEY_TO_ID.`);
  }
  if (resolved.length === 0) {
    return { skipped: customFields.length, note: "No mappable custom fields" };
  }
  return ghlFetch(`/contacts/${contactId}`, apiKey, {
    method: "PUT",
    body: { customFields: resolved },
  });
}

async function upsertContact(
  apiKey: string,
  locationId: string,
  payload: {
    phone: string;
    companyName?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    website?: string;
    city?: string;
    state?: string;
    tags?: string[];
    source?: string;
    country?: string;
  },
) {
  const body: Record<string, unknown> = {
    locationId,
    phone: payload.phone,
    country: payload.country ?? "AU",
    source: payload.source ?? "Speedy Sales Dialer",
  };

  // Set name fields — prefer firstName/lastName, fall back to splitting name
  if (payload.firstName) {
    body.firstName = payload.firstName;
    if (payload.lastName) body.lastName = payload.lastName;
  } else if (payload.name) {
    const parts = payload.name.trim().split(/\s+/);
    body.firstName = parts[0];
    if (parts.length > 1) body.lastName = parts.slice(1).join(" ");
  }

  if (payload.companyName) body.companyName = payload.companyName;
  if (payload.email) body.email = payload.email;
  if (payload.website) body.website = payload.website;
  if (payload.city) body.city = payload.city;
  if (payload.state) body.state = payload.state;

  // NOTE: never send tags — adding a tag in the main GHL location triggers
  // live automation workflows. Tagging is caller-driven via the "add_tag" action only.

  const data = await ghlFetch("/contacts/upsert", apiKey, {
    method: "POST",
    body,
  });

  const isNew = data.new ?? false;
  const upsertedId = data.contact?.id;

  // ── Fallback: company-name matching ──────────────────────────────────
  // If the upsert created a NEW contact but we have a company name, check
  // whether an existing GHL contact with the same company already exists.
  // This handles the common case where Supabase has a landline but GHL
  // has a mobile for the same business.
  if (isNew && payload.companyName && upsertedId) {
    try {
      const searchResult = await ghlFetch("/contacts/search", apiKey, {
        method: "POST",
        body: {
          locationId,
          filters: [
            {
              field: "companyName",
              operator: "eq",
              value: payload.companyName,
            },
          ],
          pageSize: 5,
        },
      });

      const existingContacts = (searchResult.contacts ?? []).filter(
        (c: { id: string }) => c.id !== upsertedId,
      );

      if (existingContacts.length > 0) {
        const existing = existingContacts[0];
        // Possible duplicate by company name. We do NOT delete anything —
        // company names are not unique enough across 43k contacts.
        console.warn(
          `[GHL Upsert] Possible company-name duplicate for "${payload.companyName}": kept new contact ${upsertedId}, existing candidate ${existing.id}. No deletion performed.`,
        );
      }
    } catch (searchErr) {
      // If the fallback search fails, just use the newly created contact.
      // This is a best-effort enhancement — the original upsert still succeeded.
      console.warn(`[GHL Upsert] Fallback company search failed:`, searchErr);
    }
  }

  return {
    ghlContactId: upsertedId,
    isNew,
    contact: data.contact,
  };
}

const DIALER_CONTACT_ID_FIELD = "6teOm5mV7adBxuifGj1M";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Re-link Supabase contacts to the main GHL location using the
 * "Dialer Contact ID" custom field rather than guessing by phone.
 */
async function relinkFromDialerId(
  apiKey: string,
  locationId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  page = 1,
  pageSize = 100,
) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const searchResult = await ghlFetch("/contacts/search", apiKey, {
    method: "POST",
    body: { locationId, page, pageSize },
  });

  const contacts: Array<Record<string, unknown>> = searchResult.contacts ?? [];
  const totalGhl = Number(searchResult.total ?? 0);

  let relinked = 0;
  let skipped = 0;

  for (const gc of contacts) {
    const ghlId = gc.id as string | undefined;
    const customFields = Array.isArray(gc.customFields)
      ? (gc.customFields as Array<Record<string, unknown>>)
      : [];
    const field = customFields.find((f) => f.id === DIALER_CONTACT_ID_FIELD);
    const raw = field ? (field.value ?? (field as { field_value?: unknown }).field_value) : undefined;
    const dialerId = typeof raw === "string" ? raw.trim() : "";

    if (!ghlId || !dialerId || !UUID_RE.test(dialerId)) {
      skipped++;
      continue;
    }

    const { data, error } = await supabase
      .from("contacts")
      .update({ ghl_contact_id: ghlId })
      .eq("id", dialerId)
      .select("id");

    if (error || !data || data.length === 0) {
      if (error) console.warn(`[GHL Relink] Failed to update ${dialerId}:`, error.message);
      skipped++;
      continue;
    }
    relinked++;
  }

  const processed = contacts.length;
  const hasMore = processed === pageSize;

  return {
    page,
    processed,
    relinked,
    skipped,
    hasMore,
    nextPage: page + 1,
    totalGhl,
  };
}

// ── Cutover backfill: push dialer field data up to GHL ─────────────────

const IMPORT_BATCH_VALUE = "dialer-2026-08-04";

/** Direct GHL custom-field IDs used by the cutover backfill. */
const CUTOVER_FIELD_IDS = {
  dialerContactId: "6teOm5mV7adBxuifGj1M",
  importBatch: "gGdOpEyLBLYIusTc0QRk",
  leadStatus: "jkEml3ZgsT39j0dw5wb4",
  lifecycleStage: "P2jB7XrffoxEXQjhlBSD",
  leadSourceChannel: "jDoscxdqzhHNh6lHqFcP",
  prospectTier: "tj6IENIKIjrRNOwAlQrH",
  segment: "yNZ7hCIwoY37vTZD27Ws",
  brand: "6Sudcgra1Mg2Ird0wIIJ",
  appointmentStatus: "atUoeSFgJf44uN6cbGHV",
} as const;

const LEAD_STATUS_BY_LIFECYCLE: Record<string, string> = {
  new: "New",
  attempting: "Attempting",
  connected: "Connected",
  booked: "Booked",
  won: "Booked",
  lost: "Not Interested",
};

const LIFECYCLE_STAGE_BY_LIFECYCLE: Record<string, string> = {
  new: "Lead",
  attempting: "Lead",
  connected: "MQL",
  booked: "SQL",
  won: "Customer",
  lost: "Lost",
};

const LEAD_SOURCE_CHANNEL_MAP: Record<string, string> = {
  "cold call": "Cold Call",
  "cold email": "Cold Email",
  "website": "Website Form",
  "student": "Student",
  "referral": "Referral",
  "partnership": "Partnership",
  "linkedin": "LinkedIn",
};

/** Dialer column → GHL custom-field key (resolved through GHL_FIELD_KEY_TO_ID). */
const CUTOVER_COLUMN_TO_FIELD_KEY: Array<[string, string]> = [
  ["call_attempt_count", "contact.total_call_attempts"],
  ["gmb_link", "contact.google_business_profile"],
  ["google_rating", "contact.gbp_rating"],
  ["google_review_count", "contact.review_number"],
  ["has_google_ads", "contact.has_google_ads"],
  ["has_facebook_ads", "contact.has_facebookmeta_ads"],
  ["has_seo", "contact.seo_visibility"],
  ["buying_signal_strength", "contact.buying_signal_strength"],
  ["buying_timeline", "contact.buying_timeline"],
  ["business_size", "contact.business_size"],
  ["years_in_business", "contact.years_in_business"],
  ["abn", "contact.abn"],
  ["trade_type", "contact.trade_type"],
  ["work_type", "contact.work_type"],
  ["dm_name", "contact.decision_maker_name"],
  ["dm_phone", "contact.decision_maker_direct_line"],
  ["dm_email", "contact.decision_maker_email"],
  ["dm_linkedin", "contact.decision_maker_linkedin"],
  ["gatekeeper_name", "contact.gatekeeper_name"],
  ["gatekeeper_notes", "contact.gatekeeper_notes"],
  ["best_route_to_decision_maker", "contact.best_route_to_dm"],
  ["best_time_to_call", "contact.best_time_to_call"],
  ["authority_level", "contact.authority_level"],
  ["budget_indication", "contact.budget_indication"],
  ["last_call_sentiment", "contact.last_call_sentiment"],
  ["key_quote", "contact.key_quote"],
  ["agreed_next_steps", "contact.agreed_next_steps"],
  ["next_followup_date", "contact.next_followup_date"],
  ["phone_number_quality", "contact.number_quality"],
];

const CUTOVER_SELECT_COLUMNS = [
  "id",
  "ghl_contact_id",
  "lifecycle_stage",
  "lead_channel",
  "prospect_tier",
  "is_dnc",
  ...CUTOVER_COLUMN_TO_FIELD_KEY.map(([col]) => col),
].join(", ");

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

function mapLeadSourceChannel(leadChannel: unknown): string {
  const raw = typeof leadChannel === "string" ? leadChannel.trim() : "";
  if (!raw) return "Cold Call";
  return LEAD_SOURCE_CHANNEL_MAP[raw.toLowerCase()] ?? "Other";
}

function buildCutoverCustomFields(contact: Record<string, unknown>) {
  const lifecycle = typeof contact.lifecycle_stage === "string" ? contact.lifecycle_stage.trim().toLowerCase() : "";
  const isDnc = contact.is_dnc === true;

  const leadStatus = isDnc ? "DNC" : (LEAD_STATUS_BY_LIFECYCLE[lifecycle] ?? "New");
  const lifecycleStage = isDnc ? "Do Not Contact" : (LIFECYCLE_STAGE_BY_LIFECYCLE[lifecycle] ?? "Lead");

  const fields: Array<{ id: string; field_value: unknown }> = [
    { id: CUTOVER_FIELD_IDS.dialerContactId, field_value: contact.id },
    { id: CUTOVER_FIELD_IDS.importBatch, field_value: IMPORT_BATCH_VALUE },
    { id: CUTOVER_FIELD_IDS.leadStatus, field_value: leadStatus },
    { id: CUTOVER_FIELD_IDS.lifecycleStage, field_value: lifecycleStage },
    { id: CUTOVER_FIELD_IDS.leadSourceChannel, field_value: mapLeadSourceChannel(contact.lead_channel) },
    { id: CUTOVER_FIELD_IDS.segment, field_value: "SMB" },
    { id: CUTOVER_FIELD_IDS.brand, field_value: "Odin Digital" },
    { id: CUTOVER_FIELD_IDS.appointmentStatus, field_value: "Not Booked" },
  ];

  if (hasValue(contact.prospect_tier)) {
    fields.push({ id: CUTOVER_FIELD_IDS.prospectTier, field_value: contact.prospect_tier });
  }

  for (const [column, key] of CUTOVER_COLUMN_TO_FIELD_KEY) {
    const value = contact[column];
    if (!hasValue(value)) continue;
    const id = GHL_FIELD_KEY_TO_ID[key];
    if (!id) {
      console.warn(`[GHL Push] No mapped GHL field ID for "${key}" — skipping`);
      continue;
    }
    fields.push({ id, field_value: value });
  }

  return fields;
}

const CUTOVER_DND_SETTINGS = {
  Call: { status: "active", message: "Dialer cutover backfill" },
  Email: { status: "active", message: "Dialer cutover backfill" },
  SMS: { status: "active", message: "Dialer cutover backfill" },
  WhatsApp: { status: "active", message: "Dialer cutover backfill" },
  GMB: { status: "active", message: "Dialer cutover backfill" },
  FB: { status: "active", message: "Dialer cutover backfill" },
} as const;

/**
 * Push dialer field data UP to GHL for already-linked contacts.
 * Only ever PUTs customFields + DND settings — never tags, never opportunities.
 */
async function pushFieldsToGhl(
  apiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  batchSize = 50,
  offset = 0,
) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { count: total, error: countError } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .not("ghl_contact_id", "is", null);
  if (countError) throw new Error(`Failed to count linked contacts: ${countError.message}`);

  const { data: rows, error: fetchError } = await supabase
    .from("contacts")
    .select(CUTOVER_SELECT_COLUMNS)
    .not("ghl_contact_id", "is", null)
    .order("id", { ascending: true })
    .range(offset, offset + batchSize - 1);
  if (fetchError) throw new Error(`Failed to fetch linked contacts: ${fetchError.message}`);

  const contacts = (rows ?? []) as unknown as Array<Record<string, unknown>>;

  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ contactId: string; error: string }> = [];

  for (const contact of contacts) {
    const ghlContactId = typeof contact.ghl_contact_id === "string" ? contact.ghl_contact_id : "";
    if (!ghlContactId) {
      skipped++;
      continue;
    }

    const payload = {
      customFields: buildCutoverCustomFields(contact),
      dnd: true,
      dndSettings: CUTOVER_DND_SETTINGS,
    };

    try {
      await ghlFetch(`/contacts/${ghlContactId}`, apiKey, { method: "PUT", body: payload });
      updated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("GHL 429")) {
        // Rate limited — back off and retry this contact once.
        await new Promise((r) => setTimeout(r, 15000));
        try {
          await ghlFetch(`/contacts/${ghlContactId}`, apiKey, { method: "PUT", body: payload });
          updated++;
          await new Promise((r) => setTimeout(r, 150));
          continue;
        } catch (retryErr) {
          const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
          failed++;
          if (errors.length < 50) errors.push({ contactId: String(contact.id), error: retryMessage });
          await new Promise((r) => setTimeout(r, 150));
          continue;
        }
      }
      failed++;
      if (errors.length < 50) errors.push({ contactId: String(contact.id), error: message });
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  const processed = contacts.length;

  return {
    processed,
    updated,
    failed,
    skipped,
    hasMore: processed === batchSize,
    nextOffset: offset + processed,
    total: total ?? 0,
    errors,
  };
}

async function bulkLinkContacts(
  apiKey: string,
  locationId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  batchSize = 50,
  delayMs = 6000,
  offset = 0,
  statusFilter: "all" | "active" = "all",
) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Count remaining unlinked rows so the client can show progress
  const countQueryBuilder = supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .or("ghl_contact_id.is.null,ghl_contact_id.eq.")
    .not("phone", "is", null);
  if (statusFilter === "active") {
    countQueryBuilder.in("status", ["dnc", "follow_up", "booked", "called"]);
  }
  const { count: remainingTotal, error: countError } = await countQueryBuilder;
  if (countError) {
    throw new Error(`Failed to count unlinked contacts: ${countError.message}`);
  }

  // Fetch one batch only — the client drives the loop and shows progress between batches
  const fetchQueryBuilder = supabase
    .from("contacts")
    .select("id, phone, business_name, contact_person, email, website, city, state, industry")
    .or("ghl_contact_id.is.null,ghl_contact_id.eq.")
    .not("phone", "is", null)
    .order("created_at", { ascending: true })
    .range(offset, offset + batchSize - 1);
  if (statusFilter === "active") {
    fetchQueryBuilder.in("status", ["dnc", "follow_up", "booked", "called"]);
  }
  const { data: unlinked, error: fetchError } = await fetchQueryBuilder;

  if (fetchError) {
    throw new Error(`Failed to fetch unlinked contacts: ${fetchError.message}`);
  }

  if (!unlinked || unlinked.length === 0) {
    return {
      processed: 0,
      linked: 0,
      failed: 0,
      skipped: 0,
      total: remainingTotal ?? 0,
      hasMore: false,
      nextOffset: offset,
      errors: [],
    };
  }

  let linked = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ contactId: string; error: string }> = [];

  for (const contact of unlinked) {
      if (!contact.phone || contact.phone.trim() === "") {
        skipped++;
        continue;
      }

      try {
        const result = await upsertContact(apiKey, locationId, {
          phone: contact.phone,
          companyName: contact.business_name || undefined,
          name: contact.contact_person || contact.business_name || undefined,
          email: contact.email || undefined,
          website: contact.website || undefined,
          city: contact.city || undefined,
          state: contact.state || undefined,
        });

        if (result.ghlContactId) {
          const { error: updateError } = await supabase
            .from("contacts")
            .update({ ghl_contact_id: result.ghlContactId })
            .eq("id", contact.id);

          if (updateError) {
            console.error(`[Bulk Link] Failed to update contact ${contact.id}:`, updateError);
            failed++;
            errors.push({ contactId: contact.id, error: updateError.message });
          } else {
            linked++;
          }
        } else {
          failed++;
          errors.push({ contactId: contact.id, error: "No ghlContactId returned" });
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ contactId: contact.id, error: msg });

        // If rate limited, wait longer
        if (msg.includes("429")) {
          console.warn("[Bulk Link] Rate limited, waiting 15s...");
          await new Promise((r) => setTimeout(r, 15000));
        }
      }
  }

  // Note: when linked > 0, those rows now have ghl_contact_id and disappear from the unlinked
  // pool, so the client should advance offset by (skipped + failed) only — not by batch length.
  const advance = skipped + failed;
  const remainingAfter = Math.max(0, (remainingTotal ?? 0) - linked);
  console.log(
    `[Bulk Link] Batch done: linked=${linked} failed=${failed} skipped=${skipped} remaining=${remainingAfter}`,
  );

  return {
    processed: unlinked.length,
    total: remainingTotal ?? 0,
    linked,
    failed,
    skipped,
    hasMore: remainingAfter > 0,
    nextOffset: offset + advance,
    delayMs,
    errors: errors.slice(0, 50),
  };
}

async function createFollowUpTask(
  apiKey: string,
  contactId: string,
  params: {
    title: string;
    description?: string;
    dueDate: string;
    assignedTo?: string;
  },
) {
  return ghlFetch(`/contacts/${contactId}/tasks`, apiKey, {
    method: "POST",
    body: {
      title: params.title,
      body: params.description ?? "",
      dueDate: params.dueDate,
      completed: false,
      ...(params.assignedTo ? { assignedTo: params.assignedTo } : {}),
    },
  });
}

// ── Phone normalisation (AU-aware) ─────────────────────────────────────────
function normalisePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("04") && digits.length === 10) return `+61${digits.slice(1)}`;
  if (digits.startsWith("4") && digits.length === 9) return `+61${digits}`;
  if (digits.startsWith("61") && digits.length === 11) return `+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;

  return null;
}

// ── Speed-to-lead intake ───────────────────────────────────────────────────

const INTAKE_CURSOR_KEY = "ghl_inbound_intake";
const BEDE_USER_ID = "35a0fecd-d996-414e-9402-ec3d1e08bfd9";

function last9(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

function ghlDateToIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * pull_inbound_leads
 *
 * Every-2-minute intake: pulls GHL contacts created since a persisted cursor
 * (dialpad_sync_state.key = 'ghl_inbound_intake'), then inserts them into
 * contacts as inbound ad leads, or stamps an existing match. Idempotent:
 * cursor + dedupe on ghl_contact_id then phone last-9.
 */
async function pullInboundLeads(
  apiKey: string,
  locationId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  opts: { maxPages?: number; lookbackMinutes?: number } = {},
) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const startedAt = new Date().toISOString();
  const maxPages = Math.min(Math.max(opts.maxPages ?? 3, 1), 10);

  // 1. Load cursor
  const { data: stateRow } = await supabase
    .from("dialpad_sync_state")
    .select("last_synced_at")
    .eq("key", INTAKE_CURSOR_KEY)
    .maybeSingle();

  const fallbackMinutes = Math.max(opts.lookbackMinutes ?? 60, 1);
  const cursorIso: string =
    (stateRow?.last_synced_at as string | null) ??
    new Date(Date.now() - fallbackMinutes * 60_000).toISOString();
  const cursorMs = new Date(cursorIso).getTime();

  let pulled = 0;
  let inserted = 0;
  let matched = 0;
  let skipped = 0;
  const errors: Array<{ ghlId: string; error: string }> = [];
  let newestSeenMs = cursorMs;

  try {
    for (let page = 1; page <= maxPages; page++) {
      const resp = await ghlFetch("/contacts/search", apiKey, {
        method: "POST",
        body: {
          locationId,
          page,
          pageLimit: 100,
          sort: [{ field: "dateAdded", direction: "desc" }],
        },
      });

      const ghlContacts: Array<Record<string, unknown>> = resp.contacts ?? [];
      if (ghlContacts.length === 0) break;

      let reachedCursor = false;

      for (const gc of ghlContacts) {
        const ghlId = gc.id as string | undefined;
        const addedIso = ghlDateToIso(gc.dateAdded ?? gc.createdAt ?? gc.dateUpdated);
        const addedMs = addedIso ? new Date(addedIso).getTime() : 0;

        if (addedMs && addedMs <= cursorMs) {
          reachedCursor = true;
          continue;
        }
        if (!ghlId) { skipped++; continue; }

        pulled++;
        if (addedMs > newestSeenMs) newestSeenMs = addedMs;

        try {
          const rawPhone = ((gc.phone as string | undefined) ?? "").trim();
          const phoneE164 = normalisePhoneE164(rawPhone);
          if (!phoneE164) { skipped++; continue; }

          const tags = Array.isArray(gc.tags) ? (gc.tags as string[]) : [];
          const leadSource =
            ((gc.source as string | undefined) ?? "").trim() ||
            (tags[0] ?? "").trim() ||
            "GHL";

          // Dedupe 1: already linked by ghl_contact_id
          const { data: byGhl } = await supabase
            .from("contacts")
            .select("id, lead_source")
            .eq("ghl_contact_id", ghlId)
            .maybeSingle();

          if (byGhl) {
            if (!byGhl.lead_source) {
              await supabase.from("contacts").update({ lead_source: leadSource }).eq("id", byGhl.id);
            }
            matched++;
            continue;
          }

          // Dedupe 2: phone last-9
          const digits9 = last9(phoneE164);
          if (digits9) {
            const { data: phoneMatches } = await supabase.rpc("find_contacts_by_phone_digits", {
              _digits: digits9,
            });
            const existingId = (phoneMatches as Array<{ id: string }> | null)?.[0]?.id;
            if (existingId) {
              const { data: existing } = await supabase
                .from("contacts")
                .select("id, lead_source, ghl_contact_id")
                .eq("id", existingId)
                .maybeSingle();
              const patch: Record<string, unknown> = {};
              if (!existing?.ghl_contact_id) patch.ghl_contact_id = ghlId;
              if (!existing?.lead_source) patch.lead_source = leadSource;
              if (Object.keys(patch).length > 0) {
                await supabase.from("contacts").update(patch).eq("id", existingId);
              }
              matched++;
              continue;
            }
          }

          // Classify phone type (best-effort)
          let phoneType: string | null = null;
          try {
            const { data: pt } = await supabase.rpc("classify_au_phone_type", {
              phone_number: phoneE164,
            });
            phoneType = (pt as string | null) ?? null;
          } catch (_e) {
            phoneType = null;
          }

          const firstName = ((gc.firstName as string) ?? "").trim();
          const lastName = ((gc.lastName as string) ?? "").trim();
          const contactPerson = [firstName, lastName].filter(Boolean).join(" ") || null;
          const businessName =
            (((gc.companyName as string) ?? "").trim() || contactPerson || "Inbound Lead");

          const { error: insErr } = await supabase.from("contacts").insert({
            business_name: businessName,
            contact_person: contactPerson,
            phone: phoneE164,
            email: (((gc.email as string) ?? "").trim().toLowerCase()) || null,
            website: (gc.website as string | undefined) ?? null,
            city: (gc.city as string | undefined) ?? null,
            state: (gc.state as string | undefined) ?? null,
            industry: "Unknown",
            status: "uncalled",
            is_dnc: false,
            ghl_contact_id: ghlId,
            lead_type: "inbound",
            lead_channel: "ads",
            lead_source: leadSource,
            lifecycle_stage: "new",
            ...(phoneType ? { phone_type: phoneType } : {}),
            uploaded_by: BEDE_USER_ID,
          });

          if (insErr) {
            errors.push({ ghlId, error: insErr.message });
          } else {
            inserted++;
          }
        } catch (err) {
          errors.push({ ghlId, error: err instanceof Error ? err.message : String(err) });
        }
      }

      if (reachedCursor || ghlContacts.length < 100) break;
    }

    // Advance cursor only on a clean run
    const nextCursor = new Date(Math.max(newestSeenMs, cursorMs)).toISOString();
    await supabase.from("dialpad_sync_state").upsert(
      {
        key: INTAKE_CURSOR_KEY,
        last_synced_at: nextCursor,
        last_run_at: startedAt,
        last_pulled: pulled,
        last_linked: inserted + matched,
        last_error: errors.length > 0 ? JSON.stringify(errors.slice(0, 5)) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    console.log(
      `[pull_inbound_leads] pulled=${pulled} inserted=${inserted} matched=${matched} skipped=${skipped} errors=${errors.length} cursor=${nextCursor}`,
    );

    return {
      ok: true,
      cursorFrom: cursorIso,
      cursorTo: nextCursor,
      pulled,
      inserted,
      matched,
      skipped,
      errors: errors.slice(0, 10),
    };
  } catch (err) {
    // Fail quietly: log the run, never block other sync jobs
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[pull_inbound_leads] failed:", msg);
    await supabase.from("dialpad_sync_state").upsert(
      {
        key: INTAKE_CURSOR_KEY,
        last_run_at: startedAt,
        last_pulled: pulled,
        last_linked: inserted + matched,
        last_error: msg,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    return { ok: false, error: msg, pulled, inserted, matched, skipped };
  }
}

/**
 * bulk_import_from_ghl
 *
 * Pulls one page of contacts from GHL and creates or links them in Supabase.
 * Call repeatedly with increasing `page` values until `hasMore` is false.
 *
 * Matching priority per GHL contact:
 *   1. ghl_contact_id already in Supabase → skip (already linked)
 *   2. Phone match (normalised) → set ghl_contact_id
 *   3. Email match → set ghl_contact_id
 *   4. No match → insert new Supabase contact with status=uncalled
 *
 * @param apiKey         GHL API key
 * @param locationId     GHL location ID
 * @param supabaseUrl    Supabase project URL
 * @param serviceRoleKey Supabase service role key
 * @param page           Page number to fetch from GHL (1-based, default 1)
 * @param pageSize       Contacts per page (max 100, default 100)
 */
async function bulkImportFromGhl(
  apiKey: string,
  locationId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  page = 1,
  pageSize = 100,
) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch one page of GHL contacts
  const ghlResp = await ghlFetch("/contacts/search", apiKey, {
    method: "POST",
    body: {
      locationId,
      pageSize: Math.min(pageSize, 100),
      page,
    },
  });

  const ghlContacts: Array<Record<string, unknown>> = ghlResp.contacts ?? [];
  const meta = ghlResp.meta ?? {};
  const totalGhl = meta.total ?? 0;
  const hasMore = page * pageSize < totalGhl;

  if (ghlContacts.length === 0) {
    return { page, pageSize, totalGhl, hasMore: false, linked: 0, created: 0, skipped: 0, errors: [] };
  }

  let linked = 0;
  let created = 0;
  let skipped = 0;
  const errors: Array<{ ghlId: string; error: string }> = [];

  for (const gc of ghlContacts) {
    const ghlId = gc.id as string;
    if (!ghlId) { skipped++; continue; }

    try {
      // 1. Already linked?
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("ghl_contact_id", ghlId)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      // Normalise phone to canonical E.164
      const rawPhone = (gc.phone as string | undefined ?? "").trim();
      const normPhoneE164 = normalisePhoneE164(rawPhone);

      // 2. Phone match (canonical E.164 against indexed column)
      if (normPhoneE164) {
        const { data: byPhone } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone_e164", normPhoneE164)
          .is("ghl_contact_id", null)
          .maybeSingle();

        if (byPhone) {
          await supabase.from("contacts").update({ ghl_contact_id: ghlId }).eq("id", byPhone.id);
          linked++;
          continue;
        }
      }

      // 3. Email match
      const rawEmail = (gc.email as string | undefined ?? "").trim().toLowerCase();
      if (rawEmail) {
        const { data: byEmail } = await supabase
          .from("contacts")
          .select("id")
          .eq("email", rawEmail)
          .is("ghl_contact_id", null)
          .maybeSingle();

        if (byEmail) {
          await supabase.from("contacts").update({ ghl_contact_id: ghlId }).eq("id", byEmail.id);
          linked++;
          continue;
        }
      }

      // 4. Create new contact from GHL data
      const firstName = (gc.firstName as string ?? "").trim();
      const lastName  = (gc.lastName  as string ?? "").trim();
      const contactPerson = [firstName, lastName].filter(Boolean).join(" ") || null;
      const businessName  = (gc.companyName as string ?? contactPerson ?? "GHL Contact").trim();

      if (!rawPhone && !rawEmail) { skipped++; continue; }

      // DNC guard: check if a DNC'd contact already exists with this phone (canonical match)
      if (normPhoneE164) {
        const { data: dncContact } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone_e164", normPhoneE164)
          .eq("is_dnc", true)
          .maybeSingle();

        if (dncContact) {
          console.log(`[bulk_import_from_ghl] Skipping DNC contact phone_e164=${normPhoneE164} ghlId=${ghlId}`);
          skipped++;
          continue;
        }
      }

      const { error: insertErr } = await supabase.from("contacts").insert({
        business_name:   businessName,
        contact_person:  contactPerson,
        phone:           rawPhone || "unknown",
        email:           rawEmail || null,
        website:         (gc.website as string | undefined) ?? null,
        city:            (gc.city    as string | undefined) ?? null,
        state:           (gc.state   as string | undefined) ?? null,
        industry:        "Unknown",
        status:          "uncalled",
        is_dnc:          false,
        ghl_contact_id:  ghlId,
      });

      if (insertErr) {
        errors.push({ ghlId, error: insertErr.message });
      } else {
        created++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ ghlId, error: msg });
    }
  }

  console.log(`[bulk_import_from_ghl] page=${page} linked=${linked} created=${created} skipped=${skipped} errors=${errors.length}`);

  return {
    page,
    pageSize,
    totalGhl,
    processedOnPage: ghlContacts.length,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    linked,
    created,
    skipped,
    errors: errors.slice(0, 20),
  };
}

// ── Main handler ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GHL_API_KEY = Deno.env.get("GHL_API_KEY");
    if (!GHL_API_KEY) return json({ error: "GHL_API_KEY not configured" }, 500);

    const GHL_LOCATION_ID = Deno.env.get("GHL_LOCATION_ID");
    if (!GHL_LOCATION_ID) return json({ error: "GHL_LOCATION_ID not configured" }, 500);

    // Authenticate the caller via Supabase JWT or service role key
    const authHeader = req.headers.get("Authorization");

    // Cron lane: internal scheduled intake (no JWT, shared secret header)
    const cronSecret = Deno.env.get("DIALPAD_INTERNAL_CRON_SECRET");
    const incomingCronSecret = req.headers.get("x-cron-secret");
    if (!authHeader && cronSecret && incomingCronSecret === cronSecret) {
      const cronBody = await req.json().catch(() => ({}));
      if (cronBody.action !== "pull_inbound_leads") {
        return json({ error: "Unsupported cron action" }, 400);
      }
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const cronResult = await pullInboundLeads(GHL_API_KEY, GHL_LOCATION_ID, supabaseUrl, svcKey, {
        maxPages: Number(cronBody.maxPages) || undefined,
        lookbackMinutes: Number(cronBody.lookbackMinutes) || undefined,
      });
      return json(cronResult);
    }

    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = serviceRoleKey && token === serviceRoleKey;

    let user: { id: string } | null = null;
    let isAdmin = false;

    if (isServiceRole) {
      // Server-to-server call (from database triggers, other edge functions, etc.)
      // Use a system user ID for audit purposes
      user = { id: "system" };
      isAdmin = true;
    } else {
      // Standard JWT auth from frontend
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user: jwtUser }, error: userError } = await supabase.auth.getUser();
      if (userError || !jwtUser) {
        return json({ error: "Unauthorized" }, 401);
      }
      user = jwtUser;

      // Check role from user_roles via service-role client to bypass RLS recursion
      try {
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const sbAdmin = createClient(supabaseUrl, svcKey);
        const { data: roleRow } = await sbAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", jwtUser.id)
          .in("role", ["admin", "coach"])
          .maybeSingle();
        isAdmin = !!roleRow;
      } catch (roleErr) {
        console.error("[GHL] Role lookup failed:", roleErr);
        isAdmin = false;
      }
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (!action) {
      return json({ error: "Missing action" }, 400);
    }

    // Actions that mutate GHL state or perform bulk operations require admin/coach role.
    const privilegedActions = new Set([
      "create_contact",
      "update_contact",
      "update_contact_fields",
      "upsert_contact",
      "add_note",
      "add_tag",
      "create_task",
      "create_opportunity",
      "update_opportunity",
      "create_appointment",
      "create_followup_task",
      "bulk_link_contacts",
      "bulk_import_from_ghl",
      "pull_inbound_leads",
      "relink_from_dialer_id",
      "push_fields_to_ghl",
    ]);
    if (privilegedActions.has(action) && !isAdmin) {
      return json({ error: "Forbidden: admin or coach role required" }, 403);
    }

    let result: unknown;

    switch (action) {
      case "get_location_id":
        result = { locationId: GHL_LOCATION_ID };
        break;

      case "pull_inbound_leads": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        result = await pullInboundLeads(GHL_API_KEY, GHL_LOCATION_ID, supabaseUrl, svcKey, {
          maxPages: Number(body.maxPages) || undefined,
          lookbackMinutes: Number(body.lookbackMinutes) || undefined,
        });
        break;
      }

      case "relink_from_dialer_id": {
        break;
      }

      case "push_fields_to_ghl": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        result = await pushFieldsToGhl(
          GHL_API_KEY,
          supabaseUrl,
          svcKey,
          Number(body.batchSize) || 50,
          Number(body.offset) || 0,
        );
        break;
      }

      case "__relink_from_dialer_id_impl": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        result = await relinkFromDialerId(
          GHL_API_KEY,
          GHL_LOCATION_ID,
          supabaseUrl,
          svcKey,
          Number(body.page) || 1,
          Number(body.pageSize) || 100,
        );
        break;
      }

      case "search_contacts":
        result = await searchContacts(GHL_API_KEY, GHL_LOCATION_ID, body.payload ?? {});
        break;

      case "get_contact":
        if (!body.contactId) return json({ error: "Missing contactId" }, 400);
        result = await getContact(GHL_API_KEY, body.contactId);
        break;

      case "create_contact":
        result = await createContact(GHL_API_KEY, GHL_LOCATION_ID, body.payload ?? {});
        break;

      case "update_contact":
        if (!body.contactId) return json({ error: "Missing contactId" }, 400);
        result = await updateContact(GHL_API_KEY, body.contactId, body.payload ?? {});
        break;

      case "add_note":
        if (!body.contactId) return json({ error: "Missing contactId" }, 400);
        result = await addNote(GHL_API_KEY, body.contactId, body.payload ?? { body: "" });
        break;

      case "add_tag":
        if (!body.contactId) return json({ error: "Missing contactId" }, 400);
        result = await addTag(GHL_API_KEY, body.contactId, body.tags ?? []);
        break;

      case "create_task":
        if (!body.contactId) return json({ error: "Missing contactId" }, 400);
        result = await createTask(GHL_API_KEY, body.contactId, body.payload ?? {});
        break;

      case "create_opportunity":
        result = await createOpportunity(GHL_API_KEY, GHL_LOCATION_ID, body.payload ?? {});
        break;

      case "get_opportunity":
        if (!body.opportunityId) return json({ error: "Missing opportunityId" }, 400);
        result = await getOpportunity(GHL_API_KEY, body.opportunityId);
        break;

      case "create_appointment":
        result = await createCalendarEvent(GHL_API_KEY, GHL_LOCATION_ID, body.payload ?? {});
        break;

      case "get_calendars":
        result = await getCalendars(GHL_API_KEY, GHL_LOCATION_ID);
        break;

      case "get_free_slots": {
        if (!body.calendarId) return json({ error: "Missing calendarId" }, 400);
        if (!body.startDate || !body.endDate) return json({ error: "Missing startDate or endDate" }, 400);
        result = await getCalendarFreeSlots(
          GHL_API_KEY,
          body.calendarId,
          body.startDate,
          body.endDate,
          body.timezone ?? "Australia/Melbourne",
        );
        break;
      }

      case "get_pipelines":
        result = await getPipelines(GHL_API_KEY, GHL_LOCATION_ID);
        break;

      case "get_smart_lists":
        result = await getSmartLists(GHL_API_KEY, GHL_LOCATION_ID);
        break;

      case "get_custom_fields":
        result = await getCustomFields(GHL_API_KEY, GHL_LOCATION_ID);
        break;

      case "get_users":
        result = await getUsers(GHL_API_KEY, GHL_LOCATION_ID);
        break;

      case "update_contact_fields":
        if (!body.contactId) return json({ error: "Missing contactId" }, 400);
        if (!body.customFields || !Array.isArray(body.customFields)) return json({ error: "Missing or invalid customFields array" }, 400);
        result = await updateContactFields(GHL_API_KEY, body.contactId, body.customFields);
        break;

      case "upsert_contact": {
        if (!body.payload?.phone) return json({ error: "Missing payload.phone" }, 400);
        result = await upsertContact(GHL_API_KEY, GHL_LOCATION_ID, body.payload);

        // If supabaseContactId is provided, also update the Supabase contact
        if (body.supabaseContactId && (result as Record<string, unknown>).ghlContactId) {
          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
            const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
            const sb = createClient(supabaseUrl, svcKey);
            await sb.from("contacts").update({
              ghl_contact_id: (result as Record<string, unknown>).ghlContactId,
            }).eq("id", body.supabaseContactId);
          } catch (linkErr) {
            console.error("[GHL] Failed to save ghl_contact_id to Supabase:", linkErr);
          }
        }
        break;
      }

      case "bulk_link_contacts": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        result = await bulkLinkContacts(
          GHL_API_KEY,
          GHL_LOCATION_ID,
          supabaseUrl,
          svcKey,
          body.batchSize ?? 50,
          body.delayMs ?? 6000,
          body.offset ?? 0,
          body.statusFilter === "active" ? "active" : "all",
        );
        break;
      }

      case "bulk_import_from_ghl": {
        // Pull GHL contacts into Supabase — call page by page until hasMore=false
        // Body params: { page?: number, pageSize?: number }
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        result = await bulkImportFromGhl(
          GHL_API_KEY,
          GHL_LOCATION_ID,
          supabaseUrl,
          svcKey,
          body.page ?? 1,
          body.pageSize ?? 100,
        );
        break;
      }

      case "create_followup_task":
        if (!body.contactId) return json({ error: "Missing contactId" }, 400);
        if (!body.payload?.dueDate) return json({ error: "Missing payload.dueDate" }, 400);
        result = await createFollowUpTask(GHL_API_KEY, body.contactId, {
          title: body.payload.title ?? "Follow-Up Call",
          description: body.payload.description,
          dueDate: body.payload.dueDate,
          assignedTo: body.payload.assignedTo,
        });
        break;

      case "update_opportunity":
        if (!body.opportunityId) return json({ error: "Missing opportunityId" }, 400);
        result = await updateOpportunity(GHL_API_KEY, body.opportunityId, body.payload ?? {});
        break;

      case "search_opportunities":
        if (!body.contactId) return json({ error: "Missing contactId" }, 400);
        result = await searchOpportunities(GHL_API_KEY, GHL_LOCATION_ID, body.pipelineId, body.contactId);
        break;

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }

    return json(result);
  } catch (err) {
    console.error("[GHL]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return json({ error: message }, 500);
  }
});
