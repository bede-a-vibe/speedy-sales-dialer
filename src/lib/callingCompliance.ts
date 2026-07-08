/**
 * AU telemarketing compliance + local-presence helpers.
 *
 * Two responsibilities:
 *   1. Derive the AU area code / region for a lead so the caller-ID rotation
 *      can prefer a matching-area owned number (local presence).
 *   2. Enforce permitted calling windows per the AU Telemarketing Industry
 *      Standard: Mon–Fri 09:00–20:00, Sat 09:00–17:00, never Sunday, never a
 *      public holiday — evaluated in the LEAD's local timezone.
 *
 * No network calls. Pure functions. Holiday list is a maintainable constant.
 */

export type AuStateCode =
  | "NSW" | "ACT" | "VIC" | "TAS" | "QLD" | "SA" | "WA" | "NT";

export type AuAreaCode = "02" | "03" | "07" | "08" | "04";

// State → primary landline area code.
const STATE_TO_AREA_CODE: Record<AuStateCode, AuAreaCode> = {
  NSW: "02", ACT: "02",
  VIC: "03", TAS: "03",
  QLD: "07",
  SA: "08", WA: "08", NT: "08",
};

// State → IANA timezone. Encodes DST rules automatically.
const STATE_TO_TZ: Record<AuStateCode, string> = {
  NSW: "Australia/Sydney",
  ACT: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  TAS: "Australia/Hobart",
  QLD: "Australia/Brisbane",   // no DST
  SA:  "Australia/Adelaide",
  WA:  "Australia/Perth",      // no DST
  NT:  "Australia/Darwin",     // no DST
};

export const AREA_CODE_TO_REGION_LABEL: Record<AuAreaCode, string> = {
  "02": "NSW/ACT",
  "03": "VIC/TAS",
  "07": "QLD",
  "08": "SA/WA/NT",
  "04": "Mobile",
};

function normalizeState(state: string | null | undefined): AuStateCode | null {
  if (!state) return null;
  const s = state.trim().toUpperCase();
  if (s in STATE_TO_AREA_CODE) return s as AuStateCode;
  // Accept a few long-form spellings.
  const map: Record<string, AuStateCode> = {
    "NEW SOUTH WALES": "NSW",
    "AUSTRALIAN CAPITAL TERRITORY": "ACT",
    "VICTORIA": "VIC",
    "TASMANIA": "TAS",
    "QUEENSLAND": "QLD",
    "SOUTH AUSTRALIA": "SA",
    "WESTERN AUSTRALIA": "WA",
    "NORTHERN TERRITORY": "NT",
  };
  return map[s] ?? null;
}

/**
 * Derive the AU area code the DIALER should try to match for local presence.
 * Preference order:
 *   1. Lead's own phone (E.164 or 04/0X form) — most reliable signal.
 *   2. Lead's state — falls back to the state's default landline area.
 */
export function deriveLeadAreaCode(input: {
  phone?: string | null;
  phone_e164?: string | null;
  state?: string | null;
}): AuAreaCode | null {
  const raw = (input.phone_e164 || input.phone || "").trim();
  if (raw) {
    const digits = raw.replace(/[^0-9+]/g, "");
    if (/^\+?614/.test(digits)) return "04";
    if (/^04\d{8}$/.test(digits)) return "04";
    const m = digits.match(/^\+?61([2378])/);
    if (m) return (`0${m[1]}`) as AuAreaCode;
    const m2 = digits.match(/^0([2378])/);
    if (m2) return (`0${m2[1]}`) as AuAreaCode;
  }
  const st = normalizeState(input.state);
  if (st) return STATE_TO_AREA_CODE[st];
  return null;
}

// ── Public holidays ──────────────────────────────────────────────────────────
// National + per-state. Dates are ISO in the LEAD'S local calendar. Maintain
// per calendar year — dates that have passed can stay (cheap lookup).
// Current coverage: 2026.
const NATIONAL_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day
  "2026-01-26", // Australia Day
  "2026-04-03", // Good Friday
  "2026-04-04", // Easter Saturday
  "2026-04-06", // Easter Monday
  "2026-04-25", // Anzac Day
  "2026-12-25", // Christmas Day
  "2026-12-28", // Boxing Day (observed – 26th is Saturday)
];

const STATE_HOLIDAYS_2026: Record<AuStateCode, string[]> = {
  NSW: ["2026-06-08", "2026-08-03", "2026-10-05"], // King's Birthday, Bank, Labour
  ACT: ["2026-03-09", "2026-06-08", "2026-10-05"], // Canberra Day, King's, Labour
  VIC: ["2026-03-09", "2026-06-08", "2026-09-25", "2026-11-03"], // Labour, King's, Grand Final Fri, Melb Cup
  TAS: ["2026-02-09", "2026-03-09", "2026-06-08"], // Royal Hobart Regatta, Eight Hours, King's
  QLD: ["2026-05-04", "2026-10-05"], // Labour, King's Birthday
  SA:  ["2026-03-09", "2026-06-08", "2026-10-05"], // Adelaide Cup, King's, Labour
  WA:  ["2026-03-02", "2026-06-01", "2026-09-28"], // Labour, WA Day, King's
  NT:  ["2026-05-04", "2026-08-03", "2026-10-05"], // May Day, Picnic Day, King's
};

