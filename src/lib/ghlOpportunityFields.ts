/**
 * GHL's "Opportunity Details" folder (opportunity custom fields), as stored on
 * the dialer's meeting/deal row (pipeline_items). Names, options and order
 * match GHL; `ghlId` is the GHL custom-field id used when pushing to the
 * linked opportunity. public.ghl_field_map holds the same mapping.
 */

export type OpportunityFieldKind = "select" | "money" | "number" | "date" | "text";

export interface OpportunityFieldDef {
  column: string;
  ghlId: string;
  label: string;
  kind: OpportunityFieldKind;
  options?: string[];
}

export const OPPORTUNITY_FIELDS: OpportunityFieldDef[] = [
  { column: "deal_type", ghlId: "sboWTFgT0eIOjBK85CGu", label: "Deal Type", kind: "select", options: ["Retainer", "One-off Project", "Retainer + Setup", "Performance"] },
  { column: "service_stream", ghlId: "7QUwRblRMBsVVbVCqCIt", label: "Service Stream", kind: "select", options: ["SEO", "Google Ads", "Meta Ads", "Website", "GMB", "Multi-service", "Other"] },
  { column: "setup_fee", ghlId: "3ajjLH2xTcl97ILfMUJT", label: "Setup Fee", kind: "money" },
  { column: "proposed_mrr", ghlId: "wOvU6mEcuVEwmD8E0HMG", label: "Proposed MRR", kind: "money" },
  { column: "commitment_type", ghlId: "eJU3KCAwEmV4cc5ArqD4", label: "Commitment Type", kind: "select", options: ["Month-to-Month", "Minimum Term then Month-to-Month", "Fixed Term"] },
  { column: "minimum_term_months", ghlId: "08PsRHEbyscUMPu62QHN", label: "Minimum Term Months", kind: "number" },
  { column: "proposal_sent_date", ghlId: "kcaU5ZVeAPRx8BCvpDVm", label: "Proposal Sent Date", kind: "date" },
  { column: "billing_start_date", ghlId: "ghXtb0b0yYi1do78o3pb", label: "Billing Start Date", kind: "date" },
  { column: "decision_makers_involved", ghlId: "ts4CRA9lmIAnfpZ6xmzd", label: "Decision Makers Involved", kind: "number" },
  { column: "competing_agency", ghlId: "AyykLM9UfWmzyxEuAVD8", label: "Competing Agency", kind: "text" },
  { column: "client_deal_id", ghlId: "zACCbi805WLIiE9NHEu1", label: "Client Deal ID", kind: "text" },
  { column: "churn_date", ghlId: "9qcJwhQC8OMlJ4c6EE6X", label: "Churn Date", kind: "date" },
  { column: "churn_reason", ghlId: "zPBaqjm2Hzvzn8B31ZOE", label: "Churn Reason", kind: "select", options: ["Results Below Expectation", "Budget Cut", "Went In-House", "Went To Competitor", "Business Closed / Sold", "Project Complete", "Non-Payment", "Relationship / Fit"] },
];

export const OPPORTUNITY_COLUMNS = OPPORTUNITY_FIELDS.map((f) => f.column);
