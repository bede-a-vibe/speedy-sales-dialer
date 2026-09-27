/**
 * Productive dialling hours.
 *
 * The setter package (Sep 2026) sets two contractual numbers: **7.5 productive
 * dialling hours a day** and **0.90 bookings per productive hour**. Neither was
 * measurable in the dialer — there is no clock, only a row per call.
 *
 * ── Why the definition matters more than the code ─────────────────────────
 * Inferring the clock from call timestamps is entirely sensitive to how long a
 * gap counts as "still dialling". On real data (Bede, 708 dials / 19 days) the
 * answer swings more than 4x:
 *
 *   gap capped at 5 min   → 0.77 hrs/day
 *   gap capped at 15 min  → 1.24 hrs/day
 *   first dial → last     → 3.31 hrs/day   (counts lunch as dialling)
 *
 * So the number is meaningless unless the rule is stated. This module uses
 * **session spans**: a session is a run of consecutive calls with no idle gap
 * longer than `idleCutoffMinutes`, and productive time is the sum of each
 * session's first→last span. On the same data that gives 0.72 hrs/day and
 * **1.24 bookings per productive hour** — which reconciles with the 1.14
 * measured when the package was designed. That agreement is the reason this
 * definition was chosen over the alternatives: it is the one the contractual
 * 0.90 target was actually derived from.
 *
 * ── The known undercount, deliberately surfaced ───────────────────────────
 * A session containing one call has a zero-length span, so it contributes a
 * dial but no time. That inflates dials-per-hour. Rather than paper over it
 * with an invented per-call allowance (which would break the reconciliation
 * above), the result reports `soloSessions` and `soloDials` so the bias is
 * visible in the UI instead of hidden in the average.
 */

/** From the setter package — 7.5 hrs/day from day 2, and 0.90 books/prod hour. */
export const TARGET_PRODUCTIVE_HOURS_PER_DAY = 7.5;
export const TARGET_BOOKINGS_PER_PRODUCTIVE_HOUR = 0.9;

export const DEFAULT_IDLE_CUTOFF_MINUTES = 15;
export const IDLE_CUTOFF_OPTIONS = [5, 10, 15, 20, 30] as const;

export interface CallLogLike {
  created_at: string;
  user_id?: string | null;
}

export interface ProductiveHoursResult {
  productiveHours: number;
  /** Days on which the rep logged at least one call — never calendar days. */
  activeDays: number;
  dials: number;
  sessions: number;
  hoursPerActiveDay: number | null;
  dialsPerProductiveHour: number | null;
  bookingsPerProductiveHour: number | null;
  /** Sessions of a single call: a dial with no measurable duration. */
  soloSessions: number;
  soloDials: number;
  idleCutoffMinutes: number;
  perDay: Array<{ day: string; hours: number; dials: number; sessions: number }>;
}

/** Melbourne calendar day, matching @/lib/eodDates and the EOD report. */
function melbourneDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "invalid";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export interface ComputeOptions {
  idleCutoffMinutes?: number;
  /** Restrict to one rep. Omit for the whole team. */
  repUserId?: string;
  /** Bookings made in the same window, used only for books-per-hour. */
  bookings?: number;
}

export function computeProductiveHours(
  callLogs: CallLogLike[],
  { idleCutoffMinutes = DEFAULT_IDLE_CUTOFF_MINUTES, repUserId, bookings }: ComputeOptions = {},
): ProductiveHoursResult {
  const cutoffMs = idleCutoffMinutes * 60_000;

  const byDay = new Map<string, number[]>();
  for (const log of callLogs) {
    if (repUserId && log.user_id !== repUserId) continue;
    const t = new Date(log.created_at).getTime();
    if (Number.isNaN(t)) continue;
    // Group per rep AND per day, so two reps dialling at once never merge into
    // one session and double-count as a single stretch of time.
    const key = `${log.user_id ?? "unknown"}|${melbourneDay(log.created_at)}`;
    const arr = byDay.get(key);
    if (arr) arr.push(t);
    else byDay.set(key, [t]);
  }

  let productiveMs = 0;
  let dials = 0;
  let sessions = 0;
  let soloSessions = 0;
  let soloDials = 0;
  const dayTotals = new Map<string, { hours: number; dials: number; sessions: number }>();

  for (const [key, times] of byDay) {
    times.sort((a, b) => a - b);
    const day = key.split("|")[1];
    let sessionStart = times[0];
    let sessionCalls = 1;
    let dayMs = 0;
    let daySessions = 0;

    const closeSession = (end: number) => {
      daySessions += 1;
      sessions += 1;
      dayMs += end - sessionStart;
      if (sessionCalls === 1) {
        soloSessions += 1;
        soloDials += 1;
      }
    };

    for (let i = 1; i < times.length; i++) {
      if (times[i] - times[i - 1] > cutoffMs) {
        closeSession(times[i - 1]);
        sessionStart = times[i];
        sessionCalls = 1;
      } else {
        sessionCalls += 1;
      }
    }
    closeSession(times[times.length - 1]);

    productiveMs += dayMs;
    dials += times.length;

    const prev = dayTotals.get(day) ?? { hours: 0, dials: 0, sessions: 0 };
    dayTotals.set(day, {
      hours: prev.hours + dayMs / 3_600_000,
      dials: prev.dials + times.length,
      sessions: prev.sessions + daySessions,
    });
  }

  const productiveHours = productiveMs / 3_600_000;
  const activeDays = dayTotals.size;
  const div = (a: number, b: number) => (b > 0 ? a / b : null);

  return {
    productiveHours,
    activeDays,
    dials,
    sessions,
    hoursPerActiveDay: div(productiveHours, activeDays),
    dialsPerProductiveHour: div(dials, productiveHours),
    bookingsPerProductiveHour: bookings === undefined ? null : div(bookings, productiveHours),
    soloSessions,
    soloDials,
    idleCutoffMinutes,
    perDay: [...dayTotals.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => (a.day < b.day ? -1 : 1)),
  };
}

export function formatHours(h: number | null): string {
  if (h === null || !Number.isFinite(h)) return "—";
  const totalMinutes = Math.round(h * 60);
  return `${Math.floor(totalMinutes / 60)}h ${String(totalMinutes % 60).padStart(2, "0")}m`;
}
