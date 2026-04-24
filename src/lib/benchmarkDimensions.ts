/**
 * Benchmark dimensions for the Custom Monitor "Compare by" feature.
 *
 * Each dimension knows how to extract a category value from a call_log row
 * (via its joined `contacts` relation) and from a booked pipeline item
 * (also via its joined `contacts` relation). The same logic is used to
 * populate the "Values" multi-select dropdown.
 */

type ContactSlice = {
  industry?: string | null;
  trade_type?: string | null;
  state?: string | null;
  business_size?: string | null;
  work_type?: string | null;
  prospect_tier?: string | null;
  buying_signal_strength?: string | null;
  phone_type?: string | null;
  has_google_ads?: string | null;
  has_facebook_ads?: string | null;
  dm_phone?: string | null;
  gbp_rating?: number | null;
  review_count?: number | null;
};

type RowWithContact = { contacts?: ContactSlice | null };

export const BENCHMARK_NONE = "none" as const;

export interface BenchmarkDimension {
  id: string;
  label: string;
  /** Returns the category bucket label for a row, or null to skip the row entirely. */
  getValue: (row: RowWithContact) => string | null;
}

const UNKNOWN = "—";

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function yesNoUnknown(v: unknown): string {
  const s = trimOrNull(v);
  if (!s) return "Unknown";
  const lower = s.toLowerCase();
  if (lower === "yes" || lower === "true") return "Yes";
  if (lower === "no" || lower === "false") return "No";
  if (lower === "unknown") return "Unknown";
  return s;
}

function ratingBucket(v: unknown): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "No rating";
  if (v >= 4.7) return "4.7+";
  if (v >= 4.5) return "4.5–4.69";
  if (v >= 4.0) return "4.0–4.49";
  if (v >= 3.5) return "3.5–3.99";
  if (v >= 3.0) return "3.0–3.49";
  return "<3.0";
}

function reviewBucket(v: unknown): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "No reviews";
  if (v === 0) return "0 reviews";
  if (v < 10) return "1–9";
  if (v < 25) return "10–24";
  if (v < 50) return "25–49";
  if (v < 100) return "50–99";
  if (v < 250) return "100–249";
  return "250+";
}

export const BENCHMARK_DIMENSIONS: BenchmarkDimension[] = [
  {
    id: "industry",
    label: "Industry / Trade",
    getValue: (row) => trimOrNull(row.contacts?.trade_type) ?? trimOrNull(row.contacts?.industry) ?? UNKNOWN,
  },
  {
    id: "state",
    label: "State",
    getValue: (row) => trimOrNull(row.contacts?.state) ?? UNKNOWN,
  },
  {
    id: "business_size",
    label: "Business Size",
    getValue: (row) => trimOrNull(row.contacts?.business_size) ?? UNKNOWN,
  },
  {
    id: "work_type",
    label: "Work Type",
    getValue: (row) => trimOrNull(row.contacts?.work_type) ?? UNKNOWN,
  },
  {
    id: "prospect_tier",
    label: "Prospect Tier",
    getValue: (row) => trimOrNull(row.contacts?.prospect_tier) ?? UNKNOWN,
  },
  {
    id: "buying_signal_strength",
    label: "Buying Signal",
    getValue: (row) => trimOrNull(row.contacts?.buying_signal_strength) ?? UNKNOWN,
  },
  {
    id: "phone_type",
    label: "Phone Type",
    getValue: (row) => {
      const v = trimOrNull(row.contacts?.phone_type);
      if (!v) return "Unknown";
      const lower = v.toLowerCase();
      if (lower === "mobile") return "Mobile";
      if (lower === "landline") return "Landline";
      if (lower === "unknown") return "Unknown";
      return v;
    },
  },
  {
    id: "has_google_ads",
    label: "Google Ads",
    getValue: (row) => yesNoUnknown(row.contacts?.has_google_ads),
  },
  {
    id: "has_facebook_ads",
    label: "Facebook Ads",
    getValue: (row) => yesNoUnknown(row.contacts?.has_facebook_ads),
  },
  {
    id: "has_dm_phone",
    label: "Has DM Phone",
    getValue: (row) => (trimOrNull(row.contacts?.dm_phone) ? "Yes" : "No"),
  },
  {
    id: "gbp_rating_band",
    label: "GBP Rating Band",
    getValue: (row) => ratingBucket(row.contacts?.gbp_rating ?? null),
  },
  {
    id: "review_count_band",
    label: "Review Count Band",
    getValue: (row) => reviewBucket(row.contacts?.review_count ?? null),
  },
];

export const BENCHMARK_DIMENSIONS_BY_ID = new Map(BENCHMARK_DIMENSIONS.map((d) => [d.id, d]));

/**
 * Given a list of rows and a dimension, returns the distinct category values
 * sorted by row count descending. Empty/null values are bucketed under "—".
 */
export function listDimensionValues(
  dimensionId: string,
  rows: RowWithContact[],
): { value: string; count: number }[] {
  const dim = BENCHMARK_DIMENSIONS_BY_ID.get(dimensionId);
  if (!dim) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = dim.getValue(row);
    if (v == null) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}