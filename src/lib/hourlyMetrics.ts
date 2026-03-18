import type { ReportCallLog, ReportBookingItem } from "./reportMetrics";

const ANSWERED_OUTCOMES = new Set<ReportCallLog["outcome"]>([
  "not_interested",
  "dnc",
  "follow_up",
  "booked",
]);

function getTalkTimeSeconds(callLog: ReportCallLog) {
  if (typeof callLog.dialpad_talk_time_seconds === "number") {
    return Math.max(0, callLog.dialpad_talk_time_seconds);
  }
  if (typeof callLog.dialpad_total_duration_seconds === "number") {
    return Math.max(0, callLog.dialpad_total_duration_seconds);
  }
  return 0;
}

export interface HourlyRow {
  hour: number;
  dials: number;
  pickUps: number;
  bookings: number;
  talkTimeSeconds: number;
}

export function getHourlyMetrics(
  callLogs: ReportCallLog[],
  bookedItems: ReportBookingItem[],
  date: string,
  repUserId?: string,
): HourlyRow[] {
  const rows: HourlyRow[] = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    dials: 0,
    pickUps: 0,
    bookings: 0,
    talkTimeSeconds: 0,
  }));

  for (const log of callLogs) {
    if (repUserId && log.user_id !== repUserId) continue;
    if (!log.created_at.startsWith(date)) continue;
    const hour = new Date(log.created_at).getHours();
    rows[hour].dials += 1;
    rows[hour].talkTimeSeconds += getTalkTimeSeconds(log);
    if (ANSWERED_OUTCOMES.has(log.outcome)) {
      rows[hour].pickUps += 1;
    }
  }

  for (const item of bookedItems) {
    if (repUserId && item.created_by !== repUserId) continue;
    if (!item.created_at.startsWith(date)) continue;
    const hour = new Date(item.created_at).getHours();
    rows[hour].bookings += 1;
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
): HeatMapCell[] {
  const grid = new Map<string, number>();

  for (const item of bookedItems) {
    if (!item.created_at) continue;
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
