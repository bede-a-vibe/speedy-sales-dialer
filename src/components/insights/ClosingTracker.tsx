import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ReportSection } from "@/components/reports/ReportSection";
import type { BookedAppointmentReportItem } from "@/hooks/usePipelineItems";
import { cn } from "@/lib/utils";

/**
 * The IWB "Elites Closing" tracker, rebuilt on the dialer's own bookings: one column per
 * day, a roll-up after every week, and a total for the range. Every row is derived from
 * pipeline_items on Bede's definitions (showed over resolved slots, first meetings for the
 * setting rates, closed over pitched for the close rates, first collection for cash).
 * Rows the dialer cannot see yet (GMeet time, deposits vs paid-in-full) are not faked.
 */

interface Props {
  dateFrom: string;
  dateTo: string;
  bookings: BookedAppointmentReportItem[];
  activeRepId?: string;
  selectedRepLabel?: string;
}

type Item = BookedAppointmentReportItem;

const TZ = "Australia/Melbourne";
const SHOWED = new Set(["showed_closed", "showed_no_close", "showed_verbal_commitment", "second_meeting_booked", "no_close_follow_up", "disqualified"]);
const PITCHED = new Set(["showed_closed", "showed_no_close", "showed_verbal_commitment", "no_close_follow_up"]);
const NO_CLOSE = new Set(["showed_no_close", "no_close_follow_up"]);
const RESOLVED = new Set(["showed", "noshow", "cancelled", "rescheduled"]);

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });

