export type CallOutcome =
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "dnc"
  | "follow_up"
  | "booked"
  | "disqualified";

// Conversation-progress tagging (reached_connection / reached_problem_awareness / etc.)
// went live on this date. Any call log before this date has reached_connection=false
// purely because the field didn't exist yet — not because the rep failed to converse.
// Metrics that depend on these tags must clip to this date or they will be polluted.
export const CONVERSATION_TAGGING_LAUNCH_DATE = "2026-04-23";

/** Human-readable label for the launch date, used in tile subtexts. */
export const CONVERSATION_TAGGING_LAUNCH_LABEL = "23 Apr 2026";

export const INDUSTRIES = [
  "Plumbers",
  "HVAC",
  "Electricians",
  "Builders",
  "Renovators",
  "Roofers",
  "Landscaping",
  "Pest Control",
  "Auto Repair",
  "Painters",
  "Concreters",
  "Fencing",
  "Tilers",
  "Carpet Cleaning",
  "Cleaning Services",
  "Locksmiths",
  "Garage Doors",
  "Pool Builders",
  "Solar Installers",
  "Tree Services",
  "Removalists",
  "Demolition",
  "Pressure Washing",
  "Flooring",
  "Glass & Glazing",
  "Scaffolding",
  "Earthmoving",
  "Welding & Fabrication",
  "Dentists",
  "Chiropractors",
  "Real Estate",
  "Physiotherapists",
  "Accountants",
  "Lawyers",
  "Gyms & Fitness",
  "Beauty & Salon",
  "Cafe & Restaurant",
  "Medical & Health",
  "Professional Services",
];

const INDUSTRY_ALIASES: Record<string, string> = {
  plumbers: "Plumbers",
  plumber: "Plumbers",
  hvac: "HVAC",
  "air conditioning contractor": "HVAC",
  "hvac contractor": "HVAC",
  "heating contractor": "HVAC",
  "nhà thầu hvac": "HVAC",
  electricians: "Electricians",
  electrician: "Electricians",
  electricista: "Electricians",
  "electrical installation service": "Electricians",
  builders: "Builders",
  builder: "Builders",
  "home builder": "Builders",
  "custom home builder": "Builders",
  "modular home builder": "Builders",
  "construction company": "Builders",
  "deck builder": "Builders",
  constructor: "Builders",
  construtora: "Builders",
  renovators: "Renovators",
  renovator: "Renovators",
  remodeler: "Renovators",
  "kitchen remodeler": "Renovators",
  "bathroom remodeler": "Renovators",
  roofers: "Roofers",
  roofer: "Roofers",
  "roofing contractor": "Roofers",
  landscaping: "Landscaping",
  landscaper: "Landscaping",
  "landscape architect": "Landscaping",
  "pest control": "Pest Control",
  "pest control service": "Pest Control",
  "auto repair": "Auto Repair",
  "auto mechanic": "Auto Repair",
  mechanic: "Auto Repair",
  "car repair": "Auto Repair",
  painters: "Painters",
  painter: "Painters",
  "painting contractor": "Painters",
  "house painter": "Painters",
  concreters: "Concreters",
  concreter: "Concreters",
  "concrete contractor": "Concreters",
  fencing: "Fencing",
  "fencing contractor": "Fencing",
  tilers: "Tilers",
  tiler: "Tilers",
  "tiling contractor": "Tilers",
  "carpet cleaning": "Carpet Cleaning",
  "carpet cleaner": "Carpet Cleaning",
  "cleaning services": "Cleaning Services",
  "cleaning service": "Cleaning Services",
  cleaner: "Cleaning Services",
  locksmiths: "Locksmiths",
  locksmith: "Locksmiths",
  "garage doors": "Garage Doors",
  "garage door supplier": "Garage Doors",
  "pool builders": "Pool Builders",
  "pool builder": "Pool Builders",
  "swimming pool contractor": "Pool Builders",
  "solar installers": "Solar Installers",
  "solar installer": "Solar Installers",
  "solar energy contractor": "Solar Installers",
  "tree services": "Tree Services",
  "tree service": "Tree Services",
  arborist: "Tree Services",
  removalists: "Removalists",
  removalist: "Removalists",
  "moving company": "Removalists",
  demolition: "Demolition",
  "demolition contractor": "Demolition",
  "pressure washing": "Pressure Washing",
  "pressure washer": "Pressure Washing",
  "pressure cleaning": "Pressure Washing",
  flooring: "Flooring",
  "flooring contractor": "Flooring",
  "glass & glazing": "Glass & Glazing",
  glazier: "Glass & Glazing",
  scaffolding: "Scaffolding",
  "scaffolding contractor": "Scaffolding",
  earthmoving: "Earthmoving",
  "earthmoving contractor": "Earthmoving",
  excavation: "Earthmoving",
  "welding & fabrication": "Welding & Fabrication",
  welder: "Welding & Fabrication",
  fabricator: "Welding & Fabrication",
};

function normalizeIndustryKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeIndustryValue(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return INDUSTRY_ALIASES[normalizeIndustryKey(trimmed)] ?? trimmed;
}

// ── Dialer Filter Options ──

export const TRADE_TYPES = [
  "Plumbers",
  "HVAC",
  "Electricians",
  "Builders",
  "Renovators",
  "Roofers",
  "Landscaping",
  "Pest Control",
  "Auto Repair",
  "Painters",
  "Concreters",
  "Fencing",
  "Tilers",
  "Carpet Cleaning",
  "Locksmiths",
  "Garage Doors",
  "Pool Builders",
  "Solar Installers",
  "Tree Services",
  "Cleaning Services",
  "Removalists",
  "Demolition",
  "Pressure Washing",
  "Flooring",
  "Glass & Glazing",
  "Scaffolding",
  "Earthmoving",
  "Welding & Fabrication",
];

export const WORK_TYPES = [
  "Residential Only",
  "Mostly Residential",
  "Mixed",
  "Mostly Commercial",
  "Commercial Only",
];

export const BUSINESS_SIZES = [
  "Sole Trader",
  "2-5 Employees",
  "6-15 Employees",
  "16-30 Employees",
  "31-50 Employees",
  "50+ Employees",
];

export const PROSPECT_TIERS = [
  "Tier 1 - Hot",
  "Tier 2 - Warm",
  "Tier 3 - Nurture",
  "Tier 4 - Long Shot",
  "Tier 5 - New / No Reviews",
];

export const AD_STATUS_OPTIONS = [
  "Yes - Active",
  "Yes - Paused",
  "No",
  "Unknown",
];

export const BUYING_SIGNAL_OPTIONS = [
  "Strong",
  "Moderate",
  "Weak",
  "None",
];

export const GBP_RATING_OPTIONS = [
  { label: "4.5+ Stars", value: 4.5 },
  { label: "4.0+ Stars", value: 4.0 },
  { label: "3.5+ Stars", value: 3.5 },
  { label: "3.0+ Stars", value: 3.0 },
  { label: "Any Rating", value: 0 },
];

export const REVIEW_COUNT_OPTIONS = [
  { label: "100+ Reviews", value: 100 },
  { label: "50+ Reviews", value: 50 },
  { label: "20+ Reviews", value: 20 },
  { label: "10+ Reviews", value: 10 },
  { label: "Any", value: 0 },
];

export const PHONE_TYPE_OPTIONS = [
  "mobile",
  "landline",
  "unknown",
];

export const DM_STATUS_OPTIONS = [
  { label: "Has DM Phone", value: "yes" },
  { label: "No DM Phone", value: "no" },
];

export const AUSTRALIAN_STATES = [
  "ACT",
  "NSW",
  "NT",
  "QLD",
  "SA",
  "TAS",
  "VIC",
  "WA",
];

