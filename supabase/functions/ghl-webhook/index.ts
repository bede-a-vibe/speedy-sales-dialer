import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * GHL Webhook Receiver
 *
 * Receives inbound contact events from GoHighLevel and syncs them into
 * the Supabase contacts table.
 *
 * Supported event types:
 *   ContactCreate  – create or link a Supabase contact
 *   ContactUpdate  – update non-dialer fields on existing contact
 *   ContactDelete  – mark contact as inactive (does NOT delete; preserves call history)
 *   ContactDndUpdate – reflect DNC status changes from GHL
 *   ContactTagUpdate – no-op (tags are GHL-managed)
 *
 * Matching priority:
 *   1. ghl_contact_id exact match
 *   2. Normalised phone number match
 *   3. Email match
 *   4. Create new record (ContactCreate only)
 *
 * Security:
 *   Set GHL_WEBHOOK_SECRET as a Supabase Edge Function secret.
 *   In GHL → Settings → Webhooks, add the secret as a custom header:
 *     X-GHL-Signature: <your-secret>
 *   If the env var is not set, the secret check is skipped (useful for testing).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-signature",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Phone normalisation ──────────────────────────────────────────────────────
// Canonical format: strict E.164. AU local numbers are normalised to +61.
function normalizePhoneE164(raw: string | null | undefined): string | null {
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

// ── GHL event → Supabase contact field mapping ───────────────────────────────
interface GHLContactEvent {
  type: string;
  locationId?: string;
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phone?: string;
  email?: string;
  companyName?: string;
  city?: string;
  state?: string;
  website?: string;
  tags?: string[];
  customFields?: unknown;
  customData?: unknown;
  dnd?: boolean;
  // GHL sometimes sends the contact nested under a "contact" key
  contact?: Partial<GHLContactEvent>;
}

function getCustomFieldValue(source: unknown, aliases: string[]): string | null {
  if (!source) return null;
  const normalizedAliases = aliases.map((a) => a.toLowerCase());

  // Object shape: { trade_type: "Plumber", ... }
  if (typeof source === "object" && !Array.isArray(source)) {
    const obj = source as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (!normalizedAliases.includes(key.toLowerCase())) continue;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  // Array shape: [{ key/name/fieldKey: "trade_type", value: "Plumber" }, ...]
  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const key = String(row.key ?? row.name ?? row.fieldKey ?? row.field_key ?? "").toLowerCase();
      if (!normalizedAliases.includes(key)) continue;
      const value = row.value ?? row.fieldValue ?? row.field_value ?? row.text;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return null;
}

function getCustomFieldAliasMap() {
  const defaults: Record<string, string[]> = {
    trade_type: ["trade_type", "trade", "tradeType"],
    work_type: ["work_type", "workType"],
    business_size: ["business_size", "businessSize"],
    prospect_tier: ["prospect_tier", "prospectTier"],
    buying_signal_strength: ["buying_signal_strength", "buyingSignalStrength"],
  };

  const raw = Deno.env.get("GHL_CUSTOM_FIELD_ALIAS_MAP");
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue;
      const normalized = value
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim());
      if (normalized.length > 0) {
        defaults[key] = normalized;
      }
    }
  } catch (error) {
    console.warn("[ghl-webhook] Invalid GHL_CUSTOM_FIELD_ALIAS_MAP JSON:", error);
  }

  return defaults;
}

function mapGhlToSupabase(event: GHLContactEvent): Record<string, unknown> {
  // GHL may nest fields under event.contact; merge both layers
  const src = { ...event, ...(event.contact ?? {}) };

  const firstName = src.firstName?.trim() ?? "";
  const lastName = src.lastName?.trim() ?? "";
  const contactPerson = src.name?.trim() ||
    [firstName, lastName].filter(Boolean).join(" ") ||
    null;

  const fields: Record<string, unknown> = {
    ghl_contact_id: src.id,
    updated_at: new Date().toISOString(),
  };

  if (src.companyName)  fields.business_name = src.companyName.trim();
  if (contactPerson)    fields.contact_person = contactPerson;
  if (src.phone) {
    fields.phone = src.phone.trim();
    fields.phone_e164 = normalizePhoneE164(src.phone) ?? null;
  }
  if (src.email)        fields.email = src.email.trim().toLowerCase();
  if (src.website)      fields.website = src.website.trim();
  if (src.city)         fields.city = src.city.trim();
  if (src.state)        fields.state = src.state.trim();

  // Optional dialer filter fields from GHL custom fields.
  const aliasMap = getCustomFieldAliasMap();
  const customBlob = src.customFields ?? src.customData ?? null;
  const tradeType = getCustomFieldValue(customBlob, aliasMap.trade_type ?? []);
  const workType = getCustomFieldValue(customBlob, aliasMap.work_type ?? []);
  const businessSize = getCustomFieldValue(customBlob, aliasMap.business_size ?? []);
  const prospectTier = getCustomFieldValue(customBlob, aliasMap.prospect_tier ?? []);
  const buyingSignal = getCustomFieldValue(customBlob, aliasMap.buying_signal_strength ?? []);

  if (tradeType) fields.trade_type = tradeType;
  if (workType) fields.work_type = workType;
  if (businessSize) fields.business_size = businessSize;
  if (prospectTier) fields.prospect_tier = prospectTier;
  if (buyingSignal) fields.buying_signal_strength = buyingSignal;

  return fields;
}

