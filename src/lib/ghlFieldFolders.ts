/**
 * Static configuration that maps every addressable GHL custom field
 * (from `GHL_FIELD_KEY_TO_ID` in supabase/functions/ghl/index.ts) into the
 * folder groupings shown in the GHL custom-fields UI. The dialer's
 * Contact Intelligence panel renders one tab per folder.
 *
 * `supabaseColumn` lets us mirror writes into the local `contacts` row
 * (so dialer queue logic keeps working) — leave undefined for GHL-only fields.
 */

export type GhlFieldUiHint = "text" | "textarea" | "number" | "date" | "auto";

export interface GhlFieldDef {
  /** GHL field key — matches `GHL_FIELD_KEY_TO_ID` on the edge function. */
  key: string;
  /** Label shown above the input. */
  label: string;
  /** Optional placeholder/hint text. */
  placeholder?: string;
  /**
   * Hint that overrides the GHL `dataType` rendering decision.
   * `auto` (default) lets the schema's dataType pick the control.
   */
  ui?: GhlFieldUiHint;
  /** Mirror to this column on `public.contacts` whenever the field is saved. */
  supabaseColumn?: string;
  /** Render across both columns of the grid. */
  fullWidth?: boolean;
}

export interface GhlFieldFolder {
  id: string;
  label: string;
  /** Short tab label (defaults to `label` when omitted). */
  shortLabel?: string;
  description?: string;
  fields: GhlFieldDef[];
}