function isHoliday(state: AuStateCode | null, isoDate: string): boolean {
  if (NATIONAL_HOLIDAYS_2026.includes(isoDate)) return true;
  if (state && STATE_HOLIDAYS_2026[state].includes(isoDate)) return true;
  return false;
}

// ── Local-time computation ───────────────────────────────────────────────────
interface LocalTimeParts {
  isoDate: string;   // YYYY-MM-DD in lead-local
  dow: number;       // 0=Sun … 6=Sat
  hour: number;      // 0..23
  minute: number;
  hhmm: string;      // e.g. "14:37"
  tz: string;
  stateKnown: boolean;
  state: AuStateCode | null;
}

export function getLeadLocalTime(state: string | null | undefined, at: Date = new Date()): LocalTimeParts {
  const st = normalizeState(state);
  const tz = st ? STATE_TO_TZ[st] : "Australia/Melbourne";
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const isoDate = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = weekdayMap[get("weekday") as keyof typeof weekdayMap] ?? 0;
  return {
    isoDate, dow, hour, minute,
    hhmm: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    tz, stateKnown: !!st, state: st,
  };
}

// ── Window logic ─────────────────────────────────────────────────────────────
// AU Telemarketing Industry Standard permitted windows.
// Mon–Fri 09:00–20:00, Sat 09:00–17:00, never Sunday, never a public holiday.
function windowForDow(dow: number): { open: number; close: number } | null {
  if (dow === 0) return null;                  // Sunday
  if (dow === 6) return { open: 9, close: 17 }; // Saturday
  return { open: 9, close: 20 };                // Mon–Fri
}

export interface CallingWindowStatus {
  allowed: boolean;
  reason: "in_window" | "sunday" | "holiday" | "before_open" | "after_close";
  local: LocalTimeParts;
  nextOpenLabel: string;   // e.g. "Mon 09:00 local"
  stateUnknown: boolean;
}

function nextOpenFrom(local: LocalTimeParts): string {
  // Search up to 10 days forward for the next allowed window.
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  // Start from tomorrow if today already past its close, otherwise same-day open.
  const win = windowForDow(local.dow);
  const todayIsCallable = win && !isHoliday(local.state, local.isoDate) && local.hour < win.close;
  if (todayIsCallable && win && local.hour < win.open) {
    return `${dayNames[local.dow]} 09:00 ${local.tz.split("/")[1] ?? "local"}`;
  }
  // Walk day-by-day.
  const baseIsoParts = local.isoDate.split("-").map(Number);
  const baseUtc = Date.UTC(baseIsoParts[0], baseIsoParts[1] - 1, baseIsoParts[2]);
  for (let offset = 1; offset <= 10; offset++) {
    const d = new Date(baseUtc + offset * 86400000);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const dow = d.getUTCDay();
    const w = windowForDow(dow);
    if (w && !isHoliday(local.state, iso)) {
      return `${dayNames[dow]} 09:00 ${local.tz.split("/")[1] ?? "local"}`;
    }
  }
  return "next business day 09:00";
}

export function evaluateCallingWindow(
  state: string | null | undefined,
  at: Date = new Date(),
): CallingWindowStatus {
  const local = getLeadLocalTime(state, at);
  const stateUnknown = !local.stateKnown;

  if (isHoliday(local.state, local.isoDate)) {
    return { allowed: false, reason: "holiday", local, nextOpenLabel: nextOpenFrom(local), stateUnknown };
  }
  const win = windowForDow(local.dow);
  if (!win) {
    return { allowed: false, reason: "sunday", local, nextOpenLabel: nextOpenFrom(local), stateUnknown };
  }
  if (local.hour < win.open) {
    return { allowed: false, reason: "before_open", local, nextOpenLabel: nextOpenFrom(local), stateUnknown };
  }
  if (local.hour >= win.close) {
    return { allowed: false, reason: "after_close", local, nextOpenLabel: nextOpenFrom(local), stateUnknown };
  }
  return { allowed: true, reason: "in_window", local, nextOpenLabel: "", stateUnknown };
}

export function describeWindowReason(status: CallingWindowStatus, state: string | null | undefined): string {
  const st = state ?? (status.local.state ?? "unknown state");
  switch (status.reason) {
    case "sunday":      return `Outside calling hours for ${st} — no calls on Sunday. Opens ${status.nextOpenLabel}.`;
    case "holiday":     return `Outside calling hours for ${st} — public holiday. Opens ${status.nextOpenLabel}.`;
    case "before_open": return `Outside calling hours for ${st} — opens ${status.nextOpenLabel}.`;
    case "after_close": return `Outside calling hours for ${st} — closed for the day. Opens ${status.nextOpenLabel}.`;
    default:            return `In calling window for ${st}.`;
  }
}