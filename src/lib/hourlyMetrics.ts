import type { ReportCallLog, ReportBookingItem } from "./reportMetrics";
import { ANSWERED_OUTCOMES, bucketOf, getTalkTimeSeconds, wasPitched } from "./reportMetrics";

export interface HourlyRow {
  hour: number;
  dials: number;
  pickUps: number;
  /** Calls that reached the Connection stage (call_logs.reached_connection): a conversation with the decision maker. */
  connections: number;
  bookings: number;
  talkTimeSeconds: number;
}

/** YYYY-MM-DD of an ISO timestamp in LOCAL time (Melbourne on the team's machines). */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Today's YYYY-MM-DD in local time. toISOString() gives the UTC date, which is
 * still yesterday before 10am (11am in daylight saving) Melbourne.
 */
export function todayLocalDateKey(now: Date = new Date()): string {
  return localDateKey(now);
}

/**
 * True when an ISO timestamp falls on the given YYYY-MM-DD in LOCAL time.
 *
 * created_at is stored in UTC, so a string prefix compare silently drops every
 * call before 10am Melbourne (UTC+10) — their UTC stamp carries the previous
 * day's date. That hid a full hour of dialling from the report.
 */
function isSameLocalDate(iso: string | null | undefined, date: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return localDateKey(d) === date;
}

/** Is the timestamp's local date inside [from, to]? A missing end is unbounded. */
function inLocalRange(iso: string | null | undefined, from?: string, to?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const key = localDateKey(d);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

export interface DateRange {
  dateFrom?: string;
  dateTo?: string;
}

export function getHourlyMetrics(
  callLogs: ReportCallLog[],
  /** Kept for call-site compatibility; bookings are now read off the call log. */
  _bookedItems: ReportBookingItem[],
  date: string,
  repUserId?: string,
): HourlyRow[] {
  const rows: HourlyRow[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    dials: 0,
    pickUps: 0,
    connections: 0,
    bookings: 0,
    talkTimeSeconds: 0,
  }));

  for (const log of callLogs) {
    if (repUserId && log.user_id !== repUserId) continue;
    if (!isSameLocalDate(log.created_at, date)) continue;
    const hour = new Date(log.created_at).getHours();
    rows[hour].dials += 1;
    rows[hour].talkTimeSeconds += getTalkTimeSeconds(log);
    if (ANSWERED_OUTCOMES.has(log.outcome)) {
      rows[hour].pickUps += 1;
    }
    // This column used to be a copy of Pick Ups. It is now the Connection
    // stage: a gatekeeper pickup is a pick-up but not a connection.
    if (log.reached_connection === true) {
      rows[hour].connections += 1;
    }
    // Credit the booking to the hour the CALL happened, not the hour the
    // pipeline record was saved — a 15:58 call written up at 16:07 belongs
    // to 3pm, and every other figure in this row comes from the call log.
    if (log.outcome === "booked") {
      rows[hour].bookings += 1;
    }
  }

  return rows;
}

export interface HeatMapCell {
  dayOfWeek: number; // 0=Mon, 6=Sun
  hour: number;
  count: number;
}

/**
 * Bookings MADE, by the day and hour they were made. The bookings list is
 * "created OR scheduled in range", so meetings booked before the window that
 * fall inside it used to be plotted too. Only rows created in the range count,
 * and a second meeting with a lead who already sat is not a booking made (same
 * rule as Bookings Made). Missed slots of moved meetings are never bookings.
 */
export function getBookingHeatMapData(
  bookedItems: ReportBookingItem[],
  repUserId?: string,
  range: DateRange = {},
): HeatMapCell[] {
  const grid = new Map<string, number>();

  for (const item of bookedItems) {
    if (!item.created_at) continue;
    if (item.is_reschedule_slot || item.is_follow_up) continue;
    if (!inLocalRange(item.created_at, range.dateFrom, range.dateTo)) continue;
    if (repUserId && item.created_by !== repUserId) continue;
    const d = new Date(item.created_at);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    const hour = d.getHours();
    const key = `${dow}-${hour}`;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }

  const cells: HeatMapCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h < 24; h++) {
      cells.push({ dayOfWeek: dow, hour: h, count: grid.get(`${dow}-${h}`) ?? 0 });
    }
  }
  return cells;
}

