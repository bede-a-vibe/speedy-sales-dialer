import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const STATE_ALIASES: Record<string, string> = {
  "new south wales": "NSW",
  nsw: "NSW",
  victoria: "VIC",
  vic: "VIC",
  queensland: "QLD",
  qld: "QLD",
  "south australia": "SA",
  sa: "SA",
  "western australia": "WA",
  wa: "WA",
  tasmania: "TAS",
  tas: "TAS",
  "northern territory": "NT",
  nt: "NT",
  "australian capital territory": "ACT",
  act: "ACT",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function makeKey(businessName: string, phone: string) {
  return `${businessName.toLowerCase()}::${phone.replace(/\s+/g, "")}`;
}

function buildImportedMetadataNote(subtype: string | null, fullAddress: string | null, rating: string | null) {
  const entries = [
    ["Subtype", subtype],
    ["Full address", fullAddress],
    ["Rating", rating],
  ].filter(([, value]) => value);

  if (entries.length === 0) {
    return null;
  }

  return ["Imported builder metadata", ...entries.map(([label, value]) => `${label}: ${value}`)].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ error: "Missing backend configuration." }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) {
      return jsonResponse({ error: "Missing authorization header." }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authorization },
      },
    });

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized." }, 401);
    }

    const { data: adminRole, error: roleError } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) {
      throw roleError;
    }

    if (!adminRole) {
      return jsonResponse({ error: "Only admins can run this import." }, 403);
    }

    const requestBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const fileUrl = typeof requestBody.file_url === "string" ? requestBody.file_url : null;

    if (!fileUrl) {
      return jsonResponse({ error: "Missing file_url." }, 400);
    }

    const workbookResponse = await fetch(fileUrl);
    if (!workbookResponse.ok) {
      return jsonResponse({ error: `Failed to fetch spreadsheet: ${workbookResponse.status}` }, 400);
    }

    const workbookBytes = await workbookResponse.arrayBuffer();
    const workbook = XLSX.read(workbookBytes, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return jsonResponse({ error: "Spreadsheet is empty." }, 400);
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: "",
      raw: false,
    });

    const { data: existingContacts, error: existingError } = await adminClient
      .from("contacts")
      .select("business_name, phone");

    if (existingError) {
      throw existingError;
    }

    const seen = new Set(
      (existingContacts ?? []).map((contact) => makeKey(contact.business_name, contact.phone)),
    );

    const contactsToInsert: Array<{
      id: string;
      business_name: string;
      contact_person: string | null;
      phone: string;
      email: string | null;
      website: string | null;
      gmb_link: string | null;
      industry: string;
      city: string | null;
      state: string | null;
      uploaded_by: string;
    }> = [];
    const contactNotesToInsert: Array<{
      contact_id: string;
      content: string;
      created_by: string;
      source: "manual";
    }> = [];

    let skippedDuplicates = 0;
    let skippedInvalid = 0;

    for (const row of rows) {
      const businessName = normalize(row.name);
      const phone = normalize(row.phone);
      const industry = normalize(row.category) || normalize(row.type) || normalize(row.subtypes) || "Builders";
      const email = normalize(row.email_1) || null;
      const website = normalize(row.site) || null;
      const gmbLink = normalize(row.location_link) || null;
      const city = normalize(row.city) || null;
      const fullAddress = normalize(row.full_address) || null;
      const rating = normalize(row.rating) || null;
      const subtype = normalize(row.subtype) || normalize(row.subtypes) || null;
      const stateRaw = normalize(row.state).toLowerCase();
      const state = (STATE_ALIASES[stateRaw] ?? normalize(row.state)) || null;
      const contactPerson = normalize(row.email_1_full_name) || null;

      if (!businessName || !phone || !industry) {
        skippedInvalid += 1;
        continue;
      }

      const key = makeKey(businessName, phone);
      if (seen.has(key)) {
        skippedDuplicates += 1;
        continue;
      }

      seen.add(key);
      const contactId = crypto.randomUUID();
      contactsToInsert.push({
        id: contactId,
        business_name: businessName,
        contact_person: contactPerson,
        phone,
        email,
        website,
        gmb_link: gmbLink,
        industry,
        city,
        state,
        uploaded_by: user.id,
      });

      const metadataNote = buildImportedMetadataNote(subtype, fullAddress, rating);
      if (metadataNote) {
        contactNotesToInsert.push({
          contact_id: contactId,
          content: metadataNote,
          created_by: user.id,
          source: "manual",
        });
      }
    }

    let inserted = 0;
    let metadataNotesInserted = 0;
    const chunkSize = 200;
    const notesByContactId = new Map(contactNotesToInsert.map((note) => [note.contact_id, note]));

    for (let index = 0; index < contactsToInsert.length; index += chunkSize) {
      const chunk = contactsToInsert.slice(index, index + chunkSize);
      const { error } = await adminClient.from("contacts").insert(chunk);
      if (error) {
        throw error;
      }
      inserted += chunk.length;

      const chunkNotes = chunk.flatMap((contact) => {
        const note = notesByContactId.get(contact.id);
        return note ? [note] : [];
      });

      if (chunkNotes.length > 0) {
        const { error: noteError } = await adminClient.from("contact_notes").insert(chunkNotes);
        if (noteError) {
          throw noteError;
        }
        metadataNotesInserted += chunkNotes.length;
      }
    }

    return jsonResponse({
      inserted,
      metadata_notes_inserted: metadataNotesInserted,
      skipped_duplicates: skippedDuplicates,
      skipped_invalid: skippedInvalid,
      total_rows: rows.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown import error";
    return jsonResponse({ error: message }, 500);
  }
});
