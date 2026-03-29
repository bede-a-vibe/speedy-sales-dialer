export type CallOutcome =
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "dnc"
  | "follow_up"
  | "booked";

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
  "business_line",
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

export const OUTCOME_CONFIG: Record<
  CallOutcome,
  { label: string; color: string; bgClass: string; icon: string; shortcut: string }
> = {
  no_answer: { label: "No Answer", color: "outcome-no-answer", bgClass: "bg-[hsl(var(--outcome-no-answer))]", icon: "PhoneMissed", shortcut: "1" },
  voicemail: { label: "Voicemail Left", color: "outcome-voicemail", bgClass: "bg-[hsl(var(--outcome-voicemail))]", icon: "Voicemail", shortcut: "2" },
  not_interested: { label: "Not Interested", color: "outcome-not-interested", bgClass: "bg-[hsl(var(--outcome-not-interested))]", icon: "ThumbsDown", shortcut: "3" },
  dnc: { label: "Do Not Call", color: "outcome-dnc", bgClass: "bg-[hsl(var(--outcome-dnc))]", icon: "PhoneOff", shortcut: "4" },
  follow_up: { label: "Follow Up", color: "outcome-follow-up", bgClass: "bg-[hsl(var(--outcome-follow-up))]", icon: "CalendarClock", shortcut: "5" },
  booked: { label: "Booked", color: "outcome-booked", bgClass: "bg-[hsl(var(--outcome-booked))]", icon: "CalendarCheck", shortcut: "6" },
};