export const GHL_FIELD_FOLDERS: GhlFieldFolder[] = [
  {
    id: "qualification",
    label: "Qualification & Buying Signals",
    shortLabel: "Qualification",
    description: "How ready is this prospect to buy?",
    fields: [
      { key: "contact.buying_signal_strength", label: "Buying Signal Strength", supabaseColumn: "buying_signal_strength" },
      { key: "contact.budget_indication", label: "Budget Indication", supabaseColumn: "budget_indication" },
      { key: "contact.authority_level", label: "Authority Level", supabaseColumn: "authority_level" },
      { key: "contact.buying_timeline", label: "Buying Timeline", placeholder: "e.g. 30 days, Q2, ASAP" },
      { key: "contact.need_identified", label: "Need Identified", ui: "textarea", placeholder: "What problem do they need solved?", fullWidth: true },
      { key: "contact.current_solution_satisfaction", label: "Current Solution Satisfaction" },
      { key: "contact.contractlockin_status", label: "Contract / Lock-in Status" },
      { key: "contact.key_objection", label: "Key Objection", ui: "textarea", fullWidth: true },
    ],
  },
  {
    id: "business",
    label: "Business Profile",
    shortLabel: "Business",
    fields: [
      { key: "contact.work_type", label: "Work Type", supabaseColumn: "work_type" },
      { key: "contact.business_size", label: "Business Size", supabaseColumn: "business_size" },
      { key: "contact.service_area", label: "Service Area" },
      { key: "contact.number_of_trucksvans", label: "Trucks / Vans", ui: "number" },
      { key: "contact.years_in_business", label: "Years in Business", ui: "number" },
      { key: "contact.estimated_annual_revenue", label: "Estimated Annual Revenue" },
      { key: "contact.abn", label: "ABN" },
      { key: "contact.website_url", label: "Website URL", supabaseColumn: "website" },
      { key: "contact.website_quality", label: "Website Quality" },
    ],
  },
  {
    id: "digital",
    label: "Digital Presence & Opportunity",
    shortLabel: "Digital",
    fields: [
      { key: "contact.has_google_ads", label: "Has Google Ads", supabaseColumn: "has_google_ads" },
      { key: "contact.has_facebookmeta_ads", label: "Has Meta Ads", supabaseColumn: "has_facebook_ads" },
      { key: "contact.current_marketing_agency", label: "Current Marketing Agency" },
      { key: "contact.current_monthly_ad_spend", label: "Monthly Ad Spend" },
      { key: "contact.current_marketing_channels", label: "Marketing Channels" },
      { key: "contact.seo_visibility", label: "SEO Visibility" },
      { key: "contact.social_media_presence", label: "Social Media Presence" },
      { key: "contact.agency_satisfaction", label: "Agency Satisfaction" },
      { key: "contact.lead_source_dependency", label: "Lead Source Dependency" },
      { key: "contact.marketing_pain_points", label: "Marketing Pain Points", ui: "textarea", fullWidth: true },
    ],
  },
  {
    id: "ai",
    label: "AI Call Intelligence",
    shortLabel: "Call AI",
    fields: [
      { key: "contact.last_call_sentiment", label: "Last Call Sentiment", supabaseColumn: "last_call_sentiment" },
      { key: "contact.problem_resonance", label: "Problem Resonance" },
      { key: "contact.key_quote", label: "Key Quote", ui: "textarea", fullWidth: true },
      { key: "contact.competitive_intel", label: "Competitive Intel", ui: "textarea", fullWidth: true },
      { key: "contact.agreed_next_steps", label: "Agreed Next Steps", ui: "textarea", fullWidth: true },
      { key: "contact.rep_coaching_notes", label: "Rep Coaching Notes", ui: "textarea", fullWidth: true },
      { key: "contact.ai_call_summary", label: "AI Call Summary", ui: "textarea", fullWidth: true },
    ],
  },
  {
    id: "gatekeeper",
    label: "Gatekeeper Intelligence",
    shortLabel: "Gatekeeper",
    fields: [
      { key: "contact.gatekeeper_name", label: "Gatekeeper Name", supabaseColumn: "gatekeeper_name" },
      { key: "contact.gatekeeper_role", label: "Gatekeeper Role" },
      { key: "contact.best_route_to_dm", label: "Best Route to DM", supabaseColumn: "best_route_to_decision_maker" },
      { key: "contact.gatekeeper_notes", label: "Gatekeeper Notes", ui: "textarea", fullWidth: true, supabaseColumn: "gatekeeper_notes" },
      { key: "contact.decision_maker_name", label: "Decision Maker Name", supabaseColumn: "dm_name" },
      { key: "contact.decision_maker_direct_line", label: "DM Direct Line", supabaseColumn: "dm_phone" },
      { key: "contact.decision_maker_email", label: "DM Email", supabaseColumn: "dm_email" },
      { key: "contact.decision_maker_linkedin", label: "DM LinkedIn", supabaseColumn: "dm_linkedin" },
    ],
  },
  {
    id: "call_activity",
    label: "Call Activity",
    shortLabel: "Activity",
    fields: [
      { key: "contact.total_call_attempts", label: "Total Call Attempts", ui: "number", supabaseColumn: "call_attempt_count" },
      { key: "contact.last_contacted_date", label: "Last Contacted", ui: "date", supabaseColumn: "last_called_at" },
      { key: "contact.next_followup_date", label: "Next Follow-up Date", ui: "date", supabaseColumn: "next_followup_date" },
      { key: "contact.best_time_to_call", label: "Best Time to Call", supabaseColumn: "best_time_to_call" },
      { key: "contact.preferred_contact_method", label: "Preferred Contact Method" },
      { key: "contact.call_disposition", label: "Call Disposition" },
      { key: "contact.objection_notes", label: "Objection Notes", ui: "textarea", fullWidth: true },
    ],
  },
  {
    id: "general",
    label: "General Info",
    shortLabel: "General",
    fields: [
      { key: "contact.google_business_profile", label: "Google Business Profile", supabaseColumn: "gmb_link" },
      { key: "contact.gbp_rating", label: "GBP Rating", ui: "number", supabaseColumn: "gbp_rating" },
      { key: "contact.review_number", label: "Review Count", ui: "number", supabaseColumn: "review_count" },
      { key: "contact.trade_type", label: "Trade Type", supabaseColumn: "trade_type" },
    ],
  },
  {
    id: "additional",
    label: "Additional Info",
    shortLabel: "Additional",
    fields: [
      { key: "contact.number_quality", label: "Number Quality", supabaseColumn: "phone_number_quality" },
      { key: "contact.prospect_tier", label: "Prospect Tier", supabaseColumn: "prospect_tier" },
    ],
  },
  {
    id: "meeting",
    label: "Meeting Attribution",
    shortLabel: "Meeting",
    fields: [
      { key: "contact.meeting_set_by_role", label: "Meeting Set By (Role)" },
      { key: "contact.setter_name", label: "Setter Name" },
      { key: "contact.assigned_closer", label: "Assigned Closer" },
      { key: "contact.meeting_source", label: "Meeting Source" },
      { key: "contact.meeting_booked_date", label: "Meeting Booked Date", ui: "date", supabaseColumn: "meeting_booked_date" },
    ],
  },
];

export function getAllGhlFieldDefs(): GhlFieldDef[] {
  return GHL_FIELD_FOLDERS.flatMap((folder) => folder.fields);
}