function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00+10:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayIndex(key: string) {
  // 0 = Monday … 6 = Sunday, from the date alone.
  const d = new Date(`${key}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}
function fmtDay(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  return `${d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()} ${d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}`;
}

interface Column {
  key: string;
  label: string;
  kind: "day" | "week" | "total";
  days: Set<string>;
}

function buildColumns(from: string, to: string): Column[] {
  const cols: Column[] = [];
  let weekDays = new Set<string>();
  let weekNo = 1;
  let d = from;
  const all = new Set<string>();
  while (d <= to) {
    cols.push({ key: d, label: fmtDay(d), kind: "day", days: new Set([d]) });
    weekDays.add(d);
    all.add(d);
    if (weekdayIndex(d) === 6 || d === to) {
      if (weekDays.size > 1 || cols.length > 1) {
        cols.push({ key: `week-${weekNo}`, label: `Week ${weekNo}`, kind: "week", days: weekDays });
      }
      weekNo += 1;
      weekDays = new Set<string>();
    }
    d = addDays(d, 1);
  }
  cols.push({ key: "total", label: "Total", kind: "total", days: all });
  return cols;
}

interface Stats {
  booked: number;
  due: number;
  resolved: number;
  showed: number;
  showedFirst: number;
  showedFollow: number;
  noShow: number;
  cancelled: number;
  rescheduled: number;
  firstResolved: number;
  firstNoShow: number;
  firstCancelled: number;
  firstRescheduled: number;
  followResolved: number;
  doubleBooked: number;
  meetingMinutes: number;
  qualifiedLive: number;
  pitched: number;
  pitchedFirst: number;
  pitchedFollow: number;
  pitchedQualified: number;
  notClosed: number;
  obj: Record<string, number>;
  dq: number;
  dqReasons: Record<string, number>;
  closed: number;
  closedFirst: number;
  closedFollow: number;
  verbal: number;
  retainerDeals: number;
  oneOffDeals: number;
  cash: number;
  mrr: number;
  oneOff: number;
}

function emptyStats(): Stats {
  return {
    booked: 0, due: 0, resolved: 0, showed: 0, showedFirst: 0, showedFollow: 0, noShow: 0, cancelled: 0, rescheduled: 0,
    firstResolved: 0, firstNoShow: 0, firstCancelled: 0, firstRescheduled: 0, followResolved: 0, doubleBooked: 0, meetingMinutes: 0,
    qualifiedLive: 0, pitched: 0, pitchedFirst: 0, pitchedFollow: 0, pitchedQualified: 0, notClosed: 0, obj: {}, dq: 0, dqReasons: {},
    closed: 0, closedFirst: 0, closedFollow: 0, verbal: 0, retainerDeals: 0, oneOffDeals: 0, cash: 0, mrr: 0, oneOff: 0,
  };
}

function computeStats(items: Item[], days: Set<string>, minutesByItem: Map<string, number>): Stats {
  const s = emptyStats();
  const due = items.filter((i) => i.scheduled_for && days.has(dayKey(i.scheduled_for)));
  s.booked = items.filter((i) => i.created_at && days.has(dayKey(i.created_at))).length;
  s.due = due.length;

  const slotKeys = new Map<string, number>();
  for (const i of due) {
    const bucket = i.resolved_bucket ?? "";
    const first = !i.is_follow_up;
    const outcome = i.appointment_outcome ?? "";
    if (RESOLVED.has(bucket)) {
      s.resolved += 1;
      if (first) s.firstResolved += 1; else s.followResolved += 1;
    }
    if (bucket === "showed") { s.showed += 1; if (first) s.showedFirst += 1; else s.showedFollow += 1; }
    if (bucket === "noshow") { s.noShow += 1; if (first) s.firstNoShow += 1; }
    if (bucket === "cancelled") { s.cancelled += 1; if (first) s.firstCancelled += 1; }
    if (bucket === "rescheduled") { s.rescheduled += 1; if (first) s.firstRescheduled += 1; }
    if (i.scheduled_for) {
      const k = `${i.assigned_user_id}-${i.scheduled_for}`;
      slotKeys.set(k, (slotKeys.get(k) ?? 0) + 1);
    }
    s.meetingMinutes += minutesByItem.get(i.id) ?? 0;
    if (SHOWED.has(outcome) && i.is_qualified === true) s.qualifiedLive += 1;
    if (PITCHED.has(outcome)) {
      s.pitched += 1;
      if (first) s.pitchedFirst += 1; else s.pitchedFollow += 1;
      if (i.is_qualified !== false) s.pitchedQualified += 1;
    }
    if (NO_CLOSE.has(outcome)) {
      const r = i.outcome_reason || "unrecorded";
      s.obj[r] = (s.obj[r] ?? 0) + 1;
    }
    if (outcome === "disqualified") {
      s.dq += 1;
      const r = i.dq_reason || "unrecorded";
      s.dqReasons[r] = (s.dqReasons[r] ?? 0) + 1;
    }
    if (outcome === "showed_closed") {
      s.closed += 1;
      if (first) s.closedFirst += 1; else s.closedFollow += 1;
      const mrr = i.monthly_recurring_value ?? 0;
      const one = i.deal_value ?? 0;
      if (mrr > 0) s.retainerDeals += 1;
      if (one > 0) s.oneOffDeals += 1;
      s.mrr += mrr;
      s.oneOff += one;
      s.cash += mrr + one;
    }
    if (outcome === "showed_verbal_commitment") s.verbal += 1;
  }
  for (const n of slotKeys.values()) if (n > 1) s.doubleBooked += n - 1;
  s.notClosed = s.pitched - s.closed;
  return s;
}

type Fmt = "n" | "pct" | "money" | "hm";
interface RowDef {
  label: string;
  fmt: Fmt;
  hint?: string;
  value: (s: Stats) => number | null;
  emphasis?: boolean;
}
interface SectionDef {
  title: string;
  rows: RowDef[];
}

const pct = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);

const OBJ_LABEL: Record<string, string> = {
  price_budget: "Price / budget",
  think_partner: "Needs to think / partner",
  timing: "Timing",
  agency_trust: "Has an agency / trust",
  other: "Other reason",
  unrecorded: "No reason recorded",
};
const DQ_LABEL: Record<string, string> = {
  dq_too_small: "Too small / low revenue",
  dq_wrong_fit: "Wrong fit / industry",
  dq_not_dm: "Not decision maker",
  dq_no_capacity: "No capacity for more work",
  unrecorded: "No reason recorded",
};

function buildSections(): SectionDef[] {
  return [
    {
      title: "Bookings",
      rows: [
        { label: "Bookings made", fmt: "n", hint: "by the day they were booked", value: (s) => s.booked },
        { label: "Bookings due", fmt: "n", hint: "meetings scheduled for the day", value: (s) => s.due, emphasis: true },
        { label: "Resolved slots", fmt: "n", hint: "showed + no-show + cancelled + rescheduled", value: (s) => s.resolved },
        { label: "Showed (sittings)", fmt: "n", value: (s) => s.showed, emphasis: true },
        { label: "  First meetings", fmt: "n", value: (s) => s.showedFirst },
        { label: "  Second meetings", fmt: "n", value: (s) => s.showedFollow },
        { label: "No-show", fmt: "n", value: (s) => s.noShow },
        { label: "Cancelled", fmt: "n", value: (s) => s.cancelled },
        { label: "Rescheduled", fmt: "n", value: (s) => s.rescheduled },
        { label: "Double booked", fmt: "n", hint: "slots sharing a closer and a start time", value: (s) => s.doubleBooked },
        { label: "Meeting time (Fathom)", fmt: "hm", hint: "recorded sittings only", value: (s) => s.meetingMinutes },
      ],
    },
    {
      title: "Show rates",
      rows: [
        { label: "Show rate (first meetings)", fmt: "pct", hint: "showed ÷ resolved first-meeting slots", value: (s) => pct(s.showedFirst, s.firstResolved), emphasis: true },
        { label: "Show rate (all sittings)", fmt: "pct", value: (s) => pct(s.showed, s.resolved) },
        { label: "Second-meeting show rate", fmt: "pct", value: (s) => pct(s.showedFollow, s.followResolved) },
        { label: "No-show %", fmt: "pct", hint: "first meetings", value: (s) => pct(s.firstNoShow, s.firstResolved) },
        { label: "Cancel %", fmt: "pct", hint: "first meetings", value: (s) => pct(s.firstCancelled, s.firstResolved) },
        { label: "Reschedule %", fmt: "pct", hint: "first meetings", value: (s) => pct(s.firstRescheduled, s.firstResolved) },
      ],
    },
    {
      title: "Live calls and offers",
      rows: [
        { label: "Qualified live calls", fmt: "n", hint: "sat and marked qualified", value: (s) => s.qualifiedLive },
        { label: "Qualified live call rate", fmt: "pct", hint: "÷ showed", value: (s) => pct(s.qualifiedLive, s.showed) },
        { label: "Offers made (pitched)", fmt: "n", hint: "a close decision recorded", value: (s) => s.pitched, emphasis: true },
        { label: "Offer rate", fmt: "pct", hint: "pitched ÷ showed", value: (s) => pct(s.pitched, s.showed) },
        { label: "Disqualified on the call", fmt: "n", value: (s) => s.dq },
        { label: "DQ rate", fmt: "pct", hint: "÷ showed", value: (s) => pct(s.dq, s.showed) },
        ...Object.entries(DQ_LABEL).map<RowDef>(([k, label]) => ({ label: `  DQ: ${label}`, fmt: "n", value: (s) => s.dqReasons[k] ?? 0 })),
      ],
    },
    {
      title: "Not closed",
      rows: [
        { label: "Total not closed", fmt: "n", hint: "pitched − closed", value: (s) => s.notClosed, emphasis: true },
        ...Object.entries(OBJ_LABEL).flatMap<RowDef>(([k, label]) => [
          { label: `  ${label}`, fmt: "n", value: (s) => s.obj[k] ?? 0 },
          { label: `  ${label} rate`, fmt: "pct", hint: "÷ pitched", value: (s) => pct(s.obj[k] ?? 0, s.pitched) },
        ]),
      ],
    },
    {
      title: "Closes",
      rows: [
        { label: "Same-day closes", fmt: "n", hint: "closed on the first sitting", value: (s) => s.closedFirst },
        { label: "Follow-up closes", fmt: "n", hint: "closed on a second meeting", value: (s) => s.closedFollow },
        { label: "Total closes", fmt: "n", value: (s) => s.closed, emphasis: true },
        { label: "Verbal commitments", fmt: "n", value: (s) => s.verbal },
        { label: "Retainer deals", fmt: "n", hint: "closes with a monthly value", value: (s) => s.retainerDeals },
        { label: "One-off deals", fmt: "n", hint: "closes with a one-off fee", value: (s) => s.oneOffDeals },
        { label: "Same-day close rate", fmt: "pct", hint: "÷ first-sitting pitches", value: (s) => pct(s.closedFirst, s.pitchedFirst) },
        { label: "Follow-up close rate", fmt: "pct", hint: "÷ second-meeting pitches", value: (s) => pct(s.closedFollow, s.pitchedFollow) },
        { label: "Total bookings close rate", fmt: "pct", hint: "÷ bookings made", value: (s) => pct(s.closed, s.booked) },
        { label: "Bookings-due close rate", fmt: "pct", hint: "÷ bookings due", value: (s) => pct(s.closed, s.due) },
        { label: "Live call close rate", fmt: "pct", hint: "÷ showed", value: (s) => pct(s.closed, s.showed), emphasis: true },
        { label: "Qualified live call close rate", fmt: "pct", hint: "÷ pitched, not-qualified excluded", value: (s) => pct(s.closed, s.pitchedQualified), emphasis: true },
        { label: "Offer-to-close rate", fmt: "pct", hint: "÷ pitched", value: (s) => pct(s.closed, s.pitched) },
        { label: "Verbal commitment rate", fmt: "pct", hint: "÷ pitched", value: (s) => pct(s.verbal, s.pitched) },
      ],
    },
    {
      title: "Cash",
      rows: [
        { label: "First collection", fmt: "money", hint: "one-off + first retainer month", value: (s) => s.cash, emphasis: true },
        { label: "Retainers won (MRR)", fmt: "money", value: (s) => s.mrr },
        { label: "One-off collected", fmt: "money", value: (s) => s.oneOff },
        { label: "Avg first collection per sale", fmt: "money", value: (s) => (s.closed > 0 ? s.cash / s.closed : null) },
        { label: "Cash per live call", fmt: "money", value: (s) => (s.showed > 0 ? s.cash / s.showed : null) },
        { label: "Cash per booking due", fmt: "money", value: (s) => (s.due > 0 ? s.cash / s.due : null) },
        { label: "Cash per booking made", fmt: "money", value: (s) => (s.booked > 0 ? s.cash / s.booked : null) },
      ],
    },
  ];
}

function format(v: number | null, fmt: Fmt) {
  if (v === null) return "—";
  switch (fmt) {
    case "pct":
      return `${Math.round(v)}%`;
    case "money":
      return `$${Math.round(v).toLocaleString("en-AU")}`;
    case "hm": {
      const h = Math.floor(v / 60);
      const m = Math.round(v % 60);
      return v === 0 ? "0:00" : `${h}:${String(m).padStart(2, "0")}`;
    }
    default:
      return String(v);
  }
}

function useMeetingMinutes(itemIds: string[]) {
  const key = itemIds.slice().sort().join(",");
  return useQuery({
    queryKey: ["fathom-minutes", key],
    enabled: itemIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map = new Map<string, number>();
      for (let i = 0; i < itemIds.length; i += 200) {
        const { data, error } = await supabase
          .from("fathom_meetings")
          .select("pipeline_item_id, start_at, end_at")
          .in("pipeline_item_id", itemIds.slice(i, i + 200));
        if (error) throw error;
        for (const f of data ?? []) {
          if (!f.pipeline_item_id || !f.start_at || !f.end_at) continue;
          const mins = Math.max(0, (new Date(f.end_at).getTime() - new Date(f.start_at).getTime()) / 60_000);
          map.set(f.pipeline_item_id, (map.get(f.pipeline_item_id) ?? 0) + mins);
        }
      }
      return map;
    },
  });
}

export function ClosingTracker({ dateFrom, dateTo, bookings, activeRepId, selectedRepLabel }: Props) {
  const items = useMemo(
    () => (activeRepId ? bookings.filter((b) => b.assigned_user_id === activeRepId) : bookings),
    [bookings, activeRepId],
  );
  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const { data: minutesByItem = new Map<string, number>() } = useMeetingMinutes(itemIds);
  const columns = useMemo(() => buildColumns(dateFrom, dateTo), [dateFrom, dateTo]);
  const statsByColumn = useMemo(
    () => new Map(columns.map((c) => [c.key, computeStats(items, c.days, minutesByItem)])),
    [columns, items, minutesByItem],
  );
  const sections = useMemo(() => buildSections(), []);
  const today = dayKey(new Date().toISOString());

  return (
    <ReportSection
      title="Closing tracker"
      description={`One column per day, a roll-up after each week, and the range total${selectedRepLabel ? `, closer ${selectedRepLabel}` : ""}. Bookings made count by the day booked; everything else counts by the day of the meeting. Show rates use resolved slots; close rates use pitched meetings; cash is the first collection.`}
      className="overflow-hidden"
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-[220px] border-b border-r border-border bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">
                Metric
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "min-w-[64px] border-b border-border px-1.5 py-1.5 text-center font-medium whitespace-nowrap",
                    c.kind === "week" && "bg-primary/10 text-foreground",
                    c.kind === "total" && "bg-primary/20 text-foreground",
                    c.kind === "day" && c.key > today && "text-muted-foreground/60",
                    c.kind === "day" && c.key === today && "text-primary",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.title}>
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="sticky left-0 border-b border-border bg-muted/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                  >
                    {section.title}
                  </td>
                </tr>
                {section.rows.map((row) => (
                  <tr key={`${section.title}-${row.label}`} className="hover:bg-muted/30">
                    <td
                      className={cn(
                        "sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-1 whitespace-nowrap",
                        row.emphasis ? "font-medium text-foreground" : "text-muted-foreground",
                        row.label.startsWith("  ") && "pl-5",
                      )}
                      title={row.hint}
                    >
                      {row.label.trim()}
                    </td>
                    {columns.map((c) => {
                      const v = row.value(statsByColumn.get(c.key) ?? emptyStats());
                      const text = format(v, row.fmt);
                      const empty = v === null || v === 0;
                      return (
                        <td
                          key={c.key}
                          className={cn(
                            "border-b border-border px-1.5 py-1 text-center font-mono tabular-nums",
                            c.kind === "week" && "bg-primary/5",
                            c.kind === "total" && "bg-primary/10 font-semibold",
                            empty ? "text-muted-foreground/50" : "text-foreground",
                            row.fmt === "pct" && v !== null && v >= 50 && "text-emerald-700 dark:text-emerald-300",
                            row.fmt === "pct" && v !== null && v > 0 && v < 25 && "text-red-600 dark:text-red-400",
                          )}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Not in the dialer yet, so not shown: meeting time outside Fathom, deposits versus paid in full, and
        "missed because the previous call ran over". Objection and DQ reasons come from the reason picked when the
        outcome was logged; "No reason recorded" means it was not picked.
      </p>
    </ReportSection>
  );
}
