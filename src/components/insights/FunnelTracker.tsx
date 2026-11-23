import { Fragment, memo, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Download, X } from "lucide-react";
import { toast } from "sonner";
import { ReportSection } from "@/components/reports/ReportSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrackerDailyInputsDialog } from "@/components/insights/TrackerDailyInputsDialog";
import type { BookedAppointmentReportItem, SalesRepOption } from "@/hooks/usePipelineItems";
import type { ReportCallLog } from "@/lib/reportMetrics";
import { useNewClients } from "@/hooks/useNewClients";
import { useAdminAccess } from "@/hooks/useUserRole";
import {
  useContactBookingHistory,
  useProductiveHoursByDay,
  useRecordDealPayment,
  useRepCompPlans,
  useSaveTrackerTarget,
  useSetterFirstDeals,
  useTrackerDailyInputs,
  useTrackerTargets,
  type TrackerTargetRow,
} from "@/hooks/useFunnelTracker";
import {
  addsUp,
  objectionsAddUp,
  awaitingPayment,
  bracketLabel,
  paidCommissionCash,
  type AwaitingPayment,
  buildDailyTrackerStats,
  creditNewClients,
  daysBetween,
  dayKeyOf,
  defaultMonthOpen,
  defaultWeekOpen,
  lastDayOfMonth,
  leadsFor,
  monthOf,
  pctOf,
  ratio,
  saleCommissions,
  setterCost,
  sumTrackerStats,
  weekKey,
  weeksOf,
  tierSplitOf,
  totalCost,
  type CompPlanRow,
  type SetterFirstDeal,
  type NewClientWithCredit,
  type SaleCommission,
  type TierFilter,
  type TrackerFunnel,
  type TrackerInputRow,
  type TrackerStats,
} from "@/lib/funnelTracker";
import type { NewClient } from "@/hooks/useNewClients";
import { cn } from "@/lib/utils";

/**
 * Insights > Tracker: the IWB Funnel Flowthrough Tracker on the dialer's data.
 * One row per Melbourne day, a month total and a target row per month, and the
 * sheet's sections left to right. The maths lives in lib/funnelTracker.ts.
 */

interface Props {
  dateFrom: string;
  dateTo: string;
  callLogs: ReportCallLog[];
  bookings: BookedAppointmentReportItem[];
  rescheduleSlots?: BookedAppointmentReportItem[];
  reps: SalesRepOption[];
  activeRepId?: string;
  selectedRepLabel?: string;
  /** View-only link: no editing, no daily inputs, no setter pay. */
  readOnly?: boolean;
}

type Fmt = "n" | "dec" | "pct" | "money" | "hours" | "x" | "check";

interface Ctx {
  funnel: TrackerFunnel;
  isMonth: boolean;
}

interface ColumnDef {
  key: string;
  section: string;
  label: string;
  fmt: Fmt;
  hint?: string;
  value: (s: TrackerStats, ctx: Ctx) => number | null | boolean;
  /** Editable monthly target, and which way is good. */
  target?: { metric: string; better: "higher" | "lower" };
  funnels?: TrackerFunnel[];
  /** Shown only when the tier filter is All (the Tier split section). */
  allTiersOnly?: boolean;
  /** Tier 1 / Tier 2 pair: the higher of the two is green on month rows. */
  pair?: string;
}

/** One Tier 1 / Tier 2 column pair for the Tier split section. */
function tierPair(
  key: string,
  label: string,
  fmt: Fmt,
  pick: (t: ReturnType<typeof tierSplitOf>) => number | null,
  hint: string,
): ColumnDef[] {
  return (["tier_1", "tier_2"] as const).map((t) => ({
    key: `${key}${t === "tier_1" ? "T1" : "T2"}`,
    section: "Tier split",
    label: `${label} ${t === "tier_1" ? "T1" : "T2"}`,
    fmt,
    hint,
    allTiersOnly: true,
    pair: key,
    value: (s: TrackerStats) => pick(tierSplitOf(s, t)),
  }));
}

const BOTH: TrackerFunnel[] = ["cold", "ads"];

