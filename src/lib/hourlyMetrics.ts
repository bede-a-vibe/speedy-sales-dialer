import type { ReportCallLog, ReportBookingItem } from "./reportMetrics";
import { ANSWERED_OUTCOMES, getTalkTimeSeconds } from "./reportMetrics";

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