async function nudgePendingGhlPushesForContact(
  supabase: ReturnType<typeof createClient>,
  contactId: string,
) {
  const { error, count } = await supabase
    .from("pending_ghl_pushes")
    .update({
      status: "pending",
      next_retry_at: new Date().toISOString(),
      last_error: "GHL contact link refreshed by webhook",
      updated_at: new Date().toISOString(),
    })
    .eq("contact_id", contactId)
    .in("status", ["pending", "failed"])
    .select("id", { count: "exact", head: true });

  if (error) {
    console.warn(`[ghl-webhook] Failed to nudge pending GHL pushes for ${contactId}:`, error.message);
    return;
  }

  if ((count ?? 0) > 0) {
    console.log(`[ghl-webhook] Requeued ${count} pending GHL push(es) for contact ${contactId}`);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Secret validation ──────────────────────────────────────────────────
  const webhookSecret = Deno.env.get("GHL_WEBHOOK_SECRET");
  if (webhookSecret) {
    const incomingSignature = req.headers.get("x-ghl-signature") ??
      req.headers.get("x-webhook-secret");
    if (incomingSignature !== webhookSecret) {
      console.warn("[ghl-webhook] Invalid or missing signature");
      return json({ error: "Unauthorized" }, 401);
    }
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  let event: GHLContactEvent;
  try {
    event = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const eventType = event.type ?? "";
  const ghlContactId = event.id ?? event.contact?.id ?? "";

  console.log(`[ghl-webhook] Received event type=${eventType} ghlContactId=${ghlContactId}`);

  if (!ghlContactId) {
    return json({ error: "Missing contact id in webhook payload" }, 400);
  }

  // ── Supabase client (service role — bypasses RLS) ──────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase env vars not configured" }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ── Route event types ──────────────────────────────────────────────────

  if (eventType === "ContactDndUpdate") {
    // Reflect Do-Not-Disturb (DNC) changes from GHL
    const isDnc = event.dnd === true || event.contact?.dnd === true;

    const updatePayload: Record<string, unknown> = {
      is_dnc: isDnc,
      updated_at: new Date().toISOString(),
    };
    // If GHL marks DNC, also set dialer status to 'dnc' for queue exclusion
    if (isDnc) {
      updatePayload.status = "dnc";
    }

    const { error } = await supabase
      .from("contacts")
      .update(updatePayload)
      .eq("ghl_contact_id", ghlContactId);

    if (error) {
      console.error("[ghl-webhook] DND update failed:", error.message);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, action: "dnd_updated", ghlContactId, isDnc });
  }

  if (eventType === "ContactDelete") {
    // Do NOT delete from Supabase — we need to preserve call history.
    // Instead, tag the contact so the dialer skips it.
    const { error } = await supabase
      .from("contacts")
      .update({
        is_dnc: true,
        status: "called",
        updated_at: new Date().toISOString(),
      })
      .eq("ghl_contact_id", ghlContactId);

    if (error) {
      console.error("[ghl-webhook] Delete/deactivate failed:", error.message);
      return json({ error: error.message }, 500);
    }
    console.log(`[ghl-webhook] Contact ${ghlContactId} deactivated (GHL delete event)`);
    return json({ ok: true, action: "deactivated", ghlContactId });
  }

  if (eventType === "ContactTagUpdate") {
    // Tags are GHL-managed; no Supabase action required.
    return json({ ok: true, action: "ignored", reason: "tag updates are GHL-managed" });
  }

  if (eventType !== "ContactCreate" && eventType !== "ContactUpdate") {
    console.log(`[ghl-webhook] Unhandled event type: ${eventType}`);
    return json({ ok: true, action: "ignored", eventType });
  }

  // ── ContactCreate / ContactUpdate ──────────────────────────────────────

  const fields = mapGhlToSupabase(event);

  // 1. Try to find by ghl_contact_id
  const { data: byId } = await supabase
    .from("contacts")
    .select("id, ghl_contact_id, status, is_dnc")
    .eq("ghl_contact_id", ghlContactId)
    .maybeSingle();

  if (byId) {
    // Found — update non-dialer fields only
    // Never overwrite: status, last_outcome, is_dnc (unless ContactDndUpdate), call_attempt_count
    const updatePayload = { ...fields };
    delete updatePayload.ghl_contact_id; // already matched
    // Protect dialer-owned fields from being overwritten by GHL updates
    delete updatePayload.status;
    delete updatePayload.is_dnc;

    const { error } = await supabase
      .from("contacts")
      .update(updatePayload)
      .eq("id", byId.id);

    if (error) {
      console.error("[ghl-webhook] Update by id failed:", error.message);
      return json({ error: error.message }, 500);
    }
    await nudgePendingGhlPushesForContact(supabase, byId.id);
    console.log(`[ghl-webhook] Updated contact ${byId.id} via ghl_contact_id`);
    return json({ ok: true, action: "updated", supabaseContactId: byId.id, ghlContactId });
  }

  // 2. Try phone match (strict E.164)
  const rawPhone = (event.phone ?? event.contact?.phone ?? "").trim();
  const normPhoneE164 = normalizePhoneE164(rawPhone);

  if (normPhoneE164) {
    const { data: byPhone } = await supabase
      .from("contacts")
      .select("id, phone, phone_e164, ghl_contact_id")
      .eq("phone_e164", normPhoneE164)
      .is("ghl_contact_id", null)
      .maybeSingle();

    if (byPhone) {
      const updatePayload = { ...fields };
      const { error } = await supabase
        .from("contacts")
        .update(updatePayload)
        .eq("id", byPhone.id);

      if (error) {
        console.error("[ghl-webhook] Update by phone failed:", error.message);
        return json({ error: error.message }, 500);
      }
      await nudgePendingGhlPushesForContact(supabase, byPhone.id);
      console.log(`[ghl-webhook] Linked contact ${byPhone.id} via phone match`);
      return json({ ok: true, action: "linked_by_phone", supabaseContactId: byPhone.id, ghlContactId });
    }
  }

  // 3. Try email match
  const rawEmail = (event.email ?? event.contact?.email ?? "").trim().toLowerCase();

  if (rawEmail) {
    const { data: byEmail } = await supabase
      .from("contacts")
      .select("id, email, ghl_contact_id")
      .eq("email", rawEmail)
      .is("ghl_contact_id", null)
      .maybeSingle();

    if (byEmail) {
      const { error } = await supabase
        .from("contacts")
        .update(fields)
        .eq("id", byEmail.id);

      if (error) {
        console.error("[ghl-webhook] Update by email failed:", error.message);
        return json({ error: error.message }, 500);
      }
      await nudgePendingGhlPushesForContact(supabase, byEmail.id);
      console.log(`[ghl-webhook] Linked contact ${byEmail.id} via email match`);
      return json({ ok: true, action: "linked_by_email", supabaseContactId: byEmail.id, ghlContactId });
    }
  }

  // 4. ContactCreate only — no match found, create new contact
  if (eventType === "ContactCreate") {
    if (!rawPhone && !rawEmail) {
      // Cannot create a useful contact without phone or email
      console.warn(`[ghl-webhook] ContactCreate ${ghlContactId}: no phone or email — skipping`);
      return json({ ok: true, action: "skipped", reason: "no phone or email in payload" });
    }

    // industry is NOT NULL on the table — default to 'Unknown' for GHL-sourced contacts
    const newContact: Record<string, unknown> = {
      business_name: fields.business_name ?? fields.contact_person ?? "GHL Contact",
      contact_person: fields.contact_person ?? null,
      phone: rawPhone || "unknown",
      phone_e164: normalizePhoneE164(rawPhone),
      email: rawEmail || null,
      website: fields.website ?? null,
      city: fields.city ?? null,
      state: fields.state ?? null,
      industry: "Unknown",
      status: "uncalled",
      is_dnc: false,
      ghl_contact_id: ghlContactId,
    };

    const { data: created, error } = await supabase
      .from("contacts")
      .insert(newContact)
      .select("id")
      .single();

    if (error) {
      console.error("[ghl-webhook] Insert failed:", error.message);
      return json({ error: error.message }, 500);
    }

    await nudgePendingGhlPushesForContact(supabase, created.id);
    console.log(`[ghl-webhook] Created new contact ${created.id} from GHL`);
    return json({ ok: true, action: "created", supabaseContactId: created.id, ghlContactId });
  }

  // ContactUpdate with no match — log and move on
  console.log(`[ghl-webhook] ContactUpdate ${ghlContactId}: no matching Supabase contact found — no action`);
  return json({ ok: true, action: "no_match", ghlContactId });
});