const COLUMNS: ColumnDef[] = [
  // Marketing (Ads view only)
  { key: "adSpend", section: "Marketing", label: "Ad spend", fmt: "money", funnels: ["ads"], hint: "Daily inputs (ads)", value: (s) => s.adSpend, target: { metric: "ad_spend", better: "lower" } },
  { key: "clicks", section: "Marketing", label: "Clicks", fmt: "n", funnels: ["ads"], hint: "Daily inputs (ads)", value: (s) => s.clicks },
  { key: "cpc", section: "Marketing", label: "CPC", fmt: "money", funnels: ["ads"], hint: "ad spend ÷ clicks", value: (s) => ratio(s.adSpend, s.clicks) },
  { key: "leads", section: "Marketing", label: "Leads", fmt: "n", funnels: ["ads"], hint: "Daily inputs (ads)", value: (s) => s.leads, target: { metric: "leads", better: "higher" } },
  { key: "cpl", section: "Marketing", label: "CPL", fmt: "money", funnels: ["ads"], hint: "ad spend ÷ leads", value: (s) => ratio(s.adSpend, s.leads), target: { metric: "cpl", better: "lower" } },
  { key: "tier1Leads", section: "Marketing", label: "Tier 1 leads", fmt: "n", funnels: ["ads"], hint: "distinct leads with a Tier 1 booking made that day", value: (s) => s.tier1Leads },
  { key: "pctTier1", section: "Marketing", label: "% Tier 1", fmt: "pct", funnels: ["ads"], hint: "Tier 1 leads ÷ leads", value: (s) => pctOf(s.tier1Leads, s.leads) },
  { key: "dbsCreated", section: "Marketing", label: "DBs created", fmt: "n", funnels: ["ads"], hint: "self-booked first meetings made that day", value: (s) => s.dbsCreated },
  { key: "bookingRequests", section: "Marketing", label: "Booking requests", fmt: "n", funnels: ["ads"], hint: "'call me' requests made that day", value: (s) => s.bookingRequests },
  { key: "costPerDb", section: "Marketing", label: "Cost per DB", fmt: "money", funnels: ["ads"], hint: "ad spend ÷ DBs created", value: (s) => ratio(s.adSpend, s.dbsCreated) },

  // Setting
  { key: "dials", section: "Setting", label: "Dials", fmt: "n", funnels: ["cold"], hint: "calls logged in the dialer", value: (s) => s.dials, target: { metric: "dials", better: "higher" } },
  { key: "answers", section: "Setting", label: "Answers", fmt: "n", funnels: ["cold"], hint: "pick-ups (same outcomes as Insights)", value: (s) => s.answers },
  { key: "answerRate", section: "Setting", label: "Answer rate", fmt: "pct", funnels: ["cold"], hint: "answers ÷ dials", value: (s) => pctOf(s.answers, s.dials) },
  { key: "rostered", section: "Setting", label: "Rostered hours", fmt: "hours", funnels: ["cold"], hint: "Daily inputs, per setter", value: (s) => s.rosteredHours },
  { key: "productive", section: "Setting", label: "Productive dialling hours", fmt: "hours", funnels: ["cold"], hint: "dials × 25s + talk time + 5 min a booking (same as Targets)", value: (s) => s.productiveHours },
  { key: "hoursGap", section: "Setting", label: "Hours discrepancy", fmt: "hours", funnels: ["cold"], hint: "productive − rostered (blank until rostered hours are entered)", value: (s) => (s.rosteredHours > 0 ? s.productiveHours - s.rosteredHours : null) },
  { key: "dialsPerLead", section: "Setting", label: "Dials per lead", fmt: "dec", funnels: ["cold"], hint: "dials ÷ unique leads dialled", value: (s) => ratio(s.dials, s.leadsDialled.size) },
  { key: "manualSets", section: "Setting", label: "Manual sets", fmt: "n", hint: "first meetings booked by a setter by phone (blank method on a cold booking counts here)", value: (s) => s.manualSets },
  { key: "confirmedDbs", section: "Setting", label: "Confirmed DBs", fmt: "n", funnels: ["ads"], hint: "self-booked first meetings (no separate confirm step is recorded yet)", value: (s) => s.confirmedDbs },
  { key: "totalSets", section: "Setting", label: "Total sets", fmt: "n", hint: "every first meeting booked that day", value: (s) => s.totalSets, target: { metric: "total_sets", better: "higher" } },
  { key: "setsT1", section: "Setting", label: "Tier 1 sets", fmt: "n", hint: "total sets with a Tier 1 booking (3+ on the tools incl. owner and $50k+ a month)", value: (s) => s.setsT1 },
  { key: "setsT2", section: "Setting", label: "Tier 2 sets", fmt: "n", hint: "total sets with a Tier 2 booking", value: (s) => s.setsT2 },
  { key: "setsUnknownTier", section: "Setting", label: "Unknown tier sets", fmt: "n", hint: "no tier on the booking and not enough contact details to work one out; T1 + T2 + unknown = total sets", value: (s) => s.setsUnknownTier },
  { key: "pctSetsT1", section: "Setting", label: "% Tier 1", fmt: "pct", hint: "Tier 1 sets ÷ total sets", value: (s) => pctOf(s.setsT1, s.totalSets) },
  { key: "pctSetsT2", section: "Setting", label: "% Tier 2", fmt: "pct", hint: "Tier 2 sets ÷ total sets", value: (s) => pctOf(s.setsT2, s.totalSets) },
  { key: "leadToSet", section: "Setting", label: "Lead-to-set rate", fmt: "pct", hint: "total sets ÷ leads (cold: unique leads dialled)", value: (s, c) => pctOf(s.totalSets, leadsFor(s, c.funnel)) },
  { key: "answerToSet", section: "Setting", label: "Answer-to-set rate", fmt: "pct", funnels: ["cold"], hint: "total sets ÷ answers", value: (s) => pctOf(s.totalSets, s.answers) },
  { key: "setsPerHour", section: "Setting", label: "Sets per productive hour", fmt: "dec", funnels: ["cold"], value: (s) => ratio(s.totalSets, s.productiveHours) },
  { key: "costPerSet", section: "Setting", label: "Cost per set", fmt: "money", hint: "setter cost ÷ total sets", value: (s) => ratio(setterCost(s), s.totalSets) },

  // Closing calendar
  { key: "availability", section: "Closing calendar", label: "Availability", fmt: "dec", hint: "bookable hours on the calendar (same as the Closing tab)", value: (s) => s.availability },
  { key: "bookingsOnCal", section: "Closing calendar", label: "Bookings on calendar", fmt: "n", hint: "first meetings due that day, including slots later moved", value: (s) => s.bookingsOnCal, target: { metric: "bookings_on_cal", better: "higher" } },
  { key: "bookedRate", section: "Closing calendar", label: "Booked rate", fmt: "pct", hint: "bookings on calendar ÷ availability", value: (s) => pctOf(s.bookingsOnCal, s.availability) },
  { key: "live", section: "Closing calendar", label: "Live calls", fmt: "n", hint: "first-meeting sittings", value: (s) => s.live, target: { metric: "live_calls", better: "higher" } },
  { key: "showRate", section: "Closing calendar", label: "Show rate", fmt: "pct", hint: "live calls ÷ bookings on calendar", value: (s) => pctOf(s.live, s.bookingsOnCal), target: { metric: "show_rate", better: "higher" } },
  { key: "showIfNotMissed", section: "Closing calendar", label: "Show rate if not missed", fmt: "pct", hint: "(live + missed by us) ÷ bookings on calendar", value: (s) => pctOf(s.live + s.missedByUs, s.bookingsOnCal) },
  { key: "cancels", section: "Closing calendar", label: "Cancels", fmt: "n", value: (s) => s.cancels },
  { key: "noShows", section: "Closing calendar", label: "No-shows", fmt: "n", hint: "prospect no-shows (missed by us left out)", value: (s) => s.noShows },
  { key: "reschedules", section: "Closing calendar", label: "Reschedules", fmt: "n", hint: "missed slots of moved meetings", value: (s) => s.reschedules },
  { key: "missedByUs", section: "Closing calendar", label: "Missed by us", fmt: "n", hint: "no-shows marked 'We missed it (late / double-booked)'", value: (s) => s.missedByUs },
  { key: "pending", section: "Closing calendar", label: "Pending", fmt: "n", hint: "upcoming or no result logged yet", value: (s) => s.pending },
  { key: "addsUp", section: "Closing calendar", label: "Adds up?", fmt: "check", hint: "live + cancels + no-shows + reschedules + missed + pending = bookings on calendar", value: (s) => addsUp(s) },
  { key: "qualifiedLive", section: "Closing calendar", label: "Qualified live calls", fmt: "n", hint: "live calls marked qualified", value: (s) => s.qualifiedLive },
  { key: "notQualifiedLive", section: "Closing calendar", label: "Not qualified live calls", fmt: "n", hint: "live calls marked not qualified: the DQ pile, kept out of Why they didn't close", value: (s) => s.notQualifiedLive },
  { key: "qualifiedRate", section: "Closing calendar", label: "Qualified rate", fmt: "pct", hint: "qualified ÷ live calls marked qualified or not; unmarked ones are left out", value: (s) => pctOf(s.qualifiedLive, s.qualifiedLive + s.notQualifiedLive) },
  { key: "costPerQualified", section: "Closing calendar", label: "Cost per qualified live call", fmt: "money", hint: "total cost ÷ qualified live calls", value: (s) => ratio(totalCost(s), s.qualifiedLive) },

  // Closing results
  { key: "newClients", section: "Closing results", label: "New clients", fmt: "n", hint: "first deal starts that day (revenue records, same as Won on Overview)", value: (s) => s.newClients, target: { metric: "new_clients", better: "higher" } },
  { key: "cash", section: "Closing results", label: "Cash collected", fmt: "money", hint: "first-deal monthly value + one-off", value: (s) => s.cash, target: { metric: "cash_collected", better: "higher" } },
  { key: "avgCash", section: "Closing results", label: "Avg cash per client", fmt: "money", value: (s) => ratio(s.cash, s.newClients) },
  { key: "cashPerLead", section: "Closing results", label: "Cash per lead", fmt: "money", value: (s, c) => ratio(s.cash, leadsFor(s, c.funnel)) },
  { key: "cashPerBooking", section: "Closing results", label: "Cash per booking", fmt: "money", hint: "cash ÷ total sets", value: (s) => ratio(s.cash, s.totalSets) },
  { key: "cashPerLive", section: "Closing results", label: "Cash per live call", fmt: "money", value: (s) => ratio(s.cash, s.live) },
  { key: "leadToClose", section: "Closing results", label: "Lead-to-close", fmt: "pct", value: (s, c) => pctOf(s.newClients, leadsFor(s, c.funnel)) },
  { key: "bookingToClose", section: "Closing results", label: "Booking-to-close", fmt: "pct", hint: "new clients ÷ total sets", value: (s) => pctOf(s.newClients, s.totalSets) },
  { key: "liveToClose", section: "Closing results", label: "Live-call-to-close", fmt: "pct", value: (s) => pctOf(s.newClients, s.live) },
  { key: "qualifiedToClose", section: "Closing results", label: "Qualified live-call-to-close", fmt: "pct", hint: "new clients ÷ qualified live calls", value: (s) => pctOf(s.newClients, s.qualifiedLive) },

  // Why they didn't close (after the results, Bede 23 Nov)
  { key: "stillInPlay", section: "Why they didn't close", label: "Second meeting booked", fmt: "n", hint: "didn't close on the day but the next meeting is booked: still in the funnel, not counted below", value: (s) => s.stillInPlay },
  { key: "didntClose", section: "Why they didn't close", label: "Didn't close", fmt: "n", hint: "qualified live calls marked No close or No close follow-up. Not-qualified ones are in the DQ pile (Not qualified live calls)", value: (s) => s.didntClose },
  { key: "whyPrice", section: "Why they didn't close", label: "Price / budget", fmt: "n", value: (s) => s.whyPrice },
  { key: "whyThink", section: "Why they didn't close", label: "Needs to think / partner", fmt: "n", value: (s) => s.whyThink },
  { key: "whyTiming", section: "Why they didn't close", label: "Timing", fmt: "n", value: (s) => s.whyTiming },
  { key: "whyAgency", section: "Why they didn't close", label: "Has an agency / trust", fmt: "n", value: (s) => s.whyAgency },
  { key: "whyFear", section: "Why they didn't close", label: "Fear / risk", fmt: "n", value: (s) => s.whyFear },
  { key: "whyOther", section: "Why they didn't close", label: "Other (incl. never pitched)", fmt: "n", value: (s) => s.whyOther },
  { key: "whyBlank", section: "Why they didn't close", label: "No objection recorded", fmt: "n", hint: "find them in Pipelines > Completed: filter Didn't close + No reason recorded", value: (s) => s.whyBlank },
  { key: "objectionsAddUp", section: "Why they didn't close", label: "Objections add up?", fmt: "check", hint: "price + think + timing + agency + fear + other = didn't close. A cross means some have no objection recorded", value: (s) => objectionsAddUp(s) },

  // Tier split (All tiers only): Tier 1 vs Tier 2 side by side. Unknown tier is in neither.
  ...tierPair("live", "Live calls", "n", (t) => t.live, "first-meeting sittings of that tier"),
  ...tierPair("showRate", "Show rate", "pct", (t) => t.showRate, "live calls ÷ bookings on calendar, within the tier"),
  ...tierPair("newClients", "New clients", "n", (t) => t.newClients, "new clients whose latest booking is that tier"),
  ...tierPair("setToClose", "Set-to-close", "pct", (t) => t.setToClose, "new clients ÷ sets, within the tier"),
  ...tierPair("liveToClose", "Live-call-to-close", "pct", (t) => t.liveToClose, "new clients ÷ live calls, within the tier"),
  ...tierPair("cash", "Cash", "money", (t) => t.cash, "first-deal monthly value + one-off, within the tier"),
  ...tierPair("avgCash", "Avg cash per client", "money", (t) => t.avgCash, "cash ÷ new clients, within the tier"),
  ...tierPair("cashPerSet", "Cash per set", "money", (t) => t.cashPerSet, "cash ÷ sets, within the tier"),

  // P&L
  { key: "setterCost", section: "P&L", label: "Setter cost", fmt: "money", hint: "base ÷ 365 a day for active setters, plus that day's commission", value: (s) => setterCost(s) },
  { key: "commission", section: "P&L", label: "Commission", fmt: "money", hint: "on first-month cash, on the day it is paid: each retainer dollar earns the rate of the bracket it falls in on the setter's month running total of cash paid, 5% on one-off; the month is the sum of its days", value: (s) => s.commission },
  { key: "plAdSpend", section: "P&L", label: "Ad spend", fmt: "money", funnels: ["ads"], value: (s) => s.adSpend },
  { key: "totalCost", section: "P&L", label: "Total cost", fmt: "money", value: (s) => totalCost(s) },
  { key: "cpa", section: "P&L", label: "CPA", fmt: "money", hint: "total cost ÷ new clients", value: (s) => ratio(totalCost(s), s.newClients) },
  { key: "roas", section: "P&L", label: "ROAS", fmt: "x", hint: "cash ÷ total cost", value: (s) => ratio(s.cash, totalCost(s)) },
  { key: "grossPl", section: "P&L", label: "Gross P&L", fmt: "money", hint: "cash − total cost", value: (s) => s.cash - totalCost(s) },
];

