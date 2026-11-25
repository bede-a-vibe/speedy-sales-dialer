/**
 * Where a lead came from. Saved on contacts.lead_channel, which every report
 * reads through the database's contact_channel(); lead_type 'cold' with no
 * channel is what makes a contact count as a cold call.
 */
export const LEAD_SOURCES = [
  "Cold Call", "SEO", "Referral", "Meta Ads", "Google Ads", "Website", "Partnership", "LinkedIn", "Cold Email", "Student", "Other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const DEFAULT_LEAD_SOURCE: LeadSource = "Cold Call";

/** Contact fields for a new lead from this source. `detail` is free text, such as who referred them. */
export function leadSourceFields(source: string, detail = "") {
  return {
    lead_channel: source,
    lead_type: source === "Cold Call" ? "cold" : "inbound",
    lead_source: detail.trim() || null,
  };
}

/**
 * Changing the source of a contact already in the dialer. The dial pool
 * (lead_type) only moves when it crosses between cold and not cold, so a warm
 * or re-engage lead keeps its pool.
 */
export function changeLeadSource(contact: { lead_type?: string | null }, source: string) {
  const wasCold = (contact.lead_type ?? "").toLowerCase() === "cold";
  const { lead_type, lead_channel } = leadSourceFields(source);
  return wasCold === (lead_type === "cold") ? { lead_channel } : { lead_channel, lead_type };
}

/** The picker value for a contact already in the dialer, matching older spellings ("ads", "meta ads"). */
export function leadSourceOf(c: { lead_channel?: string | null; lead_type?: string | null }): string {
  const raw = c.lead_channel?.trim();
  if (raw) return LEAD_SOURCES.find((s) => s.toLowerCase() === raw.toLowerCase()) ?? raw;
  return ["cold", "outbound"].includes((c.lead_type ?? "").toLowerCase()) ? "Cold Call" : "";
}