export interface PickupHeatMapCell {
  dayOfWeek: number;
  hour: number;
  dials: number;
  pickUps: number;
  pickUpRate: number; // 0..1
}

export function getPickupHeatMapData(
  callLogs: ReportCallLog[],
  repUserId?: string,
): PickupHeatMapCell[] {
  const dials = new Map<string, number>();
  const picks = new Map<string, number>();

  for (const log of callLogs) {
    if (repUserId && log.user_id !== repUserId) continue;
    if (!log.created_at) continue;
    const d = new Date(log.created_at);
    const dow = (d.getDay() + 6) % 7;
    const hour = d.getHours();
    const key = `${dow}-${hour}`;
    dials.set(key, (dials.get(key) ?? 0) + 1);
    if (ANSWERED_OUTCOMES.has(log.outcome)) {
      picks.set(key, (picks.get(key) ?? 0) + 1);
    }
  }

  const cells: PickupHeatMapCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h < 24; h++) {
      const key = `${dow}-${h}`;
      const d = dials.get(key) ?? 0;
      const p = picks.get(key) ?? 0;
      cells.push({ dayOfWeek: dow, hour: h, dials: d, pickUps: p, pickUpRate: d > 0 ? p / d : 0 });
    }
  }
  return cells;
}

export interface RateHeatMapCell {
  dayOfWeek: number; // 0=Mon, 6=Sun
  hour: number;
  /** Denominator: resolved slots for show-up, pitched meetings for close rate. */
  base: number;
  hits: number;
  rate: number;
}

function toRateCells(base: Map<string, number>, hits: Map<string, number>): RateHeatMapCell[] {
  const cells: RateHeatMapCell[] = [];
  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h < 24; h++) {
      const key = `${dow}-${h}`;
      const b = base.get(key) ?? 0;
      const n = hits.get(key) ?? 0;
      cells.push({ dayOfWeek: dow, hour: h, base: b, hits: n, rate: b > 0 ? n / b : 0 });
    }
  }
  return cells;
}

function slotKey(iso: string) {
  const d = new Date(iso);
  return `${(d.getDay() + 6) % 7}-${d.getHours()}`;
}

/**
 * Show-up by the day and hour the meeting was SCHEDULED FOR (not when it was booked).
 * Same rule as the Setting-side Show-Up Rate:
 *   showed / (showed + no-show + cancelled + rescheduled),
 *   first meetings only, slots scheduled inside the range,
 *   pending and upcoming slots left out.
 * Every missed slot of a moved meeting (meeting_reschedules kind 'move') is a
 * rescheduled slot at the time it was moved FROM, even after the new meeting
 * happens. The rep filter is the setter, so Ben sees when his sets hold.
 */
export function getShowUpHeatMapData(
  bookedItems: ReportBookingItem[],
  repUserId?: string,
  options: DateRange & { rescheduleSlots?: ReportBookingItem[] } = {},
): RateHeatMapCell[] {
  const resolved = new Map<string, number>();
  const showed = new Map<string, number>();
  const { dateFrom, dateTo, rescheduleSlots = [] } = options;

  // Slots may also arrive mixed into the bookings list; count each one once.
  const slotsById = new Map<string, ReportBookingItem>();
  for (const slot of [...rescheduleSlots, ...bookedItems.filter((item) => item.is_reschedule_slot)]) {
    slotsById.set(slot.id, slot);
  }

  const add = (scheduledFor: string, didShow: boolean) => {
    const key = slotKey(scheduledFor);
    resolved.set(key, (resolved.get(key) ?? 0) + 1);
    if (didShow) showed.set(key, (showed.get(key) ?? 0) + 1);
  };

  for (const item of bookedItems) {
    if (item.is_reschedule_slot || !item.scheduled_for) continue;
    if (!inLocalRange(item.scheduled_for, dateFrom, dateTo)) continue;
    if (repUserId && item.created_by !== repUserId) continue;
    if (item.is_follow_up) continue;
    const bucket = bucketOf(item);
    if (!bucket) continue;
    add(item.scheduled_for, bucket === "showed");
  }
  for (const slot of slotsById.values()) {
    // On a slot, scheduled_for is the from time: when the meeting was meant to be.
    if (!slot.scheduled_for) continue;
    if (!inLocalRange(slot.scheduled_for, dateFrom, dateTo)) continue;
    if (repUserId && slot.created_by !== repUserId) continue;
    if (slot.is_follow_up) continue;
    add(slot.scheduled_for, false);
  }
  return toRateCells(resolved, showed);
}