function formatValue(v: number | null | boolean, fmt: Fmt): string {
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (v === null || !Number.isFinite(v)) return "-";
  switch (fmt) {
    case "pct":
      return `${Math.round(v)}%`;
    case "money": {
      const abs = Math.abs(v);
      const body = abs < 100 && abs % 1 !== 0
        ? abs.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : Math.round(abs).toLocaleString("en-AU");
      return `${v < 0 ? "-" : ""}$${body}`;
    }
    case "hours":
    case "dec":
      return (Math.round(v * 10) / 10).toLocaleString("en-AU");
    case "x":
      return `${(Math.round(v * 100) / 100).toFixed(2)}x`;
    default:
      return Math.round(v).toLocaleString("en-AU");
  }
}

/** Raw value for the CSV: no currency symbols or separators. */
function csvValue(v: number | null | boolean, fmt: Fmt): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (v === null || !Number.isFinite(v)) return "-";
  if (fmt === "n") return String(Math.round(v));
  return String(Math.round(v * 100) / 100);
}

function fmtDayLabel(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  return `${d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()} ${d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}`;
}
function fmtMonthLabel(month: string) {
  return new Date(`${month}T12:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });
}

function varianceClass(value: number | null | boolean, target: number | null | undefined, better: "higher" | "lower") {
  if (typeof value !== "number" || target == null || !Number.isFinite(value)) return undefined;
  const good = better === "higher" ? value >= target : value <= target;
  return good ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400";
}

interface MonthBlock {
  month: string;
  days: string[];
  total: TrackerStats;
}

type CellValue = number | null | boolean;

interface WeekRows {
  /** First and last day of the week inside the month. */
  from: string;
  to: string;
  total: CellValue[];
  pairWinners: Set<string>;
  days: { day: string; values: CellValue[] }[];
}

interface MonthRows {
  month: string;
  total: CellValue[];
  /** Column keys of the higher value in each Tier 1 / Tier 2 pair. */
  pairWinners: Set<string>;
  /** Sunday-to-Saturday weeks inside the month, each with its own total row. */
  weeks: WeekRows[];
}

/** "Week 1–7 Nov", or "Week 30 Nov" for a one-day week. */
function fmtWeekLabel(from: string, to: string) {
  const dayMonth = (d: string) => fmtDayLabel(d).split(" ").slice(1).join(" ");
  const fromDay = String(Number(from.slice(8, 10)));
  return from === to ? `Week ${dayMonth(to)}` : `Week ${fromDay}–${dayMonth(to)}`;
}

// Stable empty defaults: a fresh [] or Map each render would re-run the memos below.
const NO_CLIENTS: NewClient[] = [];
const NO_INPUTS: TrackerInputRow[] = [];
const NO_PLANS: CompPlanRow[] = [];
const NO_FIRST_DEALS: SetterFirstDeal[] = [];
const NO_TARGETS: TrackerTargetRow[] = [];
const NO_HOURS = new Map<string, Map<string, number>>();
const NO_HISTORY: { history: []; contacts: undefined } = { history: [], contacts: undefined };

const OPEN_STORAGE_KEY = "insights-tracker-month-open-v1";
function readOpenState(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(OPEN_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
function writeOpenState(state: Record<string, boolean>) {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private window or blocked storage: collapse state just is not remembered.
  }
}

function pairWinnersOf(columns: ColumnDef[], values: CellValue[]) {
  const winners = new Set<string>();
  const byPair = new Map<string, { key: string; v: CellValue }[]>();
  columns.forEach((c, i) => {
    if (!c.pair) return;
    const list = byPair.get(c.pair) ?? [];
    list.push({ key: c.key, v: values[i] });
    byPair.set(c.pair, list);
  });
  for (const [, [a, b]] of byPair) {
    if (!a || !b || typeof a.v !== "number" || typeof b.v !== "number" || !Number.isFinite(a.v) || !Number.isFinite(b.v)) continue;
    if (a.v > b.v) winners.add(a.key);
    else if (b.v > a.v) winners.add(b.key);
  }
  return winners;
}

function CheckCell({ v }: { v: CellValue }) {
  return v ? <Check aria-label="adds up" className="mx-auto h-3.5 w-3.5 text-emerald-600" /> : <X aria-label="does not add up" className="mx-auto h-3.5 w-3.5" />;
}

function TargetCell({
  month, funnel, metric, value, fmt, canEdit,
}: { month: string; funnel: TrackerFunnel; metric: string; value: number | null | undefined; fmt: Fmt; canEdit: boolean }) {
  const save = useSaveTrackerTarget();
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => setDraft(value == null ? "" : String(value)), [value]);
  if (!canEdit) return <>{value == null ? "-" : formatValue(value, fmt)}</>;
  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next !== null && !Number.isFinite(next)) { toast.error("Targets are numbers."); return; }
    if (next === (value ?? null)) return;
    save.mutate({ month, funnel, metric, value: next }, { onError: () => toast.error("Could not save the target.") });
  };
  return (
    <Input
      aria-label={`Target ${metric} ${month}`}
      inputMode="decimal"
      value={draft}
      placeholder="-"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="h-6 w-20 bg-background px-1 text-center font-mono text-xs"
    />
  );
}

interface TrackerMonthProps {
  block: MonthRows;
  open: boolean;
  onToggle: (updates: Record<string, boolean>) => void;
  columns: ColumnDef[];
  sectionStart: Set<string>;
  funnel: TrackerFunnel;
  targetMap: Map<string, TrackerTargetRow>;
  canEdit: boolean;
  today: string;
  /** Comma-joined first days of this month's open weeks (a string so the memo compares by value). */
  openWeeks: string;
}

/**
 * One stacked month: the bold total row (click to show or hide the days), its
 * target row, then the day rows when open. Memoised so a toggle re-renders
 * only the month clicked; the values come precomputed in `block`.
 */
const TrackerMonth = memo(function TrackerMonth({ block, open, onToggle, columns, sectionStart, funnel, targetMap, canEdit, today, openWeeks }: TrackerMonthProps) {
  const label = fmtMonthLabel(block.month);
  const weekOpen = new Set(openWeeks ? openWeeks.split(",") : []);
  const targetOf = (metric: string) => targetMap.get(`${block.month}|${funnel}|${metric}`)?.value ?? null;
  return (
    <>
      <tr className="cursor-pointer bg-primary/10" onClick={() => onToggle({ [block.month]: !open })}>
        <td className="sticky left-0 z-10 border-b border-r border-border bg-solid-primary-20 px-1 py-1 font-semibold whitespace-nowrap">
          {/* No handler of its own: the click bubbles to the row, so it toggles once. */}
          <button type="button" aria-expanded={open} className="flex items-center gap-1 rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden="true" />
            <span>{label} total</span>
          </button>
        </td>
        {columns.map((c, i) => {
          const v = block.total[i];
          const t = c.target ? targetOf(c.target.metric) : null;
          return (
            <td
              key={c.key}
              className={cn(
                "border-b border-border px-1.5 py-1 text-center font-mono font-semibold tabular-nums",
                sectionStart.has(c.key) && "border-l",
                c.target && varianceClass(v, t, c.target.better),
                block.pairWinners.has(c.key) && "text-emerald-700 dark:text-emerald-300",
                c.fmt === "check" && v === false && "text-red-600 dark:text-red-400",
              )}
            >
              {c.fmt === "check" ? <CheckCell v={v} /> : formatValue(v, c.fmt)}
            </td>
          );
        })}
      </tr>
      <tr className="bg-muted/40">
        <td className="sticky left-0 z-10 border-b border-r border-border bg-muted px-2 py-1 text-muted-foreground whitespace-nowrap">
          Target
        </td>
        {columns.map((c) => (
          <td key={c.key} className={cn("border-b border-border px-1 py-0.5 text-center font-mono tabular-nums text-muted-foreground", sectionStart.has(c.key) && "border-l")}>
            {c.target ? (
              <TargetCell month={block.month} funnel={funnel} metric={c.target.metric} value={targetOf(c.target.metric)} fmt={c.fmt} canEdit={canEdit} />
            ) : null}
          </td>
        ))}
      </tr>
      {open
        ? block.weeks.map((week) => (
            <Fragment key={week.from}>
              <tr
                className="cursor-pointer bg-muted/60"
                data-week-total={week.from}
                onClick={() => onToggle({ [weekKey(week.from)]: !weekOpen.has(week.from) })}
              >
                <td className="sticky left-0 z-10 border-b border-r border-border bg-muted px-1 py-1 font-semibold whitespace-nowrap">
                  {/* No handler of its own: the click bubbles to the row, so it toggles once. */}
                  <button
                    type="button"
                    aria-expanded={weekOpen.has(week.from)}
                    className="flex items-center gap-1 rounded-sm pl-3 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", weekOpen.has(week.from) && "rotate-90")} aria-hidden="true" />
                    <span>{fmtWeekLabel(week.from, week.to)}</span>
                  </button>
                </td>
                {columns.map((c, i) => {
                  const v = week.total[i];
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "border-b border-border px-1.5 py-1 text-center font-mono font-semibold tabular-nums",
                        sectionStart.has(c.key) && "border-l",
                        week.pairWinners.has(c.key) && "text-emerald-700 dark:text-emerald-300",
                        c.fmt === "check" && v === false && "text-red-600 dark:text-red-400",
                      )}
                    >
                      {c.fmt === "check" ? <CheckCell v={v} /> : formatValue(v, c.fmt)}
                    </td>
                  );
                })}
              </tr>
              {weekOpen.has(week.from) && week.days.map(({ day: d, values }) => (
                <tr key={d} className="hover:bg-muted/30">
                  <td
                    className={cn(
                      "sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-1 whitespace-nowrap",
                      d > today ? "text-muted-foreground/60" : d === today ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {fmtDayLabel(d)}
                  </td>
                  {columns.map((c, i) => {
                    const v = values[i];
                    const empty = v === null || v === 0;
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "border-b border-border px-1.5 py-1 text-center font-mono tabular-nums",
                          sectionStart.has(c.key) && "border-l",
                          empty ? "text-muted-foreground/50" : "text-foreground",
                          c.fmt === "check" && v === false && "text-red-600 dark:text-red-400",
                        )}
                      >
                        {c.fmt === "check" ? <CheckCell v={v} /> : formatValue(v, c.fmt)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))
        : null}
    </>
  );
});

const money = (v: number) => formatValue(v, "money");

/**
 * "Commission by sale": every first-month payment in the range for a setter on
 * the plan, with its own share of the setter's month commission, grouped by
 * month, then setter, with a subtotal per setter. Below it, the deals still
 * owed first-month cash, each with a "Mark paid" control. Collapsed by default.
 */
function CommissionBySale({ sales, awaiting, repName }: { sales: SaleCommission[]; awaiting: AwaitingPayment[]; repName: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const byMonth = new Map<string, Map<string, SaleCommission[]>>();
    for (const sale of sales) {
      const bySetter = byMonth.get(sale.month) ?? new Map<string, SaleCommission[]>();
      bySetter.set(sale.setter_id, [...(bySetter.get(sale.setter_id) ?? []), sale]);
      byMonth.set(sale.month, bySetter);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, bySetter]) => ({
        month,
        setters: [...bySetter.entries()]
          .map(([setterId, list]) => ({ setterId, name: repName.get(setterId) ?? setterId.slice(0, 8), list }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [sales, repName]);
  const sum = <T,>(list: T[], pick: (x: T) => number) => list.reduce((t, x) => t + pick(x), 0);
  const cell = "border-b border-border px-2 py-1 text-right font-mono tabular-nums";
  const head = "sticky top-0 border-b border-border bg-muted px-2 py-1 font-medium";
  return (
    <div className="mt-3 rounded-md border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-left text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden="true" />
        Commission by sale
        <span className="font-normal text-muted-foreground">
          ({sales.length} paid, {money(sum(sales, (x) => x.commission))}
          {awaiting.length > 0 ? `; ${awaiting.length} awaiting payment, ${money(sum(awaiting, (x) => x.outstanding))}` : ""})
        </span>
      </button>
      {open ? (
        <div className="max-h-[60vh] overflow-auto border-t border-border">
          {sales.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">No first-month cash paid in this range for a setter on the commission plan.</p>
          ) : (
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-muted text-muted-foreground">
                  <th className={cn(head, "text-left")} title="the day the cash was paid: commission lands in this month">Paid</th>
                  <th className={cn(head, "text-left")}>Client</th>
                  <th className={cn(head, "text-left")}>Setter</th>
                  <th className={cn(head, "text-left")} title="first deal start day">Sale</th>
                  <th className={cn(head, "text-right")} title="first-month retainer cash paid">Retainer paid</th>
                  <th className={cn(head, "text-right")}>One-off paid</th>
                  <th className={cn(head, "text-right")} title="setter's first-month retainer cash paid in the calendar month, after this payment">Month running total</th>
                  <th className={cn(head, "text-left")}>Bracket(s)</th>
                  <th className={cn(head, "text-right")}>Commission</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.month}>
                    <tr className="bg-primary/10">
                      <td colSpan={9} className="border-b border-border px-2 py-1 font-semibold">{fmtMonthLabel(g.month)}</td>
                    </tr>
                    {g.setters.map((st) => (
                      <Fragment key={st.setterId}>
                        {st.list.map((x) => (
                          <tr key={`${x.contact_id}|${x.day}`} className="hover:bg-muted/30">
                            <td className="border-b border-border px-2 py-1 whitespace-nowrap text-muted-foreground">{fmtDayLabel(x.day)}</td>
                            <td className="border-b border-border px-2 py-1">{x.business_name || "Unnamed client"}</td>
                            <td className="border-b border-border px-2 py-1 whitespace-nowrap">{st.name}</td>
                            <td className="border-b border-border px-2 py-1 whitespace-nowrap text-muted-foreground">{x.sale_start ? fmtDayLabel(x.sale_start) : "-"}</td>
                            <td className={cell}>{x.retainer > 0 ? money(x.retainer) : "-"}</td>
                            <td className={cell}>{x.oneOff > 0 ? money(x.oneOff) : "-"}</td>
                            <td className={cell}>{money(x.runningAfter)}</td>
                            <td className="border-b border-border px-2 py-1 whitespace-nowrap">{bracketLabel(x)}</td>
                            <td className={cn(cell, "text-foreground")}>{money(x.commission)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/40 font-semibold">
                          <td colSpan={4} className="border-b border-border px-2 py-1">{st.name} subtotal</td>
                          <td className={cell}>{money(sum(st.list, (x) => x.retainer))}</td>
                          <td className={cell}>{money(sum(st.list, (x) => x.oneOff))}</td>
                          <td className={cell} />
                          <td className="border-b border-border" />
                          <td className={cell}>{money(sum(st.list, (x) => x.commission))}</td>
                        </tr>
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          <AwaitingPaymentTable rows={awaiting} repName={repName} />
        </div>
      ) : null}
    </div>
  );
}

/** Deals still owed first-month cash. "Mark paid" records a payment (the paid marker). */
function AwaitingPaymentTable({ rows, repName }: { rows: AwaitingPayment[]; repName: Map<string, string> }) {
  const record = useRecordDealPayment();
  const today = dayKeyOf(new Date().toISOString());
  const [editing, setEditing] = useState<string | null>(null);
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState("");
  const cell = "border-b border-border px-2 py-1 text-right font-mono tabular-nums";
  const head = "sticky top-0 border-b border-border bg-muted px-2 py-1 font-medium";
  const start = (r: AwaitingPayment) => {
    setEditing(r.deal_id);
    setPaidOn(today);
    setAmount(String(r.outstanding));
  };
  const save = (r: AwaitingPayment) => {
    const value = Number(amount);
    if (!paidOn || !(value > 0)) {
      toast.error("Enter the paid date and an amount above $0");
      return;
    }
    record.mutate(
      { deal_id: r.deal_id, paid_on: paidOn, amount: value },
      {
        onSuccess: () => {
          toast.success(`Payment recorded for ${r.business_name || "the client"}`);
          setEditing(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record the payment"),
      },
    );
  };
  return (
    <div className="border-t border-border">
      <p className="px-2 py-1.5 text-xs font-semibold">
        Awaiting payment <span className="font-normal text-muted-foreground">(no commission until the first month's cash is paid)</span>
      </p>
      {rows.length === 0 ? (
        <p className="px-2 pb-2 text-[11px] text-muted-foreground">Every credited deal has its first month paid.</p>
      ) : (
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr className="bg-muted text-muted-foreground">
              <th className={cn(head, "text-left")}>Sale</th>
              <th className={cn(head, "text-left")}>Client</th>
              <th className={cn(head, "text-left")}>Setter</th>
              <th className={cn(head, "text-right")}>First month</th>
              <th className={cn(head, "text-right")}>Paid</th>
              <th className={cn(head, "text-right")}>Outstanding</th>
              <th className={cn(head, "text-left")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.deal_id} className="hover:bg-muted/30">
                <td className="border-b border-border px-2 py-1 whitespace-nowrap text-muted-foreground">{fmtDayLabel(r.start_date)}</td>
                <td className="border-b border-border px-2 py-1">
                  {r.business_name || "Unnamed client"}
                  {r.billing_period === "one_off" ? <span className="ml-1 text-muted-foreground">(one-off)</span> : null}
                </td>
                <td className="border-b border-border px-2 py-1 whitespace-nowrap">{repName.get(r.setter_id) ?? r.setter_id.slice(0, 8)}</td>
                <td className={cell}>{money(r.value)}</td>
                <td className={cell}>{r.paid > 0 ? money(r.paid) : "-"}</td>
                <td className={cn(cell, "text-foreground")}>{money(r.outstanding)}</td>
                <td className="border-b border-border px-2 py-1 whitespace-nowrap">
                  {editing === r.deal_id ? (
                    <span className="flex items-center gap-1">
                      <Input type="date" aria-label="Paid on" value={paidOn} max={today} onChange={(e) => setPaidOn(e.target.value)} className="h-7 w-[8.5rem] text-xs" />
                      <Input type="number" aria-label="Amount paid" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-7 w-24 text-xs" />
                      <Button size="sm" className="h-7 px-2 text-xs" disabled={record.isPending} onClick={() => save(r)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => start(r)}>Mark paid</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function FunnelTracker({ dateFrom, dateTo, callLogs, bookings, rescheduleSlots = [], reps, activeRepId, selectedRepLabel, readOnly = false }: Props) {
  const [funnel, setFunnel] = useState<TrackerFunnel>("cold");
  const [tier, setTier] = useState<TierFilter>("all");
  const [inputsOpen, setInputsOpen] = useState(false);
  const { canViewAdmin: isAdminOrCoach } = useAdminAccess();
  // A shared link is view only even for an admin who opens it.
  const canViewAdmin = isAdminOrCoach && !readOnly;

  const days = useMemo(() => (dateFrom && dateTo && dateFrom <= dateTo ? daysBetween(dateFrom, dateTo) : []), [dateFrom, dateTo]);
  const firstMonth = dateFrom ? monthOf(dateFrom) : undefined;
  const lastMonth = dateTo ? monthOf(dateTo) : undefined;

  // New clients for the whole calendar months in view: commission is monthly.
  const { data: newClients = NO_CLIENTS } = useNewClients(firstMonth, lastMonth ? lastDayOfMonth(lastMonth) : undefined);
  const { data: historyData = NO_HISTORY } = useContactBookingHistory(newClients.map((n) => n.contact_id));
  const { data: inputs = NO_INPUTS } = useTrackerDailyInputs(dateFrom, dateTo);
  const { data: targets = NO_TARGETS } = useTrackerTargets(firstMonth, lastMonth);
  const { data: compPlans = NO_PLANS } = useRepCompPlans();
  const { data: firstDeals = NO_FIRST_DEALS } = useSetterFirstDeals(canViewAdmin);
  const { data: productiveHours = NO_HOURS } = useProductiveHoursByDay(dateFrom, dateTo, funnel === "cold");

  const credited = useMemo<NewClientWithCredit[]>(
    () => creditNewClients(newClients, historyData.history, historyData.contacts),
    [newClients, historyData],
  );
  // Commission is paid on first-month cash collected, in the month it lands.
  const commissionCash = useMemo(() => paidCommissionCash(firstDeals), [firstDeals]);
  const awaiting = useMemo(() => awaitingPayment(firstDeals, compPlans, activeRepId), [firstDeals, compPlans, activeRepId]);
  const items = useMemo(() => [...bookings, ...rescheduleSlots], [bookings, rescheduleSlots]);

  const daily = useMemo(
    () => buildDailyTrackerStats({ days, funnel, tier, repId: activeRepId, callLogs, items, inputs, productiveHours, newClients: credited, commissionCash, compPlans }),
    [days, funnel, tier, activeRepId, callLogs, items, inputs, productiveHours, credited, commissionCash, compPlans],
  );

  const months = useMemo<MonthBlock[]>(() => {
    const byMonth = new Map<string, string[]>();
    for (const d of days) {
      const m = monthOf(d);
      byMonth.set(m, [...(byMonth.get(m) ?? []), d]);
    }
    return [...byMonth.entries()].map(([month, mDays]) => {
      // Month total = sum of its days, commission included (it is allocated per sale).
      return { month, days: mDays, total: sumTrackerStats(mDays.map((d) => daily.get(d)!)) };
    });
  }, [days, daily]);

  // Every credited sale in the range with its own commission. The running
  // totals start at the 1st of each month, so sales before the range still count.
  const sales = useMemo<SaleCommission[]>(
    () => (funnel === "cold" ? saleCommissions(commissionCash, compPlans, activeRepId).filter((x) => x.day >= dateFrom && x.day <= dateTo) : []),
    [funnel, commissionCash, compPlans, activeRepId, dateFrom, dateTo],
  );
  const repName = useMemo(() => new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Unnamed"])), [reps]);

  const targetMap = useMemo(() => {
    const m = new Map<string, TrackerTargetRow>();
    for (const t of targets) m.set(`${t.month.slice(0, 10)}|${t.funnel}|${t.metric}`, t);
    return m;
  }, [targets]);
  const targetOf = (month: string, metric: string) => targetMap.get(`${month}|${funnel}|${metric}`)?.value ?? null;

  const columns = useMemo(
    () => COLUMNS.filter((c) => (c.funnels ?? BOTH).includes(funnel) && (!c.allTiersOnly || tier === "all")),
    [funnel, tier],
  );
  const sections = useMemo(() => {
    const out: { title: string; span: number }[] = [];
    for (const c of columns) {
      const last = out[out.length - 1];
      if (last && last.title === c.section) last.span += 1;
      else out.push({ title: c.section, span: 1 });
    }
    return out;
  }, [columns]);
  const sectionStart = useMemo(() => new Set(columns.filter((c, i) => i === 0 || columns[i - 1].section !== c.section).map((c) => c.key)), [columns]);

  const today = dayKeyOf(new Date().toISOString());
  const currentMonth = monthOf(today);

  // Every month total and day row, worked out once per data change. Collapsing
  // a month only stops its day rows rendering; nothing here re-runs.
  const rows = useMemo<MonthRows[]>(() => {
    const ctxMonth: Ctx = { funnel, isMonth: true };
    const ctxDay: Ctx = { funnel, isMonth: false };
    return months.map((block) => {
      const total = columns.map((c) => c.value(block.total, ctxMonth));
      return {
        month: block.month,
        total,
        pairWinners: pairWinnersOf(columns, total),
        weeks: weeksOf(block.days).map((wDays) => {
          const weekTotal = columns.map((c) => c.value(sumTrackerStats(wDays.map((d) => daily.get(d)!)), ctxMonth));
          return {
            from: wDays[0],
            to: wDays[wDays.length - 1],
            total: weekTotal,
            pairWinners: pairWinnersOf(columns, weekTotal),
            days: wDays.map((d) => {
              const s = daily.get(d)!;
              return { day: d, values: columns.map((c) => c.value(s, ctxDay)) };
            }),
          };
        }),
      };
    });
  }, [months, columns, daily, funnel]);

  // Collapse state per month, remembered in this browser. Months nobody has
  // toggled follow the default: only the current month (or a lone month) open.
  const [openState, setOpenState] = useState<Record<string, boolean>>(readOpenState);
  const isOpen = useCallback(
    (month: string) => openState[month] ?? defaultMonthOpen(month, currentMonth, months.length),
    [openState, currentMonth, months.length],
  );
  const setOpen = useCallback((updates: Record<string, boolean>) => {
    setOpenState((prev) => {
      const next = { ...prev, ...updates };
      writeOpenState(next);
      return next;
    });
  }, []);
  const isWeekOpen = useCallback(
    (from: string, to: string, weekCount: number) => openState[weekKey(from)] ?? defaultWeekOpen(from, to, today, weekCount),
    [openState, today],
  );
  const openWeeksOf = (block: MonthRows) =>
    block.weeks.filter((w) => isWeekOpen(w.from, w.to, block.weeks.length)).map((w) => w.from).join(",");
  const allOpen =
    rows.length > 0 && rows.every((b) => isOpen(b.month) && b.weeks.every((w) => isWeekOpen(w.from, w.to, b.weeks.length)));
  // Expand all opens every month and week; Collapse all closes both.
  const setAllOpen = (open: boolean) =>
    setOpen(Object.fromEntries(rows.flatMap((b) => [[b.month, open], ...b.weeks.map((w) => [weekKey(w.from), open])])));

  const downloadCsv = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines: string[] = [];
    lines.push(["Row", ...columns.map((c) => `${c.section}: ${c.label}`)].map(esc).join(","));
    // Every row, collapsed months included.
    for (const block of rows) {
      lines.push([`${fmtMonthLabel(block.month)} total`, ...columns.map((c, i) => csvValue(block.total[i], c.fmt))].map(esc).join(","));
      lines.push([`${fmtMonthLabel(block.month)} target`, ...columns.map((c) => {
        if (!c.target) return "";
        const t = targetOf(block.month, c.target.metric);
        return t == null ? "" : String(t);
      })].map(esc).join(","));
      for (const w of block.weeks) {
        for (const d of w.days) {
          lines.push([d.day, ...columns.map((c, i) => csvValue(d.values[i], c.fmt))].map(esc).join(","));
        }
        lines.push([fmtWeekLabel(w.from, w.to), ...columns.map((c, i) => csvValue(w.total[i], c.fmt))].map(esc).join(","));
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `funnel-tracker-${funnel}-${dateFrom}-to-${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toggle = <T extends string>(value: T, current: T, set: (v: T) => void, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => set(value)}
      aria-pressed={current === value}
      className={cn(
        "rounded-sm px-2.5 py-1 text-xs transition-colors",
        current === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  const plHidden = compPlans.length === 0;

  return (
    <ReportSection
      title="Funnel flowthrough tracker"
      description={`A month total and a target row for each month, oldest first; click a month to show or hide its days${selectedRepLabel ? `. ${selectedRepLabel}: dials, hours and sets as setter, the calendar as closer, new clients and pay as the credited setter` : ""}. Sets count by the day booked, the calendar by the meeting day, new clients by the day the first deal starts.`}
      className="overflow-hidden"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-border bg-background p-0.5" role="group" aria-label="Funnel view">
          {toggle<TrackerFunnel>("cold", funnel, setFunnel, "Cold call")}
          {toggle<TrackerFunnel>("ads", funnel, setFunnel, "Ads")}
        </div>
        <div className="flex rounded-md border border-border bg-background p-0.5" role="group" aria-label="Tier filter">
          {toggle<TierFilter>("all", tier, setTier, "All")}
          {toggle<TierFilter>("tier_1", tier, setTier, "Tier 1")}
          {toggle<TierFilter>("tier_2", tier, setTier, "Tier 2")}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {readOnly ? null : (
            <Button type="button" variant="outline" size="sm" onClick={() => setInputsOpen(true)}>
              Daily inputs
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setAllOpen(!allOpen)} disabled={months.length === 0}>
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={downloadCsv} disabled={days.length === 0}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Download CSV
          </Button>
        </div>
      </div>
      {tier !== "all" ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Dials are not split by tier. The tier filter applies to bookings, the calendar and new clients; costs stay whole. The tier
          split shows under All.
        </p>
      ) : null}
      {funnel === "ads" ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Ads starts in 2027, so most of this view is empty until ad spend, clicks and leads are entered. Dials and dialling hours
          sit on the Cold call view: the dialer does not split them by lead source yet. Setter pay also sits on the Cold call view.
        </p>
      ) : null}
      {plHidden ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          {readOnly
            ? "Setter pay is left out of shared links, so costs here leave it out."
            : "Setter pay is visible to admins and coaches only, so costs here leave it out."}
        </p>
      ) : null}

      <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 top-0 z-30 min-w-[120px] border-b border-r border-border bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">
                Day
              </th>
              {sections.map((s) => (
                <th
                  key={s.title}
                  colSpan={s.span}
                  className="sticky top-0 z-20 h-7 border-b border-l border-border bg-muted px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  {s.title}
                </th>
              ))}
            </tr>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  title={c.hint}
                  className={cn(
                    "sticky top-7 z-20 min-w-[84px] border-b border-border bg-card px-1.5 py-1.5 text-center align-bottom font-medium leading-tight text-foreground",
                    sectionStart.has(c.key) && "border-l",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((block) => (
              <TrackerMonth
                key={block.month}
                block={block}
                open={isOpen(block.month)}
                onToggle={setOpen}
                columns={columns}
                sectionStart={sectionStart}
                funnel={funnel}
                targetMap={targetMap}
                canEdit={canViewAdmin}
                today={today}
                openWeeks={openWeeksOf(block)}
              />
            ))}
          </tbody>
        </table>
      </div>
      {funnel === "cold" && !plHidden && !readOnly ? <CommissionBySale sales={sales} awaiting={awaiting} repName={repName} /> : null}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Hover a column name for its definition. "-" means nothing to divide by. Tier comes from the booking (team size on the
        tools including the owner and monthly revenue at booking), else the contact's details; older bookings with neither are
        unknown and only show under All. Commission is the setter's marginal plan, credited to whoever made the lead's first
        booking, and is paid on first-month cash collected in the month it is paid (mark payments under Commission by sale).
        It is allocated per payment in date order: each dollar earns the rate of the bracket it falls in.
        {tier === "all"
          ? " Tier split: a new client takes the tier of the contact's latest booking. Unknown-tier bookings and clients are left out of both tier columns, so T1 + T2 can be less than the totals. The higher of each pair is green on month rows."
          : null}
      </p>

      {readOnly ? null : (
        <TrackerDailyInputsDialog
          open={inputsOpen}
          onOpenChange={setInputsOpen}
          defaultDay={dateTo && dateTo < today ? dateTo : today}
          reps={reps}
          compPlans={compPlans}
        />
      )}
    </ReportSection>
  );
}
