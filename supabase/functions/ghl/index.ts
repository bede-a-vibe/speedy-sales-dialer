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

    // Authenticate the caller via Supabase JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return json({ error: "Unauthorized" }, 401);
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
