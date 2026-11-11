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

export type DetailFilterOp = "eq" | "in" | "not_in" | "gte" | "lte" | "contains" | "is_set" | "is_not_set";

/**
 * text: case-insensitive. tri: yes/no/unknown columns. csv: comma-separated list.
 * int: whole numbers. bool: true/false. tags: text[] column.
 */
export type DetailFieldKind = "text" | "tri" | "csv" | "int" | "bool" | "tags";

export type DetailFilterValue = string | number | boolean | Array<string | number>;

export type DetailFilter = {
  field: string;
  op: DetailFilterOp;
  value?: DetailFilterValue;
};

/** Mirrors the tabs and sections of the dialer's Capture details panel. */
export type DetailFieldGroup = "Team & business" | "Qualification" | "Marketing" | "Call intel" | "Decision maker & gatekeeper";

export const DETAIL_GROUPS: readonly DetailFieldGroup[] = [
  "Team & business",
  "Qualification",
  "Marketing",
  "Call intel",
  "Decision maker & gatekeeper",
];

export type DetailFieldDef = {
  field: string;
  label: string;
  kind: DetailFieldKind;
  group: DetailFieldGroup;
  /** Known values, in display order. Fields with options get a pick-list filter. */
  options?: readonly string[];
};

/** Ops each kind supports. Mirrors dialer_detail_predicate() on the server. */
export const KIND_OPS: Record<DetailFieldKind, readonly DetailFilterOp[]> = {
  text: ["in", "not_in", "eq", "contains", "is_set", "is_not_set"],
  tri: ["eq", "in", "not_in", "is_set", "is_not_set"],
  csv: ["in", "eq", "contains", "is_set", "is_not_set"],
  int: ["gte", "lte", "eq", "in", "not_in", "is_set", "is_not_set"],
  bool: ["eq", "is_set", "is_not_set"],
  tags: ["in", "eq", "contains", "is_set", "is_not_set"],
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

// One line per filterable column: every field in the dialer's Capture details
// panel. Keep in step with dialer_detail_fields() on the server.
export const DETAIL_FIELDS: readonly DetailFieldDef[] = [
  // Team & business (Business Profile)
  { field: "business_size", label: "Team size band", kind: "text", group: "Team & business", options: ["One-man band (1-2)", "Team (3+)"] },
  { field: "team_size", label: "Headcount (incl. owner)", kind: "int", group: "Team & business" },
  { field: "number_of_trucks_vans", label: "Trucks / vans", kind: "int", group: "Team & business" },
  { field: "years_in_business", label: "Years in business", kind: "int", group: "Team & business" },
  { field: "work_type", label: "Work type", kind: "text", group: "Team & business", options: ["Residential Only", "Mostly Residential", "Mixed", "Mostly Commercial", "Commercial Only"] },
  { field: "estimated_annual_revenue", label: "Annual revenue", kind: "text", group: "Team & business", options: ["<$500K", "$500K-$1M", "$1M-$2M", "$2M-$5M", "$5M+"] },
  { field: "service_area", label: "Service area", kind: "text", group: "Team & business" },
  { field: "abn", label: "ABN", kind: "text", group: "Team & business" },
  { field: "website", label: "Website", kind: "text", group: "Team & business" },
  // Qualification & buying signals
  { field: "buying_signal_strength", label: "Buying signal", kind: "text", group: "Qualification", options: ["Strong", "Moderate", "Weak", "High", "Medium", "Low"] },
  { field: "need_identified", label: "Need identified", kind: "text", group: "Qualification", options: ["Strong Need", "Moderate Need", "Low Need", "No Need"] },
  { field: "authority_level", label: "Authority level", kind: "text", group: "Qualification", options: ["Decision Maker", "Influencer", "Gatekeeper"] },
  { field: "buying_timeline", label: "Buying timeline", kind: "text", group: "Qualification", options: ["Immediate", "Next week", "Next 30 days", "Next quarter", "Next 6 months", "Next year", "Unknown"] },
  { field: "budget_indication", label: "Budget indication", kind: "text", group: "Qualification" },
  { field: "key_objection", label: "Key objection", kind: "text", group: "Qualification", options: ["Happy with Current", "No Budget", "Bad Timing", "Need to Think", "Bad Experience", "Too Busy", "Not the DM", "No Objection", "Other"] },
  { field: "current_solution_satisfaction", label: "Happy with current solution", kind: "text", group: "Qualification", options: [...SATISFACTION, "No Solution"] },
  { field: "contract_lockin_status", label: "Contract / lock-in", kind: "text", group: "Qualification" },
  // Marketing (Digital Presence, Agency & Competition, Marketing tab)
  { field: "current_monthly_ad_spend", label: "Monthly ad spend", kind: "text", group: "Marketing", options: ["None", "<$500", "$500-$1K", "$1K-$2K", "$2K-$5K", "$5K-$10K", "$10K+"] },
  { field: "current_marketing_channels", label: "Marketing channels", kind: "csv", group: "Marketing", options: ["Word of Mouth", "Website", "Google Business", "Google Ads", "Facebook/Meta Ads", "Social Media", "SEO", "Print/Flyers"] },
  { field: "lead_source_dependency", label: "Lead source dependency", kind: "text", group: "Marketing", options: ["Highly Dependent on Referrals", "Mostly Referrals", "Mixed", "Mostly Digital"] },
  { field: "has_google_ads", label: "Running Google Ads", kind: "tri", group: "Marketing", options: TRI_OPTIONS },
  { field: "has_facebook_ads", label: "Running Meta Ads", kind: "tri", group: "Marketing", options: TRI_OPTIONS },
  { field: "has_seo", label: "Doing SEO", kind: "tri", group: "Marketing", options: TRI_OPTIONS },
  { field: "has_existing_agency", label: "Has an agency", kind: "bool", group: "Marketing" },
  { field: "existing_agency_name", label: "Agency name", kind: "text", group: "Marketing" },
  { field: "existing_agency_services", label: "Agency services", kind: "tags", group: "Marketing", options: ["seo", "google_ads", "meta_ads", "website", "other"] },
  { field: "agency_satisfaction", label: "Agency satisfaction", kind: "text", group: "Marketing", options: [...SATISFACTION, "No Agency"] },
  { field: "existing_agency_notes", label: "Agency notes", kind: "text", group: "Marketing" },
  { field: "marketing_pain_points", label: "Marketing pain points", kind: "text", group: "Marketing" },
  // Call intel (AI Call Intelligence, Call Activity)
  { field: "last_call_sentiment", label: "Last call sentiment", kind: "text", group: "Call intel", options: ["positive", "neutral", "negative"] },
  { field: "problem_resonance", label: "Problem resonance", kind: "text", group: "Call intel", options: ["Strong - Pain Acknowledged", "Moderate - Some Interest", "Weak - Dismissive", "None - No Engagement"] },
  { field: "preferred_contact_method", label: "Preferred contact", kind: "text", group: "Call intel", options: ["Phone", "SMS", "Email", "In Person"] },
  { field: "best_time_to_call", label: "Best time to call", kind: "text", group: "Call intel", options: ["Morning", "Afternoon", "After Hours"] },
  { field: "key_quote", label: "Key quote", kind: "text", group: "Call intel" },
  { field: "agreed_next_steps", label: "Agreed next steps", kind: "text", group: "Call intel" },
  { field: "objection_notes", label: "Objection notes", kind: "text", group: "Call intel" },
  { field: "competitive_intel", label: "Competitive intel", kind: "text", group: "Call intel" },
  { field: "call_intel_summary", label: "AI call summary", kind: "text", group: "Call intel" },
  { field: "call_intel_source", label: "Call intel source", kind: "text", group: "Call intel", options: ["call_transcript"] },
  { field: "team_size_source", label: "Team size source", kind: "text", group: "Call intel", options: ["call_transcript", "rep"] },
  // Decision maker & gatekeeper
  { field: "dm_name", label: "DM name", kind: "text", group: "Decision maker & gatekeeper" },
  { field: "dm_role", label: "DM role", kind: "text", group: "Decision maker & gatekeeper", options: ["Owner", "Director", "Partner", "Manager", "Former Owner"] },
  { field: "dm_phone", label: "DM phone", kind: "text", group: "Decision maker & gatekeeper" },
  { field: "dm_phone_type", label: "DM phone type", kind: "text", group: "Decision maker & gatekeeper", options: ["mobile", "landline", "unknown"] },
  { field: "dm_email", label: "DM email", kind: "text", group: "Decision maker & gatekeeper" },
  { field: "dm_linkedin", label: "DM LinkedIn", kind: "text", group: "Decision maker & gatekeeper" },
  { field: "gatekeeper_name", label: "Gatekeeper name", kind: "text", group: "Decision maker & gatekeeper" },
  { field: "gatekeeper_role", label: "Gatekeeper role", kind: "text", group: "Decision maker & gatekeeper", options: ["Receptionist", "Admin", "Office staff", "Call answering service", "Supervisor", "Apprentice"] },
  { field: "gatekeeper_notes", label: "Gatekeeper notes", kind: "text", group: "Decision maker & gatekeeper" },
  { field: "best_route_to_decision_maker", label: "Best route to DM", kind: "text", group: "Decision maker & gatekeeper" },
];

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
  const label = FIELD_INDEX.get(f.field)?.label ?? f.field;
  if (!opNeedsValue(f.op)) return `${label} ${OP_LABELS[f.op]}`;
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

export type FieldControl = "pick" | "range" | "yesno" | "text";

/** Which control a field gets: pick-list, min/max, yes/no, or captured/contains. */
export function controlFor(def: DetailFieldDef): FieldControl {
  if (def.kind === "int") return "range";
  if (def.kind === "bool") return "yesno";
  if (def.options && def.options.length > 0) return "pick";
  return "text";
}

const CONTROL_OPS: Record<FieldControl, readonly DetailFilterOp[]> = {
  pick: ["in"],
  range: ["gte", "lte"],
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
