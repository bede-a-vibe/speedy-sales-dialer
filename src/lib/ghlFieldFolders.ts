/**
 * The Contact Intelligence panel's folders and fields, laid out exactly as the
 * GHL contact custom-field folders are (same folder names, field names and
 * keys), so the dialer and GHL read the same way and can be synced one to one.
 * public.ghl_field_map holds the same mapping for server-side sync.
 *
 * `supabaseColumn` mirrors writes into the local `contacts` row, so dialer
 * queue logic keeps working. It is left off where the dialer column holds
 * different values from GHL's options (lifecycle stage, lead source channel)
 * or a different type (arrays and booleans), so a panel edit can never write
 * a GHL value over the dialer's own.
 */

export type GhlFieldUiHint = "text" | "textarea" | "number" | "date" | "auto";

export interface GhlFieldDef {
  /** GHL fieldKey, exactly as GHL has it (e.g. "contact.buying_signal_strength"). */
  key: string;
  /** GHL field id. Pushes use it, so fields created after the edge function's key map still save. */
  ghlId: string;
  /** Label shown above the input: the GHL field name. */
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
  /** The GHL folder name. */
  label: string;
  /** Short tab label (defaults to `label` when omitted). */
  shortLabel?: string;
  description?: string;
  fields: GhlFieldDef[];
}

