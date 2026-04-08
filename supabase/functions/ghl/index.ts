import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  return ghlFetch("/opportunities/", apiKey, {
    method: "POST",
    body: { ...body, locationId },
  });
}

async function createCalendarEvent(
  apiKey: string,
  body: Record<string, unknown>,
) {
  return ghlFetch("/calendars/events/appointments", apiKey, {
    method: "POST",
    body,
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

async function updateContactFields(
  apiKey: string,
  contactId: string,
  customFields: Array<{ id: string; field_value: unknown }>,
) {
  return ghlFetch(`/contacts/${contactId}`, apiKey, {
    method: "PUT",
    body: { customFields },
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

  // Always include "dialer-linked" tag
  const tags = [...(payload.tags ?? []), "dialer-linked"];
  body.tags = [...new Set(tags)]; // deduplicate

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
        // Found an existing contact with the same company name.
        // Use the existing one and delete the duplicate we just created.
        const existing = existingContacts[0];
        console.log(
          `[GHL Upsert] Phone mismatch but company match: using existing ${existing.id} instead of new ${upsertedId} for "${payload.companyName}"`,
        );

        // Delete the duplicate contact we just created
        try {
          await ghlFetch(`/contacts/${upsertedId}`, apiKey, {
            method: "DELETE",
          });
        } catch (delErr) {
          console.warn(`[GHL Upsert] Failed to delete duplicate ${upsertedId}:`, delErr);
        }

        // Add the dialer-linked tag to the existing contact
        try {
          await ghlFetch(`/contacts/${existing.id}/tags`, apiKey, {
            method: "POST",
            body: { tags: [...new Set(tags)] },
          });
        } catch {
          // Non-critical — tag addition failure is acceptable
        }

        return {
          ghlContactId: existing.id,
          isNew: false,
          contact: existing,
        };
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

async function bulkLinkContacts(
  apiKey: string,
  locationId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  batchSize = 50,
  delayMs = 6000,
) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get all contacts without ghl_contact_id
  const { data: unlinked, error: fetchError } = await supabase
    .from("contacts")
    .select("id, phone, business_name, contact_person, email, website, city, state, industry")
    .or("ghl_contact_id.is.null,ghl_contact_id.eq.")
    .not("phone", "is", null)
    .order("created_at", { ascending: true });

  if (fetchError) {
    throw new Error(`Failed to fetch unlinked contacts: ${fetchError.message}`);
  }

  if (!unlinked || unlinked.length === 0) {
    return { linked: 0, failed: 0, skipped: 0, total: 0 };
  }

  let linked = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ contactId: string; error: string }> = [];

  for (let i = 0; i < unlinked.length; i += batchSize) {
    const batch = unlinked.slice(i, i + batchSize);

    for (const contact of batch) {
      if (!contact.phone || contact.phone.trim() === "") {
        skipped++;
        continue;
      }

      try {
        const tags: string[] = [];
        if (contact.industry) tags.push(`industry:${contact.industry.toLowerCase().replace(/\s+/g, "-")}`);

        const result = await upsertContact(apiKey, locationId, {
          phone: contact.phone,
          companyName: contact.business_name || undefined,
          name: contact.contact_person || contact.business_name || undefined,
          email: contact.email || undefined,
          website: contact.website || undefined,
          city: contact.city || undefined,
          state: contact.state || undefined,
          tags,
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

    // Rate limit pause between batches (skip on last batch)
    if (i + batchSize < unlinked.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }

    console.log(`[Bulk Link] Progress: ${linked + failed + skipped}/${unlinked.length} (linked=${linked}, failed=${failed}, skipped=${skipped})`);
  }

  return {
    total: unlinked.length,
    linked,
    failed,
    skipped,
    errors: errors.slice(0, 50), // Cap error list at 50
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
function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // +61xxxxxxxxx → 0xxxxxxxxx
  if (digits.startsWith("61") && digits.length === 11) return "0" + digits.slice(2);
  if (digits.startsWith("0") && digits.length === 10) return digits;
  return digits;
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

      // Normalise phone
      const rawPhone = (gc.phone as string | undefined ?? "").trim();
      const normPhone = normalisePhone(rawPhone);

      // 2. Phone match
      if (normPhone) {
        const { data: byPhone } = await supabase
          .from("contacts")
          .select("id")
          .or(`phone.eq.${rawPhone},phone.eq.${normPhone}`)
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

      // DNC guard: check if a DNC'd contact already exists with this phone
      if (normPhone) {
        const { data: dncContact } = await supabase
          .from("contacts")
          .select("id, is_dnc")
          .or(`phone.eq.${rawPhone},phone.eq.${normPhone}`)
          .eq("is_dnc", true)
          .maybeSingle();

        if (dncContact) {
          console.log(`[bulk_import_from_ghl] Skipping DNC contact phone=${normPhone} ghlId=${ghlId}`);
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
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const isServiceRole = serviceRoleKey && token === serviceRoleKey;

    let user: { id: string } | null = null;

    if (isServiceRole) {
      // Server-to-server call (from database triggers, other edge functions, etc.)
      // Use a system user ID for audit purposes
      user = { id: "system" };
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
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (!action) {
      return json({ error: "Missing action" }, 400);
    }

    let result: unknown;

    switch (action) {
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

      case "create_appointment":
        result = await createCalendarEvent(GHL_API_KEY, body.payload ?? {});
        break;

      case "get_calendars":
        result = await getCalendars(GHL_API_KEY, GHL_LOCATION_ID);
        break;

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
