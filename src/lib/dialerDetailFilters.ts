/**
 * Captured-detail filters for the dialer queue and the Contacts page.
 *
 * The queue RPCs (claim_dialer_leads, get_dialer_queue_count) take one jsonb
 * parameter, _detail_filters: an array of {field, op, value}, all of which must
 * match. The server keeps its own whitelist (dialer_detail_fields() in migration
 * 20261111040000_dialer_detail_filters.sql) and rejects anything else.
 *
 * To make another captured column filterable, add one line to DETAIL_FIELDS
 * below and one row to dialer_detail_fields() on the server, with the same kind.
 */

import { GHL_FIELD_FOLDERS, MARKETING_TAB_FIELD_KEYS } from "@/lib/ghlFieldFolders";

export type DetailFilterOp = "eq" | "in" | "not_in" | "gte" | "lte" | "contains" | "is_set" | "is_not_set";

/**
 * text: case-insensitive. tri: yes/no/unknown columns. csv: comma-separated list.
 * int: whole numbers. bool: true/false. tags: text[] column.
 * date: a timestamp compared by Melbourne date (YYYY-MM-DD). num: decimals (ratings, dollars).
 */
export type DetailFieldKind = "text" | "tri" | "csv" | "int" | "num" | "bool" | "tags" | "date";

export type DetailFilterValue = string | number | boolean | Array<string | number>;

export type DetailFilter = {
  field: string;
  op: DetailFilterOp;
  value?: DetailFilterValue;
};

/** The Intelligence tab's folders, with Marketing after Additional Info, as it shows there. */
export type DetailFieldGroup = string;

export const MARKETING_GROUP = "Marketing";

export const DETAIL_GROUPS: readonly DetailFieldGroup[] = GHL_FIELD_FOLDERS.flatMap((f) =>
  f.id === "additional" ? [f.label, MARKETING_GROUP] : [f.label],
);

export type DetailFieldDef = {
  field: string;
  label: string;
  kind: DetailFieldKind;
  group: DetailFieldGroup;
  /** Known values, in display order. Fields with options get a pick-list filter. */
  options?: readonly string[];
  /** Options filled at runtime: "reps" lists the sales reps' names. */
  optionsFrom?: "reps";
};

/** Ops each kind supports. Mirrors dialer_detail_predicate() on the server. */
export const KIND_OPS: Record<DetailFieldKind, readonly DetailFilterOp[]> = {
  text: ["in", "not_in", "eq", "contains", "is_set", "is_not_set"],
  tri: ["eq", "in", "not_in", "is_set", "is_not_set"],
  csv: ["in", "eq", "contains", "is_set", "is_not_set"],
  int: ["gte", "lte", "eq", "in", "not_in", "is_set", "is_not_set"],
  num: ["gte", "lte", "is_set", "is_not_set"],
  bool: ["eq", "is_set", "is_not_set"],
  tags: ["in", "eq", "contains", "is_set", "is_not_set"],
  date: ["gte", "lte", "eq", "is_set", "is_not_set"],
};

export const OP_LABELS: Record<DetailFilterOp, string> = {
  eq: "is",
  in: "is any of",
  not_in: "is none of (blanks kept)",
  gte: "at least",
  lte: "at most",
  contains: "contains",
  is_set: "is captured",
  is_not_set: "is not captured",
};

const TRI_OPTIONS = ["yes", "no", "unknown"] as const;
const SATISFACTION = ["Very Happy", "Satisfied", "Neutral", "Frustrated", "Very Unhappy"] as const;

/**
 * How each column filters: its kind (must match dialer_detail_fields() on the
 * server) and, for pick-lists, its known values. Columns not listed filter as
 * free text. Labels and groups come from the Intelligence tab itself.
 */