/**
 * Close rate by the day and hour of the meeting that was pitched: closed ÷ pitched,
 * first or second meeting, with not-qualified leads removed. Pitched is the shared
 * wasPitched() rule (the closer's Pitched / Not pitched answer wins, a close is
 * always a pitch, older rows fall back to the outcome), on sittings scheduled
 * inside the range, the same as the Closing tab. The rep filter is the closer.
 */
export function getCloseRateHeatMapData(
  bookedItems: Array<ReportBookingItem & { pitched?: boolean | null }>,
  repUserId?: string,
  range: DateRange = {},
): RateHeatMapCell[] {
  const pitched = new Map<string, number>();
  const closed = new Map<string, number>();

  for (const item of bookedItems) {
    if (!item.scheduled_for || item.is_reschedule_slot) continue;
    if (!inLocalRange(item.scheduled_for, range.dateFrom, range.dateTo)) continue;
    if (repUserId && item.assigned_user_id !== repUserId) continue;
    if (bucketOf(item) !== "showed" || !wasPitched(item)) continue;
    if (item.is_qualified === false) continue;
    const key = slotKey(item.scheduled_for);
    pitched.set(key, (pitched.get(key) ?? 0) + 1);
    if (item.appointment_outcome === "showed_closed") closed.set(key, (closed.get(key) ?? 0) + 1);
  }
  return toRateCells(pitched, closed);
}

/** Outcomes that mean nobody (or only a machine) answered, even when Dialpad says connected. */
const MACHINE_OUTCOMES = new Set(["no_answer", "voicemail"]);

export interface TalkTimeCallRow {
  user_id: string | null;
  talk_time_seconds: number | null;
  started_at: string | null;
  is_connected: boolean | null;
  direction: string | null;
  /** call_logs.outcome of the linked call log (via dialpad_calls.call_log_id); null when not linked. */
  outcome: string | null;
}

/**
 * A human connect: Dialpad says the call connected AND the rep logged an
 * outcome that is not no answer / voicemail. Dialpad marks voicemail greetings
 * and answering machines as connected (1,636 of 2,523 "connected" calls,
 * 9 to 16 Nov 2026), so is_connected alone is not a pickup. A call with no
 * linked call log has no outcome to confirm a person, so it is not counted.
 */
export function isHumanConnect(call: Pick<TalkTimeCallRow, "is_connected" | "outcome">): boolean {
  return call.is_connected === true && !!call.outcome && !MACHINE_OUTCOMES.has(call.outcome);
}

/** Talk seconds that count as talk with a person (0 on voicemail and machine pickups). */
export function humanTalkSeconds(call: TalkTimeCallRow): number {
  if (call.direction === "inbound") return Math.max(0, call.talk_time_seconds ?? 0);
  return isHumanConnect(call) ? Math.max(0, call.talk_time_seconds ?? 0) : 0;
}

export interface TalkTimeSummary {
  /** Outbound calls (dials). */
  calls: number;
  humanConnects: number;
  /** Talk with people: human connects plus inbound call-backs. */
  talkSeconds: number;
  /** humanConnects / calls */
  connectRate: number;
  /** Outbound talk on human connects / human connects. */
  avgTalkPerConnect: number;
}

/**
 * Talk time panel totals. Inbound calls (prospects ringing back) are not dials,
 * so they stay out of calls and connects; their talk still counts as talk time.
 */
export function summariseTalkTime(rows: TalkTimeCallRow[], repUserId?: string): TalkTimeSummary {
  let calls = 0;
  let humanConnects = 0;
  let outboundTalk = 0;
  let inboundTalk = 0;
  for (const row of rows) {
    if (repUserId && row.user_id !== repUserId) continue;
    if (row.direction === "inbound") {
      inboundTalk += humanTalkSeconds(row);
      continue;
    }
    calls += 1;
    if (isHumanConnect(row)) {
      humanConnects += 1;
      outboundTalk += humanTalkSeconds(row);
    }
  }
  return {
    calls,
    humanConnects,
    talkSeconds: outboundTalk + inboundTalk,
    connectRate: calls > 0 ? humanConnects / calls : 0,
    avgTalkPerConnect: humanConnects > 0 ? outboundTalk / humanConnects : 0,
  };
}
