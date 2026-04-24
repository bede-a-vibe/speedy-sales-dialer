import type { ReportBookingItem, ReportCallLog, ReportContact, ReportMetrics } from "@/lib/reportMetrics";
import { getReportMetrics } from "@/lib/reportMetrics";

export type BreakdownDimensionId =
  | "none"
  | "industry"
  | "state"
  | "trade_type"
  | "work_type"
  | "rep";

export interface BreakdownDimension {
  id: BreakdownDimensionId;
  label: string;
}

export const BREAKDOWN_DIMENSIONS: BreakdownDimension[] = [
  { id: "none", label: "None" },
  { id: "industry", label: "Industry" },
  { id: "state", label: "State" },
  { id: "trade_type", label: "Trade Type" },
  { id: "work_type", label: "Work Type" },
  { id: "rep", label: "Rep" },
];

/** Call log enriched with optional contact metadata via Supabase join. */
export type BreakdownCallLog = ReportCallLog & {
  contacts?: {
    industry?: string | null;
    state?: string | null;
    trade_type?: string | null;
    work_type?: string | null;
  } | null;
};

/** Booked item enriched with optional contact metadata via Supabase join. */
export type BreakdownBookingItem = ReportBookingItem & {
  contacts?: {
    industry?: string | null;
    state?: string | null;
    trade_type?: string | null;
    work_type?: string | null;
  } | null;
};

const UNKNOWN_LABEL = "Unknown";

function normalize(value: string | null | undefined): string {
  if (!value) return UNKNOWN_LABEL;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN_LABEL;
}

function repLabelFromMap(repId: string | null | undefined, repNameMap?: Map<string, string>): string {
  if (!repId) return UNKNOWN_LABEL;
  return repNameMap?.get(repId) ?? "Unnamed rep";
}

export function getCallLogDimensionValue(
  log: BreakdownCallLog,
  dim: BreakdownDimensionId,
  repNameMap?: Map<string, string>,
): string {
  switch (dim) {
    case "industry":
      return normalize(log.contacts?.industry);
    case "state":
      return normalize(log.contacts?.state);
    case "trade_type":
      return normalize(log.contacts?.trade_type);
    case "work_type":
      return normalize(log.contacts?.work_type);
    case "rep":
      return repLabelFromMap(log.user_id, repNameMap);
    default:
      return UNKNOWN_LABEL;
  }
}

export function getBookingDimensionValue(
  item: BreakdownBookingItem,
  dim: BreakdownDimensionId,
  repNameMap?: Map<string, string>,
): string {
  switch (dim) {
    case "industry":
      return normalize(item.contacts?.industry);
    case "state":
      return normalize(item.contacts?.state);
    case "trade_type":
      return normalize(item.contacts?.trade_type);
    case "work_type":
      return normalize(item.contacts?.work_type);
    case "rep":
      return repLabelFromMap(item.created_by, repNameMap);
    default:
      return UNKNOWN_LABEL;
  }
}

export interface BreakdownGroup {
  key: string;
  label: string;
  isOther: boolean;
  metrics: ReportMetrics;
  callLogs: BreakdownCallLog[];
  bookings: BreakdownBookingItem[];
}

export interface BuildBreakdownOptions {
  dimension: BreakdownDimensionId;
  callLogs: BreakdownCallLog[];
  bookings: BreakdownBookingItem[];
  contacts?: ReportContact[];
  from: string;
  to: string;
  repUserId?: string;
  repNameMap?: Map<string, string>;
  /** Top-N groups by dial volume; remaining roll into "Other". 0 = no cap. */
  topN?: number;
}

export function buildBreakdownGroups({
  dimension,
  callLogs,
  bookings,
  contacts,
  from,
  to,
  repUserId,
  repNameMap,
  topN = 10,
}: BuildBreakdownOptions): BreakdownGroup[] {
  if (dimension === "none") return [];

  const filteredLogs = repUserId ? callLogs.filter((l) => l.user_id === repUserId) : callLogs;
  const filteredBookings = repUserId
    ? bookings.filter((b) => b.created_by === repUserId || b.assigned_user_id === repUserId)
    : bookings;

  const logBuckets = new Map<string, BreakdownCallLog[]>();
  for (const log of filteredLogs) {
    const key = getCallLogDimensionValue(log, dimension, repNameMap);
    const arr = logBuckets.get(key);
    if (arr) arr.push(log);
    else logBuckets.set(key, [log]);
  }

  const bookingBuckets = new Map<string, BreakdownBookingItem[]>();
  for (const item of filteredBookings) {
    const key = getBookingDimensionValue(item, dimension, repNameMap);
    const arr = bookingBuckets.get(key);
    if (arr) arr.push(item);
    else bookingBuckets.set(key, [item]);
  }

  const allKeys = new Set<string>([...logBuckets.keys(), ...bookingBuckets.keys()]);

  const initial: BreakdownGroup[] = Array.from(allKeys).map((key) => {
    const groupLogs = logBuckets.get(key) ?? [];
    const groupBookings = bookingBuckets.get(key) ?? [];
    const metrics = getReportMetrics({
      callLogs: groupLogs,
      bookedItems: groupBookings,
      contacts,
      from,
      to,
      repUserId,
    });
    return {
      key,
      label: key,
      isOther: false,
      metrics,
      callLogs: groupLogs,
      bookings: groupBookings,
    };
  });

  // Sort by dials desc, then by total bookings desc.
  initial.sort((a, b) => {
    const d = b.metrics.dialer.dials - a.metrics.dialer.dials;
    if (d !== 0) return d;
    return b.metrics.bookingsMade.totalBookingsMade - a.metrics.bookingsMade.totalBookingsMade;
  });

  if (topN <= 0 || initial.length <= topN) return initial;

  const top = initial.slice(0, topN);
  const overflow = initial.slice(topN);
  const otherLogs = overflow.flatMap((g) => g.callLogs);
  const otherBookings = overflow.flatMap((g) => g.bookings);
  const otherMetrics = getReportMetrics({
    callLogs: otherLogs,
    bookedItems: otherBookings,
    contacts,
    from,
    to,
    repUserId,
  });
  top.push({
    key: "__other__",
    label: `Other (${overflow.length})`,
    isOther: true,
    metrics: otherMetrics,
    callLogs: otherLogs,
    bookings: otherBookings,
  });
  return top;
}