const FILTER_META: Record<string, { kind: DetailFieldKind; label?: string; options?: readonly string[]; optionsFrom?: "reps" }> = {
  business_size: { label: "Team size band", kind: "text", options: ["One-man band (1-2)", "Team (3+)"] },
  team_size: { label: "Headcount (incl. owner)", kind: "int" },
  number_of_trucks_vans: { kind: "int" },
  years_in_business: { kind: "int" },
  work_type: { kind: "text", options: ["Residential Only", "Mostly Residential", "Mixed", "Mostly Commercial", "Commercial Only"] },
  estimated_annual_revenue: { kind: "text", options: ["<$500K", "$500K-$1M", "$1M-$2M", "$2M-$5M", "$5M+"] },
  service_area: { kind: "text" },
  abn: { kind: "text" },
  website: { kind: "text" },
  buying_signal_strength: { kind: "text", options: ["Strong", "Moderate", "Weak", "High", "Medium", "Low"] },
  need_identified: { kind: "text", options: ["Strong Need", "Moderate Need", "Low Need", "No Need"] },
  authority_level: { kind: "text", options: ["Decision Maker", "Influencer", "Gatekeeper"] },
  buying_timeline: { kind: "text", options: ["Immediate", "Next week", "Next 30 days", "Next quarter", "Next 6 months", "Next year", "Unknown"] },
  budget_indication: { kind: "text" },
  key_objection: { kind: "text", options: ["Happy with Current", "No Budget", "Bad Timing", "Need to Think", "Bad Experience", "Too Busy", "Not the DM", "No Objection", "Other"] },
  current_solution_satisfaction: { kind: "text", options: [...SATISFACTION, "No Solution"] },
  contract_lockin_status: { kind: "text" },
  current_monthly_ad_spend: { kind: "text", options: ["None", "<$500", "$500-$1K", "$1K-$2K", "$2K-$5K", "$5K-$10K", "$10K+"] },
  current_marketing_channels: { kind: "csv", options: ["Word of Mouth", "Website", "Google Business", "Google Ads", "Facebook/Meta Ads", "Social Media", "SEO", "Print/Flyers"] },
  lead_source_dependency: { kind: "text", options: ["Highly Dependent on Referrals", "Mostly Referrals", "Mixed", "Mostly Digital"] },
  has_google_ads: { kind: "tri", options: TRI_OPTIONS },
  has_facebook_ads: { kind: "tri", options: TRI_OPTIONS },
  has_seo: { kind: "tri", options: TRI_OPTIONS },
  has_existing_agency: { kind: "bool" },
  existing_agency_name: { kind: "text" },
  existing_agency_services: { kind: "tags", options: ["seo", "google_ads", "meta_ads", "website", "other"] },
  agency_satisfaction: { kind: "text", options: [...SATISFACTION, "No Agency"] },
  existing_agency_notes: { kind: "text" },
  marketing_pain_points: { kind: "text" },
  seo_visibility: { kind: "text" },
  last_call_sentiment: { kind: "text", options: ["positive", "neutral", "negative"] },
  problem_resonance: { kind: "text", options: ["Strong - Pain Acknowledged", "Moderate - Some Interest", "Weak - Dismissive", "None - No Engagement"] },
  preferred_contact_method: { kind: "text", options: ["Phone", "SMS", "Email", "In Person"] },
  best_time_to_call: { kind: "text", options: ["Morning", "Afternoon", "After Hours"] },
  key_quote: { kind: "text" },
  agreed_next_steps: { kind: "text" },
  objection_notes: { kind: "text" },
  competitive_intel: { kind: "text" },
  call_intel_summary: { kind: "text" },
  call_intel_source: { kind: "text", options: ["call_transcript"] },
  team_size_source: { kind: "text", options: ["call_transcript", "rep"] },
  lifecycle_stage: { kind: "text", options: ["New", "Attempting", "Connected", "Qualified", "Booked", "Won", "Lost"] },
  lifecycle_reason: { kind: "text" },
  lead_type: { kind: "text", options: ["Cold", "Warm", "Inbound", "Outbound"] },
  lead_channel: { kind: "text", options: ["Ads", "Meta ads", "Cold Call", "Cold Email", "Student", "Website", "Referral", "Partnership", "LinkedIn", "Booked session", "Legacy/Import", "Other"] },
  last_outcome: { kind: "text", options: ["No answer", "Voicemail", "Not interested", "Gatekeeper", "Follow up", "Booked", "Disqualified", "DNC", "Wrong number"] },
  meeting_booked_date: { kind: "date" },
  setter_name: { kind: "text", optionsFrom: "reps" },
  assigned_closer: { kind: "text", optionsFrom: "reps" },
  meeting_source: { kind: "text", options: ["Dialer call", "GHL calendar"] },
  meeting_set_by_role: { kind: "text", options: ["Setter", "Closer (self-booked)"] },
  dm_name: { kind: "text" },
  dm_role: { kind: "text", options: ["Owner", "Director", "Partner", "Manager", "Former Owner"] },
  dm_phone: { kind: "text" },
  dm_phone_type: { kind: "text", options: ["mobile", "landline", "unknown"] },
  dm_email: { kind: "text" },
  dm_linkedin: { kind: "text" },
  gatekeeper_name: { kind: "text" },
  gatekeeper_role: { kind: "text", options: ["Receptionist", "Admin", "Office staff", "Call answering service", "Supervisor", "Apprentice"] },
  gatekeeper_notes: { kind: "text" },
  best_route_to_decision_maker: { kind: "text" },
  mobile_reaches_gatekeeper: { kind: "bool" },
  call_attempt_count: { kind: "int" },
  voicemail_count: { kind: "int" },
  noshow_count: { kind: "int" },
  google_review_count: { kind: "int" },
  nurture_last_email: { kind: "int" },
  google_rating: { kind: "num" },
  monthly_retainer_value: { kind: "num" },
  segment_changed_at: { kind: "date" },
  last_called_at: { kind: "date" },
  next_followup_date: { kind: "date" },
  callback_date: { kind: "date" },
  revival_date: { kind: "date" },
  latest_appointment_scheduled_for: { kind: "date" },
  lead_status: { kind: "text", options: ["New", "Attempting", "Connected", "No Answer", "Voicemail", "Gatekeeper", "Callback Set", "Not Interested", "DNC", "Disqualified", "Booked", "Parked"] },
  brand: { kind: "text", options: ["Odin Digital", "Veritas Digital"] },
  segment: { kind: "text", options: ["SMB", "Mid-Market", "Enterprise"] },
  booking_tier: { kind: "text", options: ["T0", "T1", "T2", "Not Applicable - Non-Ads"] },
  disqualified_reason: { kind: "text", options: ["not_looking_to_grow", "financially_not_qualified"] },
  dnc_reason: { kind: "text", options: ["requested_removal", "wrong_number_repeat", "abusive_or_hostile", "other"] },
  phone_type: { kind: "text", options: ["mobile", "landline", "business_line", "unknown"] },
  phone_number_quality: { kind: "text", options: ["confirmed", "unconfirmed", "suspect"] },
  proposal_format: { kind: "text", options: ["Loom / Video", "PDF Document", "Live Presentation", "Verbal / Call Only"] },
  appointment_status: { kind: "text", options: ["Not Booked", "Unconfirmed", "Confirmed", "Showed", "No Show", "Cancelled", "Invalid"] },
  vertical: { kind: "text", options: ["Trades & Home Services", "Healthcare & Allied Health", "Professional Services", "Retail & Ecommerce", "Hospitality & Venues", "Property & Real Estate", "Other"] },
  prospect_tier: { kind: "text", options: ["Tier 1 - Hot", "Tier 2 - Warm", "Tier 3 - Nurture", "Tier 4 - Long Shot", "Tier 5 - New / No Reviews"] },
};