// Lead pool separation — cold vs warm vs outbound teams each dial their own pool.
export const LEAD_TYPES = [
  { value: "cold", label: "Cold — trades lists" },
  { value: "warm", label: "Warm — inbound" },
  { value: "outbound", label: "Outbound — re-engage" },
];

export const LEAD_CHANNELS = [
  "Ads",
  "Cold Email",
  "Student",
  "Website",
  "Referral",
  "Partnership",
  "Cold Call",
  "Booked session",
  "LinkedIn",
  "Legacy/Import",
  "Other",
];

export const OUTCOME_CONFIG: Record<
  CallOutcome,
  { label: string; color: string; bgClass: string; icon: string; shortcut: string; description?: string }
> = {
  no_answer: { label: "No Answer", color: "outcome-no-answer", bgClass: "bg-[hsl(var(--outcome-no-answer))]", icon: "PhoneMissed", shortcut: "1" },
  voicemail: { label: "Voicemail Left", color: "outcome-voicemail", bgClass: "bg-[hsl(var(--outcome-voicemail))]", icon: "Voicemail", shortcut: "2" },
  not_interested: { label: "Not Interested", color: "outcome-not-interested", bgClass: "bg-[hsl(var(--outcome-not-interested))]", icon: "ThumbsDown", shortcut: "3" },
  dnc: { label: "Do Not Call", color: "outcome-dnc", bgClass: "bg-[hsl(var(--outcome-dnc))]", icon: "PhoneOff", shortcut: "4", description: "Prospect asked to be removed, was abusive, or repeatedly wrong number. Blocks all future dialing." },
  follow_up: { label: "Follow Up", color: "outcome-follow-up", bgClass: "bg-[hsl(var(--outcome-follow-up))]", icon: "CalendarClock", shortcut: "5" },
  booked: { label: "Booked", color: "outcome-booked", bgClass: "bg-[hsl(var(--outcome-booked))]", icon: "CalendarCheck", shortcut: "6" },
  disqualified: {
    label: "Disqualified",
    color: "outcome-not-interested",
    bgClass: "bg-[hsl(var(--outcome-not-interested))]",
    icon: "UserX",
    shortcut: "7",
    description: "ONLY use when the business either can't afford us (no budget) OR explicitly said they don't want to grow. Every other rejection is Not Interested.",
  },
};

// ── DQ / DNC / Agency vocab ──

export const DQ_REASONS = [
  {
    value: "financially_not_qualified" as const,
    label: "Financially not qualified",
    description: "Can't afford our services — no budget, cashflow issues, or not generating enough revenue to invest in marketing.",
  },
  {
    value: "not_looking_to_grow" as const,
    label: "Not looking to grow",
    description: "Explicitly told us they don't want more leads or customers, or don't want to grow the business.",
  },
];

export type DqReason = typeof DQ_REASONS[number]["value"];

export const DNC_REASONS = [
  { value: "requested_removal" as const, label: "Requested removal" },
  { value: "abusive_or_hostile" as const, label: "Abusive / hostile" },
  { value: "wrong_number_repeat" as const, label: "Wrong number (repeat)" },
  { value: "other" as const, label: "Other (add note)" },
];

export type DncReason = typeof DNC_REASONS[number]["value"];

// ── Contact Lifecycle Spine ─────────────────────────────────────────
// One canonical funnel that sits ABOVE the granular call dispositions.
// prospect_tier (value) and lead_type (pool) are SEPARATE dimensions.

