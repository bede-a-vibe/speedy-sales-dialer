import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;
export const IMPORT_BATCH = "dialer-2026-08-04";

const STRAIGHT: [string, string][] = [
  ["id", "dialer_contact_id"],
  ["business_name", "business_name"],
  ["phone_e164", "phone"],
  ["email", "email"],
  ["website", "website"],
  ["city", "city"],
  ["state", "state"],
  ["industry", "industry"],
  ["prospect_tier", "prospect_tier"],
  ["call_attempt_count", "dial_count"],
  ["dm_name", "dm_name"],
  ["dm_role", "dm_role"],
  ["dm_phone", "dm_phone"],
  ["dm_email", "dm_email"],
  ["dm_linkedin", "dm_linkedin"],
  ["gatekeeper_name", "gatekeeper_name"],
  ["gatekeeper_notes", "gatekeeper_notes"],
  ["best_route_to_decision_maker", "best_route_to_decision_maker"],
  ["best_time_to_call", "best_time_to_call"],
  ["gmb_link", "gmb_link"],
  ["google_rating", "google_rating"],
  ["google_review_count", "google_review_count"],
  ["has_google_ads", "has_google_ads"],
  ["has_facebook_ads", "has_facebook_ads"],
  ["has_seo", "has_seo"],
  ["buying_signal_strength", "buying_signal_strength"],
  ["buying_timeline", "buying_timeline"],
  ["business_size", "business_size"],
  ["years_in_business", "years_in_business"],
  ["abn", "abn"],
  ["trade_type", "trade_type"],
  ["work_type", "work_type"],
  ["authority_level", "authority_level"],
  ["budget_indication", "budget_indication"],
  ["last_call_sentiment", "last_call_sentiment"],
  ["key_quote", "key_quote"],
  ["agreed_next_steps", "agreed_next_steps"],
  ["follow_up_note", "follow_up_note"],
  ["voicemail_count", "voicemail_count"],
  ["last_called_at", "last_called_at"],
  ["next_followup_date", "next_followup_date"],
  ["existing_agency_name", "existing_agency_name"],
  ["existing_agency_services", "existing_agency_services"],
  ["existing_agency_notes", "existing_agency_notes"],
  ["dnc_reason", "dnc_reason"],
  ["disqualified_reason", "disqualified_reason"],
  ["phone_type", "phone_type"],
  ["phone_number_quality", "phone_number_quality"],
];

export const GHL_EXPORT_HEADERS = [
  ...STRAIGHT.map(([, h]) => h),
  "first_name",
  "last_name",
  "lead_status",
  "lifecycle_stage_ghl",
  "lead_source_channel",
  "vertical",
  "is_shared_number",
  "import_batch",
];

const LEAD_STATUS: Record<string, string> = {
  new: "New",
  attempting: "Attempting",
  connected: "Connected",
  booked: "Booked",
  won: "Booked",
  lost: "Not Interested",
};

const LIFECYCLE_GHL: Record<string, string> = {
  new: "Lead",
  attempting: "Lead",
  connected: "MQL",
  booked: "SQL",
  won: "Customer",
  lost: "Lost",
};

const CHANNEL: Record<string, string> = {
  "cold call": "Cold Call",
  "cold email": "Cold Email",
  website: "Website Form",
  student: "Student",
  referral: "Referral",
  partnership: "Partnership",
  linkedin: "LinkedIn",
};

const VERTICALS: [string, string[]][] = [
  ["Trades & Home Services", ["electric", "plumb", "hvac", "renovat", "builder", "solar", "concret", "roof", "landscap", "paint", "tiler", "fencing", "pool build", "floor", "pest", "tree service", "cleaning", "removalist", "garage door", "glass", "glazing", "weld", "metal fab", "earthmoving", "excavat", "crane", "auto repair", "signage", "carpent", "cabinet", "plaster", "scaffold", "insulation", "building maintenance"]],
  ["Healthcare & Allied Health", ["medical", "health", "physio", "dentist", "chiropract", "veterinar", "podiat", "psycholog", "optometr", "pharmac", "clinic", "myotherap", "osteopath"]],
  ["Property & Real Estate", ["real estate", "property", "conveyanc", "strata"]],
  ["Hospitality & Venues", ["cafe", "restaurant", "brewery", "brewing", "distiller", "accommodation", "holiday park", "caravan", "travel", "tourism", "tours", "cinema", "entertain", "event", "wedding", "venue", "gym", "fitness", "catering", "pub", "hotel", "winery", "amusement", "recreation", "festival"]],
  ["Retail & Ecommerce", ["retail", "clothing", "fashion", "jewell", "furniture", "footwear", "apparel", "boutique", "toy store", "liquor", "butcher", "florist", "pet supp", "pet food", "kitchenware", "mattress", "homeware", "packaging", "stationery", "vape", "sporting goods", "camping equipment", "musical instrument", "store", "shop", "ecommerce"]],
  ["Professional Services", ["lawyer", "accountant", "architect", "it services", "software", "web develop", "web design", "marketing agency", "consult", "engineer", "design", "security", "education", "tutor", "childcare", "training", "school", "driving", "legal", "finance", "insurance", "bookkeep", "recruit", "logistics", "courier", "transport", "printing", "photography", "video", "media"]],
];

function deriveVertical(industry: unknown): string {
  const value = String(industry ?? "").toLowerCase();
  if (!value.trim()) return "Other";
  for (const [label, keywords] of VERTICALS) {
    if (keywords.some((k) => value.includes(k))) return label;
  }
  return "Other";
}

function splitName(row: Record<string, unknown>) {
  const source = [row.contact_person, row.dm_name]
    .map((v) => String(v ?? "").trim())
    .find((v) => v.length > 0);
  if (!source) {
    return { first: String(row.business_name ?? "").trim().slice(0, 80), last: "" };
  }
  const idx = source.indexOf(" ");
  if (idx === -1) return { first: source, last: "" };
  return { first: source.slice(0, idx), last: source.slice(idx + 1).trim() };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildGhlCsv(rows: Record<string, unknown>[]): string {
  const lines: string[] = [GHL_EXPORT_HEADERS.join(",")];
  for (const row of rows) {
    const stage = String(row.lifecycle_stage ?? "").trim();
    const dnc = row.is_dnc === true;
    const channelRaw = String(row.lead_channel ?? "").trim();
    const phone = String(row.phone_e164 ?? "");
    const { first, last } = splitName(row);

    const cells = STRAIGHT.map(([key]) => csvCell(row[key]));
    cells.push(
      csvCell(first),
      csvCell(last),
      csvCell(dnc ? "DNC" : (LEAD_STATUS[stage] ?? "")),
      csvCell(dnc ? "Do Not Contact" : (LIFECYCLE_GHL[stage] ?? "")),
      csvCell(!channelRaw ? "Cold Call" : (CHANNEL[channelRaw.toLowerCase()] ?? "Other")),
      csvCell(deriveVertical(row.industry)),
      csvCell(phone.startsWith("+611300") || phone.startsWith("+611800") ? "yes" : "no"),
      csvCell(IMPORT_BATCH),
    );
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}

/** Pages through contacts 1000 at a time, reporting the running row count. */
export async function fetchAllContactsForGhl(
  onProgress?: (count: number) => void,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .or("is_archived.is.null,is_archived.eq.false")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    all.push(...batch);
    onProgress?.(all.length);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export function downloadGhlCsv(csv: string) {
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dialer-contacts-export-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