/**
 * Captured columns the Intelligence tab doesn't list as their own field: the
 * team-size band (the drawer's Team size block), the Marketing tab's own
 * agency answers, and where the call intel came from.
 */
const EXTRA_FIELDS: readonly { field: string; label: string; group: DetailFieldGroup }[] = [
  { field: "business_size", label: "Team size band", group: "General Info" },
  { field: "has_existing_agency", label: "Has Existing Agency", group: MARKETING_GROUP },
  { field: "existing_agency_services", label: "Existing Agency Services", group: MARKETING_GROUP },
  { field: "existing_agency_notes", label: "Existing Agency Notes", group: MARKETING_GROUP },
  { field: "call_intel_source", label: "Call Intel Source", group: "03 Dialer Activity" },
  { field: "team_size_source", label: "Team Size Source", group: "03 Dialer Activity" },
];

/**
 * Every filterable field: each Intelligence-tab field the dialer stores (or
 * works out from the latest booking), in the tab's folders and order, plus
 * EXTRA_FIELDS. Adding a field to the Intelligence tab makes it filterable
 * here; the server needs the same column in dialer_detail_fields().
 */
export const DETAIL_FIELDS: readonly DetailFieldDef[] = (() => {
  const out: DetailFieldDef[] = [];
  const seen = new Set<string>();
  const push = (field: string, label: string, group: DetailFieldGroup) => {
    if (seen.has(field)) return;
    seen.add(field);
    const meta = FILTER_META[field];
    out.push({
      field,
      label: meta?.label ?? label,
      kind: meta?.kind ?? "text",
      group,
      ...(meta?.options ? { options: meta.options } : {}),
      ...(meta?.optionsFrom ? { optionsFrom: meta.optionsFrom } : {}),
    });
  };
  for (const folder of GHL_FIELD_FOLDERS) {
    for (const def of folder.fields) {
      const field = def.supabaseColumn ?? def.derived;
      if (!field) continue;
      push(field, def.label, MARKETING_TAB_FIELD_KEYS.has(def.key) ? MARKETING_GROUP : folder.label);
    }
  }
  for (const extra of EXTRA_FIELDS) push(extra.field, extra.label, extra.group);
  return out;
})();

