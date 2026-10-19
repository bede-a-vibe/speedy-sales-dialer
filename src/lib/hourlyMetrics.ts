import type { ReportCallLog, ReportBookingItem } from "./reportMetrics";
import { ANSWERED_OUTCOMES, PITCHED_OUTCOMES, bucketOf, getTalkTimeSeconds } from "./reportMetrics";

export interface HourlyRow {
  hour: number;
  dials: number;
  pickUps: number;
  connections: number;
  bookings: number;
  talkTimeSeconds: number;
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
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return local === date;
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

export function getBookingHeatMapData(
  bookedItems: ReportBookingItem[],
  repUserId?: string,
): HeatMapCell[] {
  const grid = new Map<string, number>();

  for (const item of bookedItems) {
    if (!item.created_at) continue;
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
 * First meetings only, like the Setting-side Show-Up Rate: a follow-up is the closer's slot.
 * The rep filter is the setter, so Ben sees when his sets hold.
 */
export function getShowUpHeatMapData(
  bookedItems: ReportBookingItem[],
  repUserId?: string,
): RateHeatMapCell[] {
  const resolved = new Map<string, number>();
  const showed = new Map<string, number>();

  for (const item of bookedItems) {
    if (!item.scheduled_for) continue;
    if (repUserId && item.created_by !== repUserId) continue;
    if (item.is_follow_up) continue;
    const bucket = bucketOf(item);
    if (!bucket) continue;
    const key = slotKey(item.scheduled_for);
    resolved.set(key, (resolved.get(key) ?? 0) + 1);
    if (bucket === "showed") showed.set(key, (showed.get(key) ?? 0) + 1);
  }
  return toRateCells(resolved, showed);
}

/**
 * Close rate by the day and hour of the meeting that was pitched: closed ÷ pitched
 * (closed, no close, verbal, no-close follow-up), first or second meeting, with
 * not-qualified leads removed, exactly as the Custom Monitor's Close Rate. The rep
 * filter is the closer.
 */
export function getCloseRateHeatMapData(
  bookedItems: ReportBookingItem[],
  repUserId?: string,
): RateHeatMapCell[] {
  const pitched = new Map<string, number>();
  const closed = new Map<string, number>();

  for (const item of bookedItems) {
    if (!item.scheduled_for || !item.appointment_outcome) continue;
    if (repUserId && item.assigned_user_id !== repUserId) continue;
    if (!PITCHED_OUTCOMES.has(item.appointment_outcome)) continue;
    if (item.is_qualified === false) continue;
    const key = slotKey(item.scheduled_for);
    pitched.set(key, (pitched.get(key) ?? 0) + 1);
    if (item.appointment_outcome === "showed_closed") closed.set(key, (closed.get(key) ?? 0) + 1);
  }
  return toRateCells(pitched, closed);
}
