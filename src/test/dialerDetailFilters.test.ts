import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DETAIL_FIELDS,
  DETAIL_GROUPS,
  MARKETING_GROUP,
  KIND_OPS,
  legacyToDetailFilters,
  mergeDetailFilters,
  controlFor,
  controlOwns,
  getTextMode,
  setTextMode,
  countDetailCriteria,
  describeDetailFilter,
  detailFiltersForRpc,
  getEq,
  getPicked,
  getRange,
  getDateRange,
  setDateRange,
  sanitizeDetailFilters,
  setEq,
  setPicked,
  setRange,
  type DetailFilter,
} from "@/lib/dialerDetailFilters";
import { dialerFilterParams } from "@/hooks/useContacts";
import { GHL_FIELD_FOLDERS } from "@/lib/ghlFieldFolders";

/** The newest migration that defines dialer_detail_fields() is the server whitelist. */
function serverWhitelist(): Map<string, string> {
  const dir = join(__dirname, "../../supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let body: string | null = null;
  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    const m = sql.match(/function public\.dialer_detail_fields\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/);
    if (m) body = m[1];
  }
  if (!body) throw new Error("dialer_detail_fields() not found in migrations");
  const out = new Map<string, string>();
  for (const m of body.matchAll(/\('([a-z_]+)',\s*'([a-z]+)'\)/g)) out.set(m[1], m[2]);
  return out;
}