export const GHL_FIELD_FOLDERS: GhlFieldFolder[] = [
  {
    id: "lead_routing",
    label: "01 Lead Routing",
    fields: [
      { key: "contact.lead_status", ghlId: "jkEml3ZgsT39j0dw5wb4", label: "Lead Status", supabaseColumn: "lead_status" },
      // Dialer lifecycle values (new, booked, won, lost) differ from GHL's options; GHL-only here.
      { key: "contact.lifecycle_stage", ghlId: "P2jB7XrffoxEXQjhlBSD", label: "Lifecycle Stage" },
      { key: "contact.brand", ghlId: "6Sudcgra1Mg2Ird0wIIJ", label: "Brand", supabaseColumn: "brand" },
      { key: "contact.segment", ghlId: "yNZ7hCIwoY37vTZD27Ws", label: "Segment", supabaseColumn: "segment" },
      { key: "contact.segment_changed_at", ghlId: "6ub0dL2Cq5JwBJOYmZGj", label: "Segment Changed At", ui: "date", supabaseColumn: "segment_changed_at" },
      { key: "contact.booking_tier_ads_only", ghlId: "jYulMCr1owiJISjrFMr2", label: "Booking Tier (Ads Only)", supabaseColumn: "booking_tier" },
      { key: "contact.import_batch", ghlId: "gGdOpEyLBLYIusTc0QRk", label: "Import Batch", supabaseColumn: "import_batch" },
      { key: "contact.disqualified_reason", ghlId: "W5pWm7Zh4RqkdMGNgykl", label: "Disqualified Reason", supabaseColumn: "disqualified_reason" },
      { key: "contact.dnc_reason", ghlId: "aAvl9RjrKpTwcob1LnWA", label: "DNC Reason", supabaseColumn: "dnc_reason" },
    ],
  },
  {
    id: "decision_maker",
    label: "02 Decision Maker",
    fields: [
      { key: "contact.decision_maker_name", ghlId: "wJZYqVWVftkCpRKpsh1E", label: "Decision Maker Name", supabaseColumn: "dm_name" },
      { key: "contact.decision_maker_role", ghlId: "0w48jKmhINg67x1XHl9w", label: "Decision Maker Role", supabaseColumn: "dm_role", placeholder: "Owner, Director, Office Manager…" },
      { key: "contact.decision_maker_phone", ghlId: "6OndJoC6WKbN9Ffq4WRp", label: "Decision Maker Phone", supabaseColumn: "dm_phone" },
      { key: "contact.decision_maker_phone_type", ghlId: "vacYRaSporHlSBHMjWhu", label: "Decision Maker Phone Type", supabaseColumn: "dm_phone_type", placeholder: "mobile / landline / unknown" },
      { key: "contact.decision_maker_email", ghlId: "eS6oYJUK2UMnXijxSdCZ", label: "Decision Maker Email", supabaseColumn: "dm_email" },
      { key: "contact.decision_maker_linkedin", ghlId: "EKgMkT1U5xu2aj6AoWzw", label: "Decision Maker LinkedIn", supabaseColumn: "dm_linkedin" },
      { key: "contact.authority_level", ghlId: "TAreuAl3hcsnzbtfL5sN", label: "Authority Level", supabaseColumn: "authority_level" },
      { key: "contact.job_role", ghlId: "4iC6cc6idsUkk0A1OxHp", label: "Job Role", supabaseColumn: "job_role" },
      { key: "contact.best_route_to_decision_maker", ghlId: "9bpBi9hiziafLWKKA0DN", label: "Best Route To Decision Maker", supabaseColumn: "best_route_to_decision_maker" },
      { key: "contact.preferred_contact_method", ghlId: "4DjpfGirGSrati3ff47I", label: "Preferred Contact Method", supabaseColumn: "preferred_contact_method" },
      { key: "contact.gatekeeper_name", ghlId: "lCSsKeALjcWqPnta12QT", label: "Gatekeeper Name", supabaseColumn: "gatekeeper_name" },
      { key: "contact.gatekeeper_role", ghlId: "RA4QpfGGjhXLgjurypAY", label: "Gatekeeper Role", supabaseColumn: "gatekeeper_role" },
      { key: "contact.gatekeeper_notes", ghlId: "R8wxTGh9n3EY3LDD6ape", label: "Gatekeeper Notes", ui: "textarea", fullWidth: true, supabaseColumn: "gatekeeper_notes" },
      { key: "contact.stakeholders_enterprise", ghlId: "1HuyARU6BQVcGX88GQfm", label: "Stakeholders (Enterprise)", ui: "textarea", fullWidth: true, supabaseColumn: "stakeholders" },
    ],
  },
  {
    id: "dialer_activity",
    label: "03 Dialer Activity",
    fields: [
      { key: "contact.dial_count", ghlId: "YjMRd5Rjibg5QrvtsxUa", label: "Dial Count", ui: "number", supabaseColumn: "call_attempt_count" },
      { key: "contact.last_called_at", ghlId: "fuVXcQF6wcYCUqo2in4s", label: "Last Called At", ui: "date", supabaseColumn: "last_called_at" },
      { key: "contact.next_followup_date", ghlId: "eCycdDk2CeGl8XBx8F9w", label: "Next Follow-Up Date", ui: "date", supabaseColumn: "next_followup_date" },
      { key: "contact.callback_date", ghlId: "1Nmk5uFEAg1gqgYkw7GQ", label: "Callback Date", ui: "date", supabaseColumn: "callback_date" },
      { key: "contact.revival_date", ghlId: "6kV1fSGyXtcxRnj96XYA", label: "Revival Date", ui: "date", supabaseColumn: "revival_date" },
      { key: "contact.best_time_to_call", ghlId: "wnwsciJlfvJRXZzPTv6J", label: "Best Time To Call", supabaseColumn: "best_time_to_call" },
      { key: "contact.last_call_sentiment", ghlId: "ybcmHrjLXc8UN8H7jlcl", label: "Last Call Sentiment", supabaseColumn: "last_call_sentiment" },
      { key: "contact.voicemail_count", ghlId: "SxteSxcBgBFYxR0LwdTQ", label: "Voicemail Count", ui: "number", supabaseColumn: "voicemail_count" },
      { key: "contact.phone_type", ghlId: "UnqdUC0hddQ5KeYv8iNN", label: "Phone Type", supabaseColumn: "phone_type" },
      { key: "contact.phone_number_quality", ghlId: "RwPm1QYWjsKFPGV9yfPn", label: "Phone Number Quality", supabaseColumn: "phone_number_quality" },
      { key: "contact.followup_note", ghlId: "EkahA8qvjPRFksoewlDo", label: "Follow-Up Note", ui: "textarea", fullWidth: true, supabaseColumn: "follow_up_note" },
      { key: "contact.ai_call_summary", ghlId: "u9Ch4YsvDETOlU1TJK2Z", label: "AI Call Summary", ui: "textarea", fullWidth: true, supabaseColumn: "call_intel_summary" },
      { key: "contact.rep_coaching_notes", ghlId: "NblZqgl1DDDO4bcn9hta", label: "Rep Coaching Notes", ui: "textarea", fullWidth: true, supabaseColumn: "rep_coaching_notes" },
    ],
  },
  {
    id: "qualification",
    label: "04 Qualification",
    description: "How ready is this prospect to buy?",
    fields: [
      { key: "contact.buying_signal_strength", ghlId: "mw0QdEQOuoAfRlHZBYSN", label: "Buying Signal Strength", supabaseColumn: "buying_signal_strength" },
      { key: "contact.need_identified", ghlId: "4in6BRPMGReVrDQFgY4n", label: "Need Identified", supabaseColumn: "need_identified" },
      { key: "contact.problem_resonance", ghlId: "U68vQUdOHLQrCWcY74oE", label: "Problem Resonance", supabaseColumn: "problem_resonance" },
      { key: "contact.key_objection", ghlId: "mFz4pYPHIgXFquugWmT5", label: "Key Objection", supabaseColumn: "key_objection" },
      { key: "contact.current_solution_satisfaction", ghlId: "e3tH4RuEGjNlat7rU9AK", label: "Current Solution Satisfaction", supabaseColumn: "current_solution_satisfaction" },
      { key: "contact.contract__lockin_status", ghlId: "sEUQbY4UTqPHRO7vkt8s", label: "Contract / Lock-in Status", supabaseColumn: "contract_lockin_status" },
      { key: "contact.budget_indication", ghlId: "xDIkLFvyamCIbjxKFqjP", label: "Budget Indication", supabaseColumn: "budget_indication" },
      { key: "contact.buying_timeline", ghlId: "GnGTus8dpsw9BjoHxaf7", label: "Buying Timeline", placeholder: "e.g. 30 days, Q2, ASAP", supabaseColumn: "buying_timeline" },
      { key: "contact.proposal_format", ghlId: "3X7mYUDiqTDzluZuW2Tb", label: "Proposal Format", supabaseColumn: "proposal_format" },
      { key: "contact.monthly_retainer_value", ghlId: "rEZB5YlXzPM9MmTKAqrM", label: "Monthly Retainer Value", ui: "number", supabaseColumn: "monthly_retainer_value" },
      // Dialer stores service_type as text[]; GHL-only here so a typed value can't fail the array write.
      { key: "contact.service_type", ghlId: "bCeCRr3a9YRUr8GrNRUg", label: "Service Type" },
      { key: "contact.objection_notes", ghlId: "XHo49TGmQQhptaaAnFfp", label: "Objection Notes", ui: "textarea", fullWidth: true, supabaseColumn: "objection_notes" },
      { key: "contact.key_quote", ghlId: "aQMw8XHDdYocQrOWft8h", label: "Key Quote", ui: "textarea", fullWidth: true, supabaseColumn: "key_quote" },
      { key: "contact.agreed_next_steps", ghlId: "XIh2qkCyBZui0vEwND4f", label: "Agreed Next Steps", ui: "textarea", fullWidth: true, supabaseColumn: "agreed_next_steps" },
      { key: "contact.competitive_intel", ghlId: "NUbSRl1jVGA9fmmPwFXj", label: "Competitive Intel", ui: "textarea", fullWidth: true, supabaseColumn: "competitive_intel" },
      { key: "contact.existing_agency_notes", ghlId: "VKodU7rpvGxFzkLyO3tR", label: "Existing Agency Notes", ui: "textarea", fullWidth: true, supabaseColumn: "existing_agency_notes" },
    ],
  },
  {
    id: "appointments",
    label: "05 Appointments",
    fields: [
      { key: "contact.appointment_status", ghlId: "atUoeSFgJf44uN6cbGHV", label: "Appointment Status", supabaseColumn: "appointment_status" },
      { key: "contact.last_appointment_date", ghlId: "f9YIjyfnCTLsPYChFyHo", label: "Last Appointment Date", ui: "date", supabaseColumn: "latest_appointment_scheduled_for" },
      { key: "contact.last_appointment_calendar", ghlId: "31IX1l2Ic2BHh5dlvvgy", label: "Last Appointment Calendar", supabaseColumn: "last_appointment_calendar" },
      { key: "contact.noshow_count", ghlId: "k1lvtr2msSPEf8kSqMwI", label: "No-Show Count", ui: "number", supabaseColumn: "noshow_count" },
    ],
  },
  {
    id: "attribution",
    label: "06 Attribution",
    fields: [
      { key: "contact.utm_source", ghlId: "VJlum2ACIjHEam6eMWVO", label: "UTM Source", supabaseColumn: "utm_source" },
      { key: "contact.utm_placementmedium", ghlId: "suBOs5VG7b4rsLgRKmYU", label: "UTM Placement/Medium", supabaseColumn: "utm_medium" },
      { key: "contact.utm_campaign_name", ghlId: "zHdlV3t2H47KpsKn87PH", label: "UTM Campaign Name", supabaseColumn: "utm_campaign" },
      { key: "contact.utm_ad_set__ad_group", ghlId: "HwnLsStaeZoePl64sp5D", label: "UTM Ad Set / Ad Group", supabaseColumn: "utm_ad_set" },
      { key: "contact.ad_name__keyword", ghlId: "MeVt9u54FMIerQLO89qT", label: "Ad Name / Keyword", supabaseColumn: "utm_ad_name" },
    ],
  },
  {
    id: "general",
    label: "General Info",
    fields: [
      { key: "contact.industry", ghlId: "6kXGFWZjVGnutFGl4EfB", label: "Industry", supabaseColumn: "industry" },
      { key: "contact.trade_type", ghlId: "2PCgu75uet5x1Un3LfUW", label: "Trade Type", supabaseColumn: "trade_type" },
      { key: "contact.vertical", ghlId: "iuGlU9siAP2jJcpKbXcf", label: "Vertical", supabaseColumn: "vertical" },
      { key: "contact.work_type", ghlId: "axtUmGxV7tWXytJKBfC8", label: "Work Type", supabaseColumn: "work_type" },
      { key: "contact.business_size", ghlId: "Ew9OeEvZKjU7qqBddGv1", label: "Business Size", supabaseColumn: "business_size" },
      { key: "contact.team_size", ghlId: "hP7Svlmj7Kj5x8gkwVBE", label: "Team Size", ui: "number", supabaseColumn: "team_size" },
      { key: "contact.team_size_evidence", ghlId: "wnMitv1yGYth5VaVK603", label: "Team Size Evidence", supabaseColumn: "team_size_evidence" },
      { key: "contact.years_in_business", ghlId: "XRMlhtuvmgirf0PULKZK", label: "Years In Business", ui: "number", supabaseColumn: "years_in_business" },
      { key: "contact.annual_revenue", ghlId: "UnC9qDQhoNxdJ2mQUrFo", label: "Annual revenue", supabaseColumn: "annual_revenue" },
      { key: "contact.estimated_annual_revenue", ghlId: "Gxe6MX3b62Dy0bDGnnI4", label: "Estimated Annual Revenue", supabaseColumn: "estimated_annual_revenue" },
      { key: "contact.service_area", ghlId: "oAi0GwgqqhVPCbSX1nEV", label: "Service Area", supabaseColumn: "service_area" },
      { key: "contact.number_of_trucksvans", ghlId: "CIZnPCZ6Q72Us8cEDhe3", label: "Number of Trucks/Vans", ui: "number", supabaseColumn: "number_of_trucks_vans" },
      { key: "contact.abn", ghlId: "iCiidz5RzuRYi8Iw8gVe", label: "ABN", supabaseColumn: "abn" },
      { key: "contact.website_not_always_formatted", ghlId: "rEtCUJTaE1pS1z1R2cNX", label: "Website (Not always formatted)", supabaseColumn: "website" },
      { key: "contact.website_quality", ghlId: "e7BCMovLMDtEAchA1fS9", label: "Website Quality", supabaseColumn: "website_quality" },
      // Dialer lead_channel uses its own names (Cold Call, meta ads…); GHL-only here.
      { key: "contact.lead_source_channel", ghlId: "jDoscxdqzhHNh6lHqFcP", label: "Lead Source Channel" },
      { key: "contact.prospect_tier", ghlId: "tj6IENIKIjrRNOwAlQrH", label: "Prospect Tier", supabaseColumn: "prospect_tier" },
    ],
  },
  {
    id: "additional",
    label: "Additional Info",
    fields: [
      { key: "contact.runs_google_ads", ghlId: "ZG3QeG2W3Ik6becivAGs", label: "Runs Google Ads", supabaseColumn: "has_google_ads" },
      { key: "contact.runs_facebook_ads", ghlId: "38OdKPZZEzcS8R8rjRWD", label: "Runs Facebook Ads", supabaseColumn: "has_facebook_ads" },
      { key: "contact.has_seo", ghlId: "DmuVdRMa7GUo75ELoAUe", label: "Has SEO", supabaseColumn: "has_seo" },
      // Dialer has_existing_agency is a boolean and agency services an array; the Marketing tab writes both.
      { key: "contact.has_existing_agency", ghlId: "foSa0W3pYXsVAJ0hhDL3", label: "Has Existing Agency" },
      { key: "contact.existing_agency", ghlId: "gCrMGwsqXWSZtafyRpbz", label: "Existing Agency", supabaseColumn: "existing_agency_name" },
      { key: "contact.existing_agency_services", ghlId: "eABDylJMAnBKPjh0E1EQ", label: "Existing Agency Services" },
      { key: "contact.agency_satisfaction", ghlId: "uJLkIMKwn9GJzcw2MN1p", label: "Agency Satisfaction", supabaseColumn: "agency_satisfaction" },
      { key: "contact.monthly_media_spend", ghlId: "uMj8mIEp3iFAksnpYwV9", label: "Monthly Media Spend", supabaseColumn: "current_monthly_ad_spend" },
      { key: "contact.current_marketing_channels", ghlId: "taiXbbtrC4tmJRJ5edvn", label: "Current Marketing Channels", supabaseColumn: "current_marketing_channels" },
      { key: "contact.lead_source_dependency", ghlId: "6MM3HCwi658qrP23cOd1", label: "Lead Source Dependency", supabaseColumn: "lead_source_dependency" },
      { key: "contact.social_media_presence", ghlId: "d13bnB0e76cF5xIB6IUL", label: "Social Media Presence", supabaseColumn: "social_media_presence" },
      { key: "contact.gmb_link", ghlId: "ndqiVBUh3uLV3Ldv2U3y", label: "GMB Link", supabaseColumn: "gmb_link" },
      { key: "contact.google_rating", ghlId: "tURFlUlaFptokRxVtTnY", label: "Google Rating", ui: "number", supabaseColumn: "google_rating" },
      { key: "contact.google_review_count", ghlId: "zFL0ugGivKLRaT66Rb2z", label: "Google Review Count", ui: "number", supabaseColumn: "google_review_count" },
      { key: "contact.facebook_ads_manager_id", ghlId: "VNJerPugxUw9Ag2wCbjZ", label: "Facebook Ads Manager Id", supabaseColumn: "facebook_ads_manager_id" },
      { key: "contact.nurture_last_email", ghlId: "AzWwUC8oiZskQhKyOEFM", label: "Nurture Last Email", ui: "number", supabaseColumn: "nurture_last_email" },
      { key: "contact.marketing_pain_points", ghlId: "tk7TtUMRZq0XY2MARcbf", label: "Marketing Pain Points", ui: "textarea", fullWidth: true, supabaseColumn: "marketing_pain_points" },
    ],
  },
];

export function getAllGhlFieldDefs(): GhlFieldDef[] {
  return GHL_FIELD_FOLDERS.flatMap((folder) => folder.fields);
}
