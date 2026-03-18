export type CallOutcome =
  | "no_answer"
  | "voicemail"
  | "not_interested"
  | "dnc"
  | "follow_up"
  | "booked";

export interface Contact {
  id: string;
  business_name: string;
  contact_person: string | null;
  phone: string;
  email: string;
  website: string;
  gmb_link: string;
  industry: string;
  city: string | null;
  state: string | null;
  status: "uncalled" | "called";
  last_outcome: CallOutcome | null;
  created_at: string;
}

export interface CallLog {
  id: string;
  contact_id: string;
  user_id: string;
  outcome: CallOutcome;
  notes: string;
  follow_up_date: string | null;
  created_at: string;
}

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

const names = [
  "Johnson Plumbing Co.", "Arctic Air HVAC", "Bright Spark Electric", "Summit Roofing",
  "Green Thumb Landscaping", "Shield Pest Solutions", "Premier Auto Works", "Smile Dental Clinic",
  "Align Chiropractic", "Keystone Realty", "PipeMaster Services", "CoolBreeze HVAC",
  "Volt Electric Inc.", "TopShield Roofing", "EverGreen Yards", "BugFree Pest Control",
  "AutoCare Pro", "Pearl Dental Studio", "SpineWell Chiropractic", "HomeBase Realty",
  "FlowRight Plumbing", "TempControl Systems", "WirePro Electric", "IronClad Roofing",
  "NatureCraft Landscaping", "CritterGuard Pest", "MotorMax Auto", "BrightSmile Dental",
  "CoreHealth Chiro", "BlueSky Properties",
];

const contacts: string[] = [
  "Mike Johnson", "Sarah Chen", "Dave Wilson", "Tom Reeves", "Lisa Park",
  "James Brown", "Anna Martinez", "Chris Taylor", "Beth Adams", "Rick Nelson",
  "Pat O'Brien", "Diana Cruz", "Mark Stevens", "Julie Kim", "Dan Cooper",
  "Amy Foster", "Steve Rogers", "Karen White", "Bob Miller", "Jen Davis",
  "Paul Garcia", "Laura Hill", "Sam Wright", "Nina Patel", "Oscar Lee",
  "Tina Brooks", "Frank Moore", "Helen Young", "Ray Clark", "Megan Scott",
];

export const MOCK_CONTACTS: Contact[] = names.map((name, i) => ({
  id: `contact-${i + 1}`,
  business_name: name,
  contact_person: contacts[i],
  phone: `(555) ${String(100 + i).padStart(3, "0")}-${String(1000 + i * 37).slice(-4)}`,
  email: `info@${name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
  website: `https://www.${name.toLowerCase().replace(/[^a-z]/g, "")}.com`,
  gmb_link: `https://g.co/maps/${name.toLowerCase().replace(/[^a-z]/g, "")}`,
  industry: INDUSTRIES[i % INDUSTRIES.length],
  city: ["Denver", "Austin", "Portland", "Miami", "Seattle"][i % 5],
  state: ["CO", "TX", "OR", "FL", "WA"][i % 5],
  status: i < 5 ? "called" : "uncalled",
  last_outcome: i < 5 ? (["no_answer", "voicemail", "booked", "follow_up", "not_interested"] as CallOutcome[])[i] : null,
  created_at: new Date(Date.now() - i * 86400000).toISOString(),
}));

export const MOCK_CALL_LOGS: CallLog[] = MOCK_CONTACTS.filter(c => c.status === "called").map((c, i) => ({
  id: `log-${i + 1}`,
  contact_id: c.id,
  user_id: "user-1",
  outcome: c.last_outcome!,
  notes: ["No one picked up", "Left a message about our services", "Great call, demo scheduled for Friday", "Wants a callback next week", "Already has a provider"][i],
  follow_up_date: c.last_outcome === "follow_up" ? new Date(Date.now() + 3 * 86400000).toISOString() : null,
  created_at: c.created_at,
}));