describe("detail filter field list", () => {
  it("matches the server whitelist field-for-field, kind-for-kind", () => {
    const server = serverWhitelist();
    const client = new Map(DETAIL_FIELDS.map((f) => [f.field, f.kind]));
    expect([...client.entries()].sort()).toEqual([...server.entries()].sort());
  });

  it("has no duplicate fields", () => {
    const names = DETAIL_FIELDS.map((f) => f.field);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("sanitizeDetailFilters", () => {
  it("drops unknown fields, disallowed ops and bad values", () => {
    const out = sanitizeDetailFilters([
      { field: "status", op: "eq", value: "uncalled" },
      { field: "team_size; drop table contacts", op: "eq", value: 1 },
      { field: "key_objection", op: "gte", value: "a" },
      { field: "team_size", op: "gte", value: "five" },
      { field: "team_size", op: "gte", value: "5" },
      { field: "team_size", op: "in", value: [] },
      { field: "has_existing_agency", op: "eq", value: "maybe" },
      { field: "dm_name", op: "is_set", value: "ignored" },
      "nonsense",
      null,
    ]);
    expect(out).toEqual([
      { field: "team_size", op: "gte", value: 5 },
      { field: "dm_name", op: "is_set" },
    ]);
  });

  it("returns [] for non-arrays (old storage, hand-edited smart lists)", () => {
    expect(sanitizeDetailFilters(undefined)).toEqual([]);
    expect(sanitizeDetailFilters({ field: "team_size" })).toEqual([]);
  });

  it("keeps every op each kind allows", () => {
    for (const def of DETAIL_FIELDS) {
      for (const op of KIND_OPS[def.kind]) {
        const value =
          op === "is_set" || op === "is_not_set" ? undefined
          : op === "in" || op === "not_in" ? (def.kind === "int" ? [3] : ["x"])
          : def.kind === "int" ? 3
          : def.kind === "bool" ? true
          : def.kind === "date" ? "2026-11-01"
          : def.kind === "num" ? 4.5
          : "x";
        expect(sanitizeDetailFilters([{ field: def.field, op, value }])).toHaveLength(1);
      }
    }
  });
});

describe("headcount range", () => {
  it("round-trips min/max as team_size gte/lte without touching other criteria", () => {
    const base: DetailFilter[] = [{ field: "key_objection", op: "in", value: ["Too Busy"] }];
    const withRange = setRange(base, "team_size", { min: 5, max: 10 });
    expect(withRange).toEqual([
      { field: "key_objection", op: "in", value: ["Too Busy"] },
      { field: "team_size", op: "gte", value: 5 },
      { field: "team_size", op: "lte", value: 10 },
    ]);
    expect(getRange(withRange, "team_size")).toEqual({ min: 5, max: 10 });
    expect(setRange(withRange, "team_size", { min: null, max: null })).toEqual(base);
    expect(countDetailCriteria(withRange)).toBe(2);
  });
});

describe("quick pickers", () => {
  it("owns a single `in` entry per field", () => {
    let f: DetailFilter[] = [];
    f = setPicked(f, "need_identified", ["Strong Need"]);
    f = setPicked(f, "need_identified", ["Strong Need", "Moderate Need"]);
    expect(f).toEqual([{ field: "need_identified", op: "in", value: ["Strong Need", "Moderate Need"] }]);
    expect(getPicked(f, "need_identified")).toEqual(["Strong Need", "Moderate Need"]);
    expect(setPicked(f, "need_identified", [])).toEqual([]);
  });
});

describe("band as a criterion (Contacts page)", () => {
  it("keeps one business_size eq entry", () => {
    let f: DetailFilter[] = [{ field: "team_size", op: "gte", value: 3 }];
    f = setEq(f, "business_size", "One-man band (1-2)");
    f = setEq(f, "business_size", "Team (3+)");
    expect(f).toEqual([
      { field: "team_size", op: "gte", value: 3 },
      { field: "business_size", op: "eq", value: "Team (3+)" },
    ]);
    expect(getEq(f, "business_size")).toBe("Team (3+)");
    expect(setEq(f, "business_size", null)).toEqual([{ field: "team_size", op: "gte", value: 3 }]);
  });
});

describe("per-field controls", () => {
  it("gives every field a control", () => {
    const byControl = (field: string) => controlFor(DETAIL_FIELDS.find((f) => f.field === field)!);
    expect(byControl("need_identified")).toBe("pick");
    expect(byControl("years_in_business")).toBe("range");
    expect(byControl("has_existing_agency")).toBe("yesno");
    expect(byControl("key_quote")).toBe("text");
  });

  it("captured / not captured / contains share one entry per field", () => {
    let f: DetailFilter[] = [{ field: "need_identified", op: "in", value: ["Strong Need"] }];
    f = setTextMode(f, "dm_email", "is_set");
    expect(getTextMode(f, "dm_email")).toEqual({ mode: "is_set", text: "" });
    f = setTextMode(f, "dm_email", "contains", "  gmail ");
    expect(f).toEqual([
      { field: "need_identified", op: "in", value: ["Strong Need"] },
      { field: "dm_email", op: "contains", value: "gmail" },
    ]);
    expect(setTextMode(f, "dm_email", "contains", "")).toHaveLength(1);
    expect(setTextMode(f, "dm_email", "any")).toHaveLength(1);
  });

  it("chips only for criteria a control can't show", () => {
    expect(controlOwns({ field: "need_identified", op: "in", value: ["x"] })).toBe(true);
    expect(controlOwns({ field: "need_identified", op: "not_in", value: ["x"] })).toBe(false);
    expect(controlOwns({ field: "key_quote", op: "contains", value: "x" })).toBe(true);
    expect(controlOwns({ field: "years_in_business", op: "eq", value: 3 })).toBe(false);
  });
});

describe("old dialer filters", () => {
  it("become captured-detail criteria", () => {
    expect(
      legacyToDetailFilters({
        workType: "Mixed",
        buyingSignalStrength: "all",
        hasGoogleAds: "yes",
        hasFacebookAds: "Yes - Active",
        hasDmPhone: "no",
        hasExistingAgency: "yes",
        existingAgencyServices: ["seo"],
      }),
    ).toEqual([
      { field: "work_type", op: "in", value: ["Mixed"] },
      { field: "has_google_ads", op: "in", value: ["yes"] },
      { field: "dm_phone", op: "is_not_set" },
      { field: "has_existing_agency", op: "eq", value: true },
      { field: "existing_agency_services", op: "in", value: ["seo"] },
    ]);
    expect(legacyToDetailFilters(null)).toEqual([]);
  });

  it("don't override a criterion already set on the same field", () => {
    const base: DetailFilter[] = [{ field: "work_type", op: "in", value: ["Commercial Only"] }];
    expect(mergeDetailFilters(base, legacyToDetailFilters({ workType: "Mixed", hasDmPhone: "yes" }))).toEqual([
      { field: "work_type", op: "in", value: ["Commercial Only"] },
      { field: "dm_phone", op: "is_set" },
    ]);
  });
});

describe("RPC params", () => {
  it("sends null with no criteria, so the queue is unchanged", () => {
    expect(detailFiltersForRpc([])).toBeNull();
    expect(dialerFilterParams({})._detail_filters).toBeNull();
    expect(dialerFilterParams(undefined)._detail_filters).toBeNull();
  });

  it("sends the cleaned criteria alongside the existing band param", () => {
    const params = dialerFilterParams({
      businessSize: "Team (3+)",
      workType: "Mostly Residential",
      detailFilters: [
        { field: "team_size", op: "gte", value: 5 },
        { field: "team_size", op: "lte", value: 10 },
        { field: "bogus", op: "eq", value: "x" },
      ],
    });
    expect(params._business_size).toBe("Team (3+)");
    expect(params._work_type).toBe("Mostly Residential");
    expect(params._detail_filters).toEqual([
      { field: "team_size", op: "gte", value: 5 },
      { field: "team_size", op: "lte", value: 10 },
    ]);
  });
});

describe("chip labels", () => {
  it("reads naturally", () => {
    expect(describeDetailFilter({ field: "team_size", op: "gte", value: 5 })).toBe("Headcount (incl. owner) at least 5");
    expect(describeDetailFilter({ field: "key_objection", op: "in", value: ["Too Busy"] })).toBe("Key Objection: Too Busy");
    expect(describeDetailFilter({ field: "dm_phone", op: "is_set" })).toBe("Decision Maker Phone is captured");
  });
});

describe("one set of captured details: the filters mirror the Intelligence tab", () => {
  it("lets you filter on every Intelligence field the dialer stores, in the same folder and name", () => {
    const byField = new Map(DETAIL_FIELDS.map((f) => [f.field, f]));
    for (const folder of GHL_FIELD_FOLDERS) {
      for (const def of folder.fields) {
        const field = def.supabaseColumn ?? def.derived;
        if (!field) continue;
        const filter = byField.get(field);
        expect(filter, `${def.label} (${field})`).toBeTruthy();
        expect(filter!.group).toBe(folder.label);
      }
    }
  });

  it("orders groups like the Intelligence tabs and GHL: most important first, Lead Routing last", () => {
    expect(DETAIL_GROUPS).toEqual([
      "Decision Maker", "General Info", "Marketing", "Additional Info", "Qualification", "Appointments",
      "Dialer Activity", "Attribution", "Lead Routing",
    ]);
    expect(DETAIL_GROUPS).toEqual(GHL_FIELD_FOLDERS.map((f) => f.label));
    expect(DETAIL_FIELDS.every((f) => DETAIL_GROUPS.includes(f.group))).toBe(true);
  });

  it("files the marketing fields under Marketing and keeps their column names", () => {
    const marketing = DETAIL_FIELDS.filter((f) => f.group === MARKETING_GROUP).map((f) => f.field);
    expect(marketing).toEqual([
      "has_google_ads", "has_facebook_ads", "has_seo", "seo_visibility", "existing_agency_name", "agency_satisfaction",
      "existing_agency_notes", "current_monthly_ad_spend", "current_marketing_channels", "lead_source_dependency",
      "social_media_presence", "facebook_ads_manager_id", "marketing_pain_points", "has_existing_agency", "existing_agency_services",
    ]);
    const additional = DETAIL_FIELDS.filter((f) => f.group === "Additional Info").map((f) => f.field);
    expect(additional).toEqual(["gmb_link", "google_rating", "google_review_count", "nurture_last_email"]);
  });

  it("filters the booked date by a from/to range and drops bad dates", () => {
    const def = DETAIL_FIELDS.find((f) => f.field === "meeting_booked_date")!;
    expect(controlFor(def)).toBe("dates");
    const next = setDateRange([], "meeting_booked_date", { from: "2026-11-01", to: "2026-11-30" });
    expect(getDateRange(next, "meeting_booked_date")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(sanitizeDetailFilters([...next, { field: "meeting_booked_date", op: "gte", value: "next week" }])).toEqual(next);
    expect(describeDetailFilter(next[0])).toBe("Meeting Booked Date from 2026-11-01");
  });

  it("takes decimals for Google rating", () => {
    const def = DETAIL_FIELDS.find((f) => f.field === "google_rating")!;
    expect(def.kind).toBe("num");
    expect(controlFor(def)).toBe("range");
    expect(sanitizeDetailFilters([{ field: "google_rating", op: "gte", value: "4.5" }])).toEqual([{ field: "google_rating", op: "gte", value: 4.5 }]);
  });

  it("lists reps as the setter and closer options", () => {
    for (const field of ["setter_name", "assigned_closer"]) {
      const def = DETAIL_FIELDS.find((f) => f.field === field)!;
      expect(def.optionsFrom).toBe("reps");
      expect(controlFor(def)).toBe("pick");
    }
  });
});
