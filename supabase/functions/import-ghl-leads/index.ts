import { createClient } from "npm:@supabase/supabase-js@2";

const GHL_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID = "N6ZNHc1OmVcRne4Sprhq";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  if (!digits.startsWith("61") && digits.startsWith("0")) {
    digits = "61" + digits.slice(1);
  }
  return "+" + digits;
}

function pick<T>(...vals: (T | null | undefined | "")[]): T | null {
  for (const v of vals) if (v !== null && v !== undefined && v !== "") return v as T;
  return null;
}

function trimJoin(a?: string, b?: string) {
  return [a, b].map((x) => (x ?? "").trim()).filter(Boolean).join(" ").trim() || null;
}

const OUTBOUND_TAG_HINTS = [
  "lost", "nurture", "ghost", "no show", "no-show", "cancel", "follow up",
  "long term", "setter", "cold call", "zoho",
];
const WARM_TAG_HINTS = [
  "linkedin", "cold email", "student", "referral", "partnership", "website",
  "offer", "contact form", "ads", "typeform", "discovery", "growth session",
  "strategy session",
];

function classifyLeadType(tags: string[], source: string): "warm" | "outbound" {
  const hay = [source, ...tags].map((t) => (t ?? "").toLowerCase());
  const anyMatch = (arr: string[]) => hay.some((t) => arr.some((h) => t.includes(h)));
  const isOutbound = anyMatch(OUTBOUND_TAG_HINTS);
  const isWarm = anyMatch(WARM_TAG_HINTS);
  if (isOutbound && !isWarm) return "outbound";
  return "warm";
}

function classifyLeadChannel(tags: string[], source: string): string {
  const hay = [source, ...tags].map((t) => (t ?? "").toLowerCase()).join(" | ");
  const test = (needles: string[]) => needles.some((n) => hay.includes(n));
  if (test(["linkedin"])) return "LinkedIn";
  if (test(["cold email"])) return "Cold Email";
  if (test(["student"])) return "Student";
  if (test(["referral"])) return "Referral";
  if (test(["partnership"])) return "Partnership";
  if (test(["website", "offer", "contact form"])) return "Website";
  if (test(["ads", "typeform"])) return "Ads";
  if (test(["cold call", "setter"])) return "Cold Call";
  if (test(["discovery", "growth session", "strategy session"])) return "Booked session";
  if (test(["veritas", "zoho", "xero", "import"])) return "Legacy/Import";
  return "Other";
}

function classifyIndustry(tags: string[], companyName: string | null): string | null {
  const lowerTags = tags.map((t) => (t ?? "").toLowerCase().trim());
  const has = (t: string) => lowerTags.includes(t);
  const anyIncludes = (needle: string) => lowerTags.some((t) => t.includes(needle));

  if (has("electrical")) return "Electricians";
  if (has("hvac & electricians au")) return "HVAC";
  if (has("plumbing") || has("plumbers au")) return "Plumbers";
  if (has("hvac")) return "HVAC";
  if (has("refrigeration")) return "Refrigeration";
  if (has("renovations") || has("renovators au")) return "Renovators";
  if (has("building & construction") || has("builders au")) return "Builders";
  if (has("roofing")) return "Roofers";
  // secondary: substring in tags
  if (anyIncludes("plumb")) return "Plumbers";
  if (anyIncludes("electric")) return "Electricians";
  if (anyIncludes("hvac") || anyIncludes("air con")) return "HVAC";
  if (anyIncludes("roof")) return "Roofers";

  const cn = (companyName ?? "").toLowerCase();
  if (!cn) return null;
  if (cn.includes("plumb")) return "Plumbers";
  if (cn.includes("electric")) return "Electricians";
  if (cn.includes("air con") || cn.includes("hvac")) return "HVAC";
  if (cn.includes("refrig")) return "Refrigeration";
  if (cn.includes("roof")) return "Roofers";
  if (cn.includes("paint")) return "Painters";
  if (cn.includes("solar")) return "Solar Installers";
  if (cn.includes("renov")) return "Renovators";
  if (cn.includes("build") || cn.includes("construct")) return "Builders";
  if (cn.includes("landscap")) return "Landscaping";
  return null;
}

function classifyTradeType(industry: string | null): string | null {
  switch (industry) {
    case "Plumbers": return "Plumbing";
    case "Electricians": return "Electrical";
    case "HVAC":
    case "Refrigeration": return "HVAC";
    case "Renovators": return "Renovations";
    case "Builders": return "Building & Construction";
    default: return null;
  }
}

const AU_STATES = new Set(["vic", "nsw", "qld", "wa", "sa", "nt", "act", "tas"]);
function classifyState(tags: string[]): string | null {
  for (const t of tags) {
    const l = (t ?? "").toLowerCase().trim();
    if (AU_STATES.has(l)) return l.toUpperCase();
  }
  return null;
}

interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  companyName?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  source?: string;
  dnd?: boolean;
  searchAfter?: unknown[];
}

