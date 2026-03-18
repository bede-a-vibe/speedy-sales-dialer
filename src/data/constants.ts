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