export const LIFECYCLE_STAGES = [
  { value: "new",        label: "New",        color: "text-slate-700  bg-slate-500/10  border-slate-500/30",  description: "Never contacted." },
  { value: "attempting", label: "Attempting", color: "text-blue-700   bg-blue-500/10   border-blue-500/30",   description: "Dialing but no conversation yet." },
  { value: "connected",  label: "Connected",  color: "text-cyan-700   bg-cyan-500/10   border-cyan-500/30",   description: "Talked to a human." },
  { value: "qualified",  label: "Qualified",  color: "text-violet-700 bg-violet-500/10 border-violet-500/30", description: "Decision maker + buying signal." },
  { value: "booked",     label: "Booked",     color: "text-amber-700  bg-amber-500/10  border-amber-500/30",  description: "Appointment on the calendar." },
  { value: "won",        label: "Won",        color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/30", description: "Closed-won deal." },
  { value: "lost",       label: "Lost",       color: "text-rose-700   bg-rose-500/10   border-rose-500/30",   description: "Not interested / DNC / disqualified." },
] as const;

export type LifecycleStage = typeof LIFECYCLE_STAGES[number]["value"];

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = LIFECYCLE_STAGES.reduce(
  (acc, s) => ({ ...acc, [s.value]: s.label }),
  {} as Record<LifecycleStage, string>,
);

export const LIFECYCLE_STAGE_COLORS: Record<LifecycleStage, string> = LIFECYCLE_STAGES.reduce(
  (acc, s) => ({ ...acc, [s.value]: s.color }),
  {} as Record<LifecycleStage, string>,
);

// Reason codes shown when a contact is set to Lost. Reuses existing NEPQ
// disposition vocab so nothing new to memorise.
export const LIFECYCLE_LOST_REASONS = [
  { value: "dnc",              label: "Do Not Call" },
  { value: "not_interested",   label: "Not interested" },
  { value: "wrong_number",     label: "Wrong number" },
  { value: "disqualified",     label: "Disqualified (DQ)" },
  { value: "no_budget",        label: "No budget" },
  { value: "already_has_agency", label: "Already has an agency" },
  { value: "other",            label: "Other" },
] as const;

export type LifecycleLostReason = typeof LIFECYCLE_LOST_REASONS[number]["value"];

export const AGENCY_SERVICES = [
  { value: "seo" as const, label: "SEO" },
  { value: "google_ads" as const, label: "Google Ads" },
  { value: "meta_ads" as const, label: "Meta Ads (FB/IG)" },
  { value: "website" as const, label: "Website / Landing" },
  { value: "other" as const, label: "Other" },
];

export type AgencyService = typeof AGENCY_SERVICES[number]["value"];

// ─── Deal-board stages (for booked pipeline_items in the Kanban view) ───────
// Clean, forward-flowing sales stages. Each carries a win-probability used
// for the weighted forecast at the top of the deal board.
export const DEAL_STAGES = [
  { value: "booked",   label: "Booked",   color: "text-amber-700 bg-amber-500/10 border-amber-500/40",       order: 1, winProbability: 0.2 },
  { value: "showed",   label: "Showed",   color: "text-sky-700 bg-sky-500/10 border-sky-500/40",             order: 2, winProbability: 0.4 },
  { value: "proposal", label: "Proposal", color: "text-violet-700 bg-violet-500/10 border-violet-500/40",    order: 3, winProbability: 0.6 },
  { value: "won",      label: "Won",      color: "text-emerald-700 bg-emerald-500/10 border-emerald-500/40", order: 4, winProbability: 1.0 },
  { value: "lost",     label: "Lost",     color: "text-rose-700 bg-rose-500/10 border-rose-500/40",          order: 5, winProbability: 0.0 },
] as const;

export type DealStage = typeof DEAL_STAGES[number]["value"];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = DEAL_STAGES.reduce(
  (acc, s) => ({ ...acc, [s.value]: s.label }),
  {} as Record<DealStage, string>,
);

export const DEAL_STAGE_WIN_PROBABILITY: Record<DealStage, number> = DEAL_STAGES.reduce(
  (acc, s) => ({ ...acc, [s.value]: s.winProbability }),
  {} as Record<DealStage, number>,
);