const FIELD_INDEX = new Map(DETAIL_FIELDS.map((f) => [f.field, f]));

export function getDetailField(field: string): DetailFieldDef | undefined {
  return FIELD_INDEX.get(field);
}

export function opsForField(field: string): readonly DetailFilterOp[] {
  const def = FIELD_INDEX.get(field);
  return def ? KIND_OPS[def.kind] : [];
}

export function opNeedsValue(op: DetailFilterOp) {
  return op !== "is_set" && op !== "is_not_set";
}

export function opTakesList(op: DetailFilterOp) {
  return op === "in" || op === "not_in";
}

const MAX_FILTERS = 25;
const MAX_LIST = 50;

function cleanScalar(kind: DetailFieldKind, raw: unknown): string | number | boolean | null {
  if (kind === "bool") {
    if (raw === true || raw === "true") return true;
    if (raw === false || raw === "false") return false;
    return null;
  }
  if (kind === "date") {
    return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
  }
  if (kind === "num") {
    const n = typeof raw === "number" ? raw : typeof raw === "string" && /^-?\d{1,9}(\.\d{1,4})?$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    return Number.isFinite(n) ? n : null;
  }
  if (kind === "int") {
    const n = typeof raw === "number" ? raw : typeof raw === "string" && /^-?\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
    return Number.isInteger(n) ? n : null;
  }
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  return s.length > 0 && s.length <= 200 ? s : null;
}

/**
 * Keep only criteria the server will accept. Used on anything read back from
 * storage or a saved smart list, so an old or hand-edited entry can't make the
 * queue RPC error out.
 */
export function sanitizeDetailFilters(input: unknown): DetailFilter[] {
  if (!Array.isArray(input)) return [];
  const out: DetailFilter[] = [];
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const { field, op, value } = item as Record<string, unknown>;
    if (typeof field !== "string" || typeof op !== "string") continue;
    const def = FIELD_INDEX.get(field);
    if (!def || !KIND_OPS[def.kind].includes(op as DetailFilterOp)) continue;
    const typedOp = op as DetailFilterOp;
    if (!opNeedsValue(typedOp)) {
      out.push({ field, op: typedOp });
    } else if (opTakesList(typedOp)) {
      if (!Array.isArray(value)) continue;
      const list = value
        .map((v) => cleanScalar(def.kind, v))
        .filter((v): v is string | number => v !== null && typeof v !== "boolean");
      if (list.length === 0 || list.length > MAX_LIST) continue;
      out.push({ field, op: typedOp, value: list });
    } else {
      const v = cleanScalar(def.kind, value);
      if (v === null) continue;
      out.push({ field, op: typedOp, value: v });
    }
    if (out.length >= MAX_FILTERS) break;
  }
  return out;
}

/** What the RPCs get: null when there is nothing to filter on. */
export function detailFiltersForRpc(filters: DetailFilter[] | undefined | null): DetailFilter[] | null {
  const clean = sanitizeDetailFilters(filters ?? []);
  return clean.length > 0 ? clean : null;
}

function formatValue(v: DetailFilterValue | undefined) {
  if (Array.isArray(v)) return v.length > 3 ? `${v.slice(0, 3).join(", ")} +${v.length - 3}` : v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return v == null ? "" : String(v);
}

/** Short label for a filter chip, e.g. "Headcount (incl. owner) at least 5". */
export function describeDetailFilter(f: DetailFilter): string {
  const def = FIELD_INDEX.get(f.field);
  const label = def?.label ?? f.field;
  if (!opNeedsValue(f.op)) return `${label} ${OP_LABELS[f.op]}`;
  if (def?.kind === "date" && (f.op === "gte" || f.op === "lte")) return `${label} ${f.op === "gte" ? "from" : "to"} ${formatValue(f.value)}`;
  if (f.op === "in" && Array.isArray(f.value) && f.value.length === 1) return `${label}: ${f.value[0]}`;
  if (f.op === "in") return `${label}: ${formatValue(f.value)}`;
  if (f.op === "eq") return `${label}: ${formatValue(f.value)}`;
  if (f.op === "not_in") return `${label} not ${formatValue(f.value)}`;
  return `${label} ${OP_LABELS[f.op]} ${formatValue(f.value)}`;
}