async function ghlSearchContacts(cursor: unknown[] | null): Promise<{ contacts: GhlContact[]; total: number }> {
  const body: Record<string, unknown> = { locationId: LOCATION_ID, pageLimit: 100 };
  if (cursor && Array.isArray(cursor) && cursor.length > 0) body.searchAfter = cursor;
  const res = await fetch(`${GHL_BASE}/contacts/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("ORIGINAL_GHL_PIT")}`,
      Version: "2021-07-28",
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": UA,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL search failed ${res.status}: ${text.slice(0, 300)}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load state
    const { data: state, error: stateErr } = await supabase
      .from("ghl_import_state").select("*").eq("id", 1).maybeSingle();
    if (stateErr) throw stateErr;
    if (!state) throw new Error("ghl_import_state row missing");
    if (state.done) return json({ done: true });

    let cursor: unknown[] | null = (state.cursor as unknown[] | null) ?? null;
    let processed = 0;
    let imported = 0;
    let skipped_dupe = 0;
    let skipped_excluded = 0;
    let done = false;

    const startedAt = Date.now();
    const MAX_PAGES = 5;
    const MAX_MS = 55_000;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (Date.now() - startedAt > MAX_MS) break;

      const { contacts } = await ghlSearchContacts(cursor);
      if (!contacts || contacts.length === 0) { done = true; break; }

      for (const c of contacts) {
        processed++;
        try {
          const phoneRaw = c.phone ?? null;
          if (!phoneRaw) continue; // no phone → silent skip
          if (c.dnd === true) continue;

          // excluded list
          const { data: excl } = await supabase
            .from("ghl_import_exclude").select("ghl_id").eq("ghl_id", c.id).maybeSingle();
          if (excl) { skipped_excluded++; continue; }

          const phoneE164 = normalizePhone(phoneRaw);
          if (!phoneE164) continue;

          // dupe check: normalized phone match OR ghl_contact_id match
          const { data: dupeByPhone } = await supabase
            .from("contacts")
            .select("id")
            .filter("phone_e164", "eq", phoneE164)
            .limit(1);
          let isDupe = !!(dupeByPhone && dupeByPhone.length);
          if (!isDupe) {
            const { data: dupeByGhl } = await supabase
              .from("contacts").select("id").eq("ghl_contact_id", c.id).limit(1);
            isDupe = !!(dupeByGhl && dupeByGhl.length);
          }
          if (!isDupe) {
            // fallback broader phone match via regex-normalized comparison
            const { data: dupeLoose } = await supabase
              .from("contacts")
              .select("id, phone, phone_e164")
              .or(`phone.eq.${phoneRaw},phone_e164.eq.${phoneE164}`)
              .limit(1);
            isDupe = !!(dupeLoose && dupeLoose.length);
          }
          if (isDupe) { skipped_dupe++; continue; }

          const tags = Array.isArray(c.tags) ? c.tags : [];
          const contactPerson = trimJoin(c.firstName, c.lastName);
          const business_name =
            pick<string>(c.companyName, contactPerson ?? "", c.contactName ?? "") ?? "Unknown";
          const source = c.source ?? "";
          const lead_type = classifyLeadType(tags, source);
          const lead_channel = classifyLeadChannel(tags, source);
          const industry = classifyIndustry(tags, c.companyName ?? null) ?? "Other";
          const trade_type = classifyTradeType(industry);
          const stateCode = classifyState(tags);

          const insertRow: Record<string, unknown> = {
            business_name,
            contact_person: contactPerson,
            phone: phoneRaw,
            phone_e164: phoneE164,
            email: c.email ?? null,
            status: "uncalled",
            ghl_contact_id: c.id,
            lead_source: source || null,
            lead_type,
            lead_channel,
            industry,
            trade_type,
            state: stateCode,
            dm_enrich_attempted: false,
          };

          const { error: insErr } = await supabase.from("contacts").insert(insertRow);
          if (insErr) {
            console.error(`insert failed for ${c.id}:`, insErr.message);
            continue;
          }
          imported++;
        } catch (e) {
          console.error(`contact ${c?.id} error:`, (e as Error).message);
        }
      }

      // advance cursor to last contact's searchAfter
      const last = contacts[contacts.length - 1];
      if (last?.searchAfter && Array.isArray(last.searchAfter)) {
        cursor = last.searchAfter;
      } else {
        done = true; break;
      }
    }

    // Persist state
    const { error: updErr } = await supabase.from("ghl_import_state").update({
      cursor,
      done,
      imported: (state.imported ?? 0) + imported,
      skipped_dupe: (state.skipped_dupe ?? 0) + skipped_dupe,
      skipped_excluded: (state.skipped_excluded ?? 0) + skipped_excluded,
      updated_at: new Date().toISOString(),
    }).eq("id", 1);
    if (updErr) console.error("state update failed:", updErr.message);

    return json({
      processed,
      imported,
      skipped_dupe,
      skipped_excluded,
      remaining_cursor_set: !!cursor && !done,
      done,
    });
  } catch (e) {
    console.error("import-ghl-leads fatal:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});