// ── Headcount range helpers (team_size gte/lte entries) ────────────────────

export type NumberRange = { min: number | null; max: number | null };

export function getRange(filters: DetailFilter[], field: string): NumberRange {
  const min = filters.find((f) => f.field === field && f.op === "gte");
  const max = filters.find((f) => f.field === field && f.op === "lte");
  return {
    min: typeof min?.value === "number" ? min.value : null,
    max: typeof max?.value === "number" ? max.value : null,
  };
}

/** From/to dates (YYYY-MM-DD) for a date field's gte/lte entries. */
export type DateRange = { from: string | null; to: string | null };

export function getDateRange(filters: DetailFilter[], field: string): DateRange {
  const from = filters.find((f) => f.field === field && f.op === "gte");
  const to = filters.find((f) => f.field === field && f.op === "lte");
  return {
    from: typeof from?.value === "string" ? from.value : null,
    to: typeof to?.value === "string" ? to.value : null,
  };
}

export function setDateRange(filters: DetailFilter[], field: string, range: DateRange): DetailFilter[] {
  const rest = filters.filter((f) => !(f.field === field && (f.op === "gte" || f.op === "lte")));
  const next = [...rest];
  if (range.from) next.push({ field, op: "gte", value: range.from });
  if (range.to) next.push({ field, op: "lte", value: range.to });
  return next;
}

/** Replace the gte/lte entries for a field. Other entries keep their order. */
export function setRange(filters: DetailFilter[], field: string, range: NumberRange): DetailFilter[] {
  const rest = filters.filter((f) => !(f.field === field && (f.op === "gte" || f.op === "lte")));
  const next = [...rest];
  if (range.min !== null) next.push({ field, op: "gte", value: range.min });
  if (range.max !== null) next.push({ field, op: "lte", value: range.max });
  return next;
}

/** Values picked in a quick dropdown: the field's single `in` entry. */
export function getPicked(filters: DetailFilter[], field: string): string[] {
  const entry = filters.find((f) => f.field === field && f.op === "in");
  return Array.isArray(entry?.value) ? entry.value.map(String) : [];
}

export function setPicked(filters: DetailFilter[], field: string, values: string[]): DetailFilter[] {
  const idx = filters.findIndex((f) => f.field === field && f.op === "in");
  if (values.length === 0) return idx === -1 ? filters : filters.filter((_, i) => i !== idx);
  const entry: DetailFilter = { field, op: "in", value: values };
  if (idx === -1) return [...filters, entry];
  return filters.map((f, i) => (i === idx ? entry : f));
}

/** Criteria as a rep thinks of them: a min/max pair on one field counts once. */
export function countDetailCriteria(filters: DetailFilter[]): number {
  const ranges = new Set<string>();
  let n = 0;
  for (const f of filters) {
    if (f.op === "gte" || f.op === "lte") {
      if (ranges.has(f.field)) continue;
      ranges.add(f.field);
    }
    n++;
  }
  return n;
}

/** The single `eq` value for a field (used for the team-size band on Contacts). */
export function getEq(filters: DetailFilter[], field: string): string | null {
  const entry = filters.find((f) => f.field === field && f.op === "eq");
  return entry?.value == null ? null : String(entry.value);
}

export function setEq(filters: DetailFilter[], field: string, value: string | number | boolean | null): DetailFilter[] {
  const rest = filters.filter((f) => !(f.field === field && f.op === "eq"));
  return value === null ? rest : [...rest, { field, op: "eq", value }];
}

// ── Per-field controls in the Captured details panel ───────────────────────

export type FieldControl = "pick" | "range" | "dates" | "yesno" | "text";

/** Which control a field gets: pick-list, min/max, from/to dates, yes/no, or captured/contains. */
export function controlFor(def: DetailFieldDef): FieldControl {
  if (def.kind === "int" || def.kind === "num") return "range";
  if (def.kind === "date") return "dates";
  if (def.kind === "bool") return "yesno";
  if ((def.options && def.options.length > 0) || def.optionsFrom) return "pick";
  return "text";
}

const CONTROL_OPS: Record<FieldControl, readonly DetailFilterOp[]> = {
  pick: ["in"],
  range: ["gte", "lte"],
  dates: ["gte", "lte"],
  yesno: ["eq"],
  text: ["is_set", "is_not_set", "contains"],
};

/** True when the field's own control shows this criterion (so it needs no chip). */
export function controlOwns(f: DetailFilter): boolean {
  const def = FIELD_INDEX.get(f.field);
  return def ? CONTROL_OPS[controlFor(def)].includes(f.op) : false;
}

export type TextMode = "any" | "is_set" | "is_not_set" | "contains";

export function getTextMode(filters: DetailFilter[], field: string): { mode: TextMode; text: string } {
  const entry = filters.find((f) => f.field === field && (f.op === "is_set" || f.op === "is_not_set" || f.op === "contains"));
  if (!entry) return { mode: "any", text: "" };
  return { mode: entry.op as TextMode, text: entry.op === "contains" ? String(entry.value ?? "") : "" };
}

/** Replace the field's captured/contains entry. An empty "contains" is kept as typed-in-progress only in the UI. */
export function setTextMode(filters: DetailFilter[], field: string, mode: TextMode, text = ""): DetailFilter[] {
  const idx = filters.findIndex((f) => f.field === field && (f.op === "is_set" || f.op === "is_not_set" || f.op === "contains"));
  const rest = idx === -1 ? filters : filters.filter((_, i) => i !== idx);
  let entry: DetailFilter | null = null;
  if (mode === "is_set" || mode === "is_not_set") entry = { field, op: mode };
  if (mode === "contains" && text.trim()) entry = { field, op: "contains", value: text.trim() };
  if (!entry) return rest;
  if (idx === -1) return [...rest, entry];
  const next = [...rest];
  next.splice(idx, 0, entry);
  return next;
}

/** Number of criteria set on fields in one group (a min/max pair counts once). */
export function countInGroup(filters: DetailFilter[], group: DetailFieldGroup): number {
  return countDetailCriteria(filters.filter((f) => FIELD_INDEX.get(f.field)?.group === group));
}

// ── Old per-field dialer filters → captured-detail criteria ─────────────────

/**
 * Filters the dialer used to have as their own dropdowns under Advanced
 * enrichment. They now live in Captured details, so saved smart lists and
 * stored filters that still carry them are translated on load.
 */
export type LegacyDetailFilterFields = {
  workType?: string;
  buyingSignalStrength?: string;
  hasGoogleAds?: string;
  hasFacebookAds?: string;
  hasDmPhone?: string;
  hasExistingAgency?: string;
  existingAgencyServices?: string[];
};

const TRI_VALUES = new Set(["yes", "no", "unknown"]);

export function legacyToDetailFilters(legacy: LegacyDetailFilterFields | null | undefined): DetailFilter[] {
  if (!legacy) return [];
  const out: DetailFilter[] = [];
  const pick = (field: string, v: string | undefined) => {
    if (v && v !== "all") out.push({ field, op: "in", value: [v] });
  };
  pick("work_type", legacy.workType);
  pick("buying_signal_strength", legacy.buyingSignalStrength);
  // Older saved values like "Yes - Active" never matched a row; drop them.
  if (legacy.hasGoogleAds && TRI_VALUES.has(legacy.hasGoogleAds)) pick("has_google_ads", legacy.hasGoogleAds);
  if (legacy.hasFacebookAds && TRI_VALUES.has(legacy.hasFacebookAds)) pick("has_facebook_ads", legacy.hasFacebookAds);
  if (legacy.hasDmPhone === "yes") out.push({ field: "dm_phone", op: "is_set" });
  if (legacy.hasDmPhone === "no") out.push({ field: "dm_phone", op: "is_not_set" });
  if (legacy.hasExistingAgency === "yes") out.push({ field: "has_existing_agency", op: "eq", value: true });
  if (legacy.hasExistingAgency === "no") out.push({ field: "has_existing_agency", op: "eq", value: false });
  if (legacy.existingAgencyServices && legacy.existingAgencyServices.length > 0) {
    out.push({ field: "existing_agency_services", op: "in", value: legacy.existingAgencyServices });
  }
  return sanitizeDetailFilters(out);
}

/** Add criteria for fields/ops not already present (existing entries win). */
export function mergeDetailFilters(base: DetailFilter[], extra: DetailFilter[]): DetailFilter[] {
  const out = [...base];
  for (const f of extra) {
    if (!out.some((b) => b.field === f.field && b.op === f.op)) out.push(f);
  }
  return out;
}
