import { Fragment, useCallback, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ReportSection } from "@/components/reports/ReportSection";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useNewClients } from "@/hooks/useNewClients";
import { useContactBookingHistory, useProductiveHoursByDay, useRepCompPlans, useTrackerDailyInputs } from "@/hooks/useFunnelTracker";
import type { BookedAppointmentReportItem, SalesRepOption } from "@/hooks/usePipelineItems";
import type { ReportCallLog } from "@/lib/reportMetrics";
import {
  creditNewClients,
  dayKeyOf,
  daysBetween,
  defaultMonthOpen,
  defaultWeekOpen,
  lastDayOfMonth,
  monthOf,
  weekKey,
  weeksOf,
  type TrackerItem,
} from "@/lib/funnelTracker";
import { buildSetterDailyStats, per, rate, sumSetterStats, type SetterStats } from "@/lib/setterTracker";

interface Props {
  dateFrom: string;
  dateTo: string;
  callLogs: ReportCallLog[];
  bookings: BookedAppointmentReportItem[];
  rescheduleSlots?: BookedAppointmentReportItem[];
  reps: SalesRepOption[];
  /** The page's rep filter: when set, the tracker shows that setter only. */
  activeRepId?: string;
}

type Fmt = "n" | "pct" | "dur" | "clock" | "dec" | "money" | "worked";
type Level = "range" | "month" | "week" | "day";
interface Col {
  key: string;
  section: string;
  label: string;
  fmt: Fmt;
  hint?: string;
  value: (s: SetterStats, level: Level) => number | null;
}

const COLS: Col[] = [
  { key: "worked", section: "Setting", label: "Worked?", fmt: "worked", hint: "dialled that day; totals count the days worked", value: (s) => s.daysWorked },
  { key: "leads", section: "Setting", label: "Leads dialled", fmt: "n", hint: "unique leads called", value: (s) => s.leads.size },
  { key: "dials", section: "Setting", label: "Dials", fmt: "n", value: (s) => s.dials },
  { key: "answers", section: "Setting", label: "Answers", fmt: "n", hint: "picked up: booked, follow-up, not interested, DNC, DQ or gatekeeper", value: (s) => s.answers },
  { key: "hangups", section: "Setting", label: "Hang-ups (before end of intro)", fmt: "n", hint: "answers marked hung up immediately", value: (s) => s.hangups },
  { key: "fdqs", section: "Setting", label: "FDQs", fmt: "n", hint: "answers disqualified on the call", value: (s) => s.fdqs },
  { key: "noSet", section: "Setting", label: "Answer, no set", fmt: "n", hint: "answers that did not end in a booking", value: (s) => s.answers - s.bookedCalls },
  { key: "talk", section: "Setting", label: "Talk time", fmt: "dur", hint: "Dialpad talk time", value: (s) => s.talkSeconds },
  { key: "avgTalk", section: "Setting", label: "Avg talk per answer", fmt: "dur", value: (s) => per(s.talkSeconds, s.answers) },
  { key: "answerRate", section: "Setting", label: "Answer rate", fmt: "pct", hint: "answers ÷ dials", value: (s) => rate(s.answers, s.dials) },

  // Where calls get to and where they fall apart. Each stage counts the answered calls that
  // reached it or any later stage (a booked call reached them all), so the counts step down.
  { key: "convos", section: "Call stages", label: "Past intro", fmt: "n", hint: "reached the decision maker and got past the opener", value: (s) => s.convos },
  { key: "problem", section: "Call stages", label: "Problem aware", fmt: "n", value: (s) => s.problem },
  { key: "solution", section: "Call stages", label: "Solution aware", fmt: "n", value: (s) => s.solution },
  { key: "qualified", section: "Call stages", label: "Got to the ask", fmt: "n", hint: "commitment stage", value: (s) => s.qualified },
  { key: "bookedCalls", section: "Call stages", label: "Booked on the call", fmt: "n", value: (s) => s.bookedCalls },
  { key: "answerConvo", section: "Call stages", label: "Answer to intro", fmt: "pct", hint: "past intro ÷ answers", value: (s) => rate(s.convos, s.answers) },
  { key: "introProblem", section: "Call stages", label: "Intro to problem", fmt: "pct", value: (s) => rate(s.problem, s.convos) },
  { key: "problemSolution", section: "Call stages", label: "Problem to solution", fmt: "pct", value: (s) => rate(s.solution, s.problem) },
  { key: "solutionAsk", section: "Call stages", label: "Solution to ask", fmt: "pct", value: (s) => rate(s.qualified, s.solution) },
  { key: "askBooked", section: "Call stages", label: "Ask to booked", fmt: "pct", value: (s) => rate(s.bookedCalls, s.qualified) },

  { key: "rostered", section: "Hours", label: "Rostered hours", fmt: "dec", hint: "entered daily on the Tracker (Daily inputs)", value: (s) => s.rosteredHours },
  { key: "clockOn", section: "Hours", label: "Clock on (first dial)", fmt: "clock", value: (s, l) => (l === "day" ? s.firstDial : null) },
  { key: "clockOff", section: "Hours", label: "Clock off (last dial)", fmt: "clock", value: (s, l) => (l === "day" ? s.lastDial : null) },
  { key: "productive", section: "Hours", label: "Time dialling (hours)", fmt: "dec", hint: "productive dialling hours, same as the Tracker and Targets", value: (s) => s.productiveHours },
  { key: "discrepancy", section: "Hours", label: "Hours discrepancy", fmt: "dec", hint: "time dialling − rostered", value: (s) => (s.rosteredHours > 0 ? s.productiveHours - s.rosteredHours : null) },

  { key: "sets", section: "Sets", label: "Sets (total)", fmt: "n", hint: "first meetings booked that day", value: (s) => s.sets },
  { key: "manual", section: "Sets", label: "Manual sets", fmt: "n", value: (s) => s.manualSets },
  { key: "dbs", section: "Sets", label: "Direct bookings", fmt: "n", hint: "self-booked on the calendar", value: (s) => s.dbs },
  { key: "setsT1", section: "Sets", label: "Tier 1 sets", fmt: "n", hint: "3+ on the tools incl. the owner and $50k+ a month (from the booking, else the contact)", value: (s) => s.setsT1 },
  { key: "setsT2", section: "Sets", label: "Tier 2 sets", fmt: "n", value: (s) => s.setsT2 },
  { key: "pctT1", section: "Sets", label: "% Tier 1", fmt: "pct", hint: "Tier 1 ÷ all sets (unknown tier makes up the rest)", value: (s) => rate(s.setsT1, s.sets) },
  { key: "pctT2", section: "Sets", label: "% Tier 2", fmt: "pct", hint: "Tier 2 ÷ all sets", value: (s) => rate(s.setsT2, s.sets) },
  { key: "talkPerSet", section: "Sets", label: "Talk time per set", fmt: "dur", hint: "all talk time ÷ sets: talking it takes to get one booking", value: (s) => per(s.talkSeconds, s.sets) },
  { key: "bookingCall", section: "Sets", label: "Avg booking call", fmt: "dur", hint: "average talk time of the calls that booked", value: (s) => per(s.bookedTalkSeconds, s.bookedCalls) },
  { key: "answerSet", section: "Sets", label: "Answer to set", fmt: "pct", value: (s) => rate(s.sets, s.answers) },
  { key: "convoSet", section: "Sets", label: "Convo to set", fmt: "pct", value: (s) => rate(s.sets, s.convos) },
  { key: "leadSet", section: "Sets", label: "Lead to set", fmt: "pct", value: (s) => rate(s.sets, s.leads.size) },
  { key: "dialsLead", section: "Sets", label: "Dials per lead", fmt: "dec", value: (s) => per(s.dials, s.leads.size) },
  { key: "dialsHour", section: "Sets", label: "Dials per hour", fmt: "dec", hint: "dials ÷ time dialling", value: (s) => per(s.dials, s.productiveHours) },
  { key: "setsHour", section: "Sets", label: "Sets per hour", fmt: "dec", value: (s) => per(s.sets, s.productiveHours) },

  { key: "onCal", section: "Close call outcomes", label: "Booked calls on calendar", fmt: "n", hint: "this setter's first meetings due that day", value: (s) => s.onCal },
  { key: "live", section: "Close call outcomes", label: "Live calls", fmt: "n", value: (s) => s.live },
  { key: "noShows", section: "Close call outcomes", label: "No-shows", fmt: "n", value: (s) => s.noShows },
  { key: "reschedules", section: "Close call outcomes", label: "Reschedules", fmt: "n", value: (s) => s.reschedules },
  { key: "cancels", section: "Close call outcomes", label: "Cancels", fmt: "n", value: (s) => s.cancels },
  { key: "missed", section: "Close call outcomes", label: "Missed by us", fmt: "n", hint: "we were late or double-booked", value: (s) => s.missedByUs },
  { key: "pending", section: "Close call outcomes", label: "Pending", fmt: "n", hint: "not recorded yet, or still to come", value: (s) => s.pending },
  { key: "showRate", section: "Close call outcomes", label: "Show rate", fmt: "pct", hint: "live calls ÷ booked calls on calendar", value: (s) => rate(s.live, s.onCal) },
  { key: "showRateMissed", section: "Close call outcomes", label: "Show rate if not missed", fmt: "pct", hint: "(live + missed by us) ÷ booked calls on calendar", value: (s) => rate(s.live + s.missedByUs, s.onCal) },
  { key: "dqLive", section: "Close call outcomes", label: "DQ live calls", fmt: "n", value: (s) => s.dqLive },
  { key: "dqRate", section: "Close call outcomes", label: "DQ live call rate", fmt: "pct", value: (s) => rate(s.dqLive, s.live) },
  { key: "sold", section: "Close call outcomes", label: "Units sold", fmt: "n", hint: "new clients credited to this setter (first booking), by the day the first deal starts", value: (s) => s.sold },
  { key: "closeRate", section: "Close call outcomes", label: "Live call close rate", fmt: "pct", value: (s) => rate(s.sold, s.live) },
  { key: "cash", section: "Close call outcomes", label: "Cash collected", fmt: "money", hint: "first-deal MRR + one-off", value: (s) => s.cash },
  { key: "avgCash", section: "Close call outcomes", label: "Avg cash per sale", fmt: "money", value: (s) => per(s.cash, s.sold) },
  { key: "cashSet", section: "Close call outcomes", label: "Cash per set", fmt: "money", value: (s) => per(s.cash, s.sets) },
  { key: "cashBooking", section: "Close call outcomes", label: "Cash per booking", fmt: "money", hint: "÷ booked calls on calendar", value: (s) => per(s.cash, s.onCal) },
  { key: "cashLive", section: "Close call outcomes", label: "Cash per live call", fmt: "money", value: (s) => per(s.cash, s.live) },
];

const CLOCK = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", hour: "numeric", minute: "2-digit" });

function format(v: number | null, fmt: Fmt, level: Level) {
  if (v == null || !Number.isFinite(v)) return "-";
  switch (fmt) {
    case "pct":
      return `${Math.round(v)}%`;
    case "money":
      return `$${Math.round(v).toLocaleString("en-AU")}`;
    case "dec":
      return (Math.round(v * 10) / 10).toLocaleString("en-AU");
    case "dur": {
      const total = Math.round(v);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const sec = total % 60;
      return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
    }
    case "clock":
      return CLOCK.format(new Date(v)).replace(" ", "").toLowerCase();
    case "worked":
      return level === "day" ? (v > 0 ? "Yes" : "Off") : `${v} ${v === 1 ? "day" : "days"}`;
    default:
      return Math.round(v).toLocaleString("en-AU");
  }
}

function fmtDay(key: string) {
  const d = new Date(`${key}T12:00:00Z`);
  return `${d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()} ${d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })}`;
}
function fmtMonth(month: string) {
  const d = new Date(`${month}T12:00:00Z`);
  return `${d.toLocaleDateString("en-AU", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`;
}
function fmtWeek(from: string, to: string) {
  const dayMonth = (k: string) => fmtDay(k).split(" ").slice(1).join(" ");
  return from === to ? `Week ${dayMonth(to)}` : `Week ${Number(from.slice(8, 10))}–${dayMonth(to)}`;
}

const OPEN_STORAGE_KEY = "insights-setters-open-v1";
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
    // Private window or blocked storage: the open state just is not remembered.
  }
}

const ALL = "__all";
const RANGE_KEY = "range";
/** Dials in the range before someone who is not on a setter pay plan is listed as a setter. */
const MIN_DIALS_TO_LIST = 10;
const NO_CLIENTS: never[] = [];
const NO_INPUTS: never[] = [];
const NO_HOURS = new Map<string, Map<string, number>>();

/**
 * Insights > Setters: the setter team tracker sheet, laid out like the Tracker
 * and Closing tabs. One setter at a time (or all setters together).
 */
export function SetterTracker({ dateFrom, dateTo, callLogs, bookings, rescheduleSlots = [], reps, activeRepId }: Props) {
  const { data: compPlans = [] } = useRepCompPlans();
  const repName = useMemo(() => new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Unnamed"])), [reps]);

  // Setters: everyone on a setter pay plan, plus anyone who dialled in the range
  // (Bede sets too). Paid setters first, then the rest, each by name.
  const setters = useMemo(() => {
    const paid = new Set(compPlans.filter((p) => p.role === "setter").map((p) => p.user_id));
    // Someone not on a pay plan needs a real day's dialling in the range to show (not a test dial).
    const dials = new Map<string, number>();
    for (const l of callLogs) if (l.user_id) dials.set(l.user_id, (dials.get(l.user_id) ?? 0) + 1);
    const ids = new Set([...paid, ...[...dials].filter(([, n]) => n >= MIN_DIALS_TO_LIST).map(([id]) => id)]);
    return [...ids]
      .map((id) => ({ id, name: repName.get(id) ?? id.slice(0, 8), paid: paid.has(id) }))
      .sort((a, b) => Number(b.paid) - Number(a.paid) || a.name.localeCompare(b.name));
  }, [compPlans, callLogs, repName]);
  const [picked, setPicked] = useState<string | null>(null);
  // All setters first; a dropdown narrows it to one.
  const selected = activeRepId ?? picked ?? ALL;
  const setterIds = useMemo(
    () => new Set(selected === ALL ? setters.map((s) => s.id) : [selected]),
    [selected, setters],
  );

  const firstMonth = monthOf(dateFrom);
  const lastMonth = monthOf(dateTo);
  const { data: rawNewClients = NO_CLIENTS } = useNewClients(firstMonth, lastDayOfMonth(lastMonth));
  const { data: history } = useContactBookingHistory(rawNewClients.map((n) => n.contact_id));
  const newClients = useMemo(() => creditNewClients(rawNewClients, history?.history ?? [], history?.contacts), [rawNewClients, history]);
  const { data: inputs = NO_INPUTS } = useTrackerDailyInputs(dateFrom, dateTo);
  const { data: productiveHours = NO_HOURS } = useProductiveHoursByDay(dateFrom, dateTo);

  const months = useMemo(() => {
    const days = dateFrom && dateTo && dateFrom <= dateTo ? daysBetween(dateFrom, dateTo) : [];
    const byMonth = new Map<string, string[]>();
    for (const d of days) byMonth.set(monthOf(d), [...(byMonth.get(monthOf(d)) ?? []), d]);
    return [...byMonth.entries()].map(([month, mDays]) => ({ month, days: mDays, weeks: weeksOf(mDays) }));
  }, [dateFrom, dateTo]);

  const daily = useMemo(
    () =>
      buildSetterDailyStats({
        days: months.flatMap((m) => m.days),
        setterIds,
        callLogs,
        items: [...bookings, ...rescheduleSlots] as TrackerItem[],
        inputs,
        productiveHours,
        newClients,
      }),
    [months, setterIds, callLogs, bookings, rescheduleSlots, inputs, productiveHours, newClients],
  );
  const total = useCallback((days: string[]) => sumSetterStats(days.map((d) => daily.get(d)!).filter(Boolean)), [daily]);

  // All setters: each setter's own numbers too, shown as a row under every
  // day, week, month and range line so they can be compared with each other.
  const perSetter = useMemo(() => {
    if (selected !== ALL) return [];
    const days = months.flatMap((m) => m.days);
    const items = [...bookings, ...rescheduleSlots] as TrackerItem[];
    return setters.map((st) => ({
      id: st.id,
      name: st.name,
      daily: buildSetterDailyStats({ days, setterIds: new Set([st.id]), callLogs, items, inputs, productiveHours, newClients }),
    }));
  }, [selected, setters, months, callLogs, bookings, rescheduleSlots, inputs, productiveHours, newClients]);
  const setterRows = (days: string[], level: Level, combined: SetterStats) => {
    if (perSetter.length === 0) return null;
    // Nothing happened (no dials, sets, meetings or sales): no per-setter rows.
    const active = (x: SetterStats) => x.dials > 0 || x.sets > 0 || x.onCal > 0 || x.sold > 0;
    if (!active(combined)) return null;
    // Only the setters who did something in this period.
    return perSetter
      .map((st) => ({ st, stats: sumSetterStats(days.map((d) => st.daily.get(d)!).filter(Boolean)) }))
      .filter(({ stats }) => active(stats))
      .map(({ st, stats }) => (
        <tr key={`${level}-${days[0]}-${st.id}`} className="hover:bg-muted/30">
          <td className={cn("sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-0.5 whitespace-nowrap text-[11px] text-muted-foreground", level === "day" ? "pl-6" : "pl-7")}>
            {st.name}
          </td>
          {cells(stats, level, true)}
        </tr>
      ));
  };

  const today = dayKeyOf(new Date().toISOString());
  const currentMonth = monthOf(today);
  const [openState, setOpenState] = useState<Record<string, boolean>>(readOpenState);
  const setOpen = useCallback((updates: Record<string, boolean>) => {
    setOpenState((prev) => {
      const next = { ...prev, ...updates };
      writeOpenState(next);
      return next;
    });
  }, []);
  const monthOpen = (month: string) => openState[month] ?? defaultMonthOpen(month, currentMonth, months.length);
  const weekOpen = (w: string[], count: number) => openState[weekKey(w[0])] ?? defaultWeekOpen(w[0], w[w.length - 1], today, count);
  const allOpen = months.length > 0 && months.every((m) => monthOpen(m.month) && m.weeks.every((w) => weekOpen(w, m.weeks.length)));
  const setAllOpen = (open: boolean) =>
    setOpen({ ...Object.fromEntries(months.flatMap((m) => [[m.month, open], ...m.weeks.map((w) => [weekKey(w[0]), open])])), [RANGE_KEY]: open });
  // The range total opens to show each setter's range line; closed by default.
  const rangeOpen = openState[RANGE_KEY] ?? false;

  const sectionStart = useMemo(() => new Set(COLS.filter((c, i) => i === 0 || COLS[i - 1].section !== c.section).map((c) => c.key)), []);
  const sectionSpans = useMemo(() => {
    const out: { title: string; span: number }[] = [];
    for (const c of COLS) {
      const last = out[out.length - 1];
      if (last && last.title === c.section) last.span += 1;
      else out.push({ title: c.section, span: 1 });
    }
    return out;
  }, []);

  const cells = (s: SetterStats, level: Level, sub = false) =>
    COLS.map((c) => {
      const v = c.value(s, level);
      const empty = v == null || v === 0;
      return (
        <td
          key={c.key}
          className={cn(
            "border-b border-border px-1.5 py-1 text-center font-mono tabular-nums whitespace-nowrap",
            sectionStart.has(c.key) && "border-l",
            level !== "day" && !sub && "font-semibold",
            sub && "py-0.5 text-[11px]",
            empty && c.fmt !== "worked" ? "text-muted-foreground/50" : "text-foreground",
            c.fmt === "worked" && level === "day" && v === 0 && "text-muted-foreground/50",
            c.key === "discrepancy" && v != null && v < -0.5 && "text-red-600 dark:text-red-400",
          )}
        >
          {format(v, c.fmt, level)}
        </td>
      );
    });

  const stickyDay = "sticky left-0 z-10 border-b border-r border-border px-2 py-1 whitespace-nowrap";
  const selectedName = selected === ALL ? "All setters" : repName.get(selected) ?? "Setter";

  return (
    <ReportSection
      title="Setter tracker"
      description={`${selectedName}: one row per day, week and month totals that collapse${selected === ALL ? "; open a month, week or the range total to see each setter's line" : ""}. Calls count by the day dialled, sets by the day booked, meetings by the day they were due, and units sold by the day the first deal starts (credited to the setter of the lead's first booking).`}
      className="overflow-hidden"
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {activeRepId ? (
          <span className="text-xs text-muted-foreground">Showing {selectedName}.</span>
        ) : (
          <Select value={selected} onValueChange={setPicked}>
            <SelectTrigger className="h-8 w-[200px] text-xs" aria-label="Setter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All setters</SelectItem>
              {setters.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button className="ml-auto" type="button" variant="outline" size="sm" onClick={() => setAllOpen(!allOpen)} disabled={months.length === 0}>
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
      </div>
      <div className="max-h-[75vh] overflow-auto rounded-md border border-border">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className="sticky left-0 top-0 z-30 min-w-[150px] border-b border-r border-border bg-card px-2 py-1.5 text-left font-medium text-muted-foreground">
                Day
              </th>
              {sectionSpans.map((sec, i) => (
                <th
                  key={sec.title}
                  colSpan={sec.span}
                  className={cn(
                    "sticky top-0 z-20 border-b border-border bg-muted px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
                    i > 0 && "border-l",
                  )}
                >
                  {sec.title}
                </th>
              ))}
            </tr>
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  title={c.hint}
                  className={cn(
                    "sticky top-[25px] z-20 min-w-[72px] max-w-[110px] border-b border-border bg-card px-1.5 py-1.5 text-center align-bottom font-medium leading-tight text-muted-foreground",
                    sectionStart.has(c.key) && "border-l",
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.length > 1 ? (
              <tr className={cn("bg-primary/20", selected === ALL && "cursor-pointer")} onClick={selected === ALL ? () => setOpen({ [RANGE_KEY]: !rangeOpen }) : undefined}>
                <td className={cn(stickyDay, "bg-primary/25 px-1 font-semibold")}>
                  {selected === ALL ? (
                    <button type="button" aria-expanded={rangeOpen} className="flex items-center gap-1 rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", rangeOpen && "rotate-90")} aria-hidden="true" />
                      <span>Range total</span>
                    </button>
                  ) : (
                    <span className="px-1">Range total</span>
                  )}
                </td>
                {cells(total(months.flatMap((m) => m.days)), "range")}
              </tr>
            ) : null}
            {months.length > 1 && rangeOpen ? setterRows(months.flatMap((m) => m.days), "range", total(months.flatMap((m) => m.days))) : null}
            {months.map((m) => {
              const mOpen = monthOpen(m.month);
              return (
                <Fragment key={m.month}>
                  <tr className="cursor-pointer bg-primary/10" onClick={() => setOpen({ [m.month]: !mOpen })}>
                    <td className={cn(stickyDay, "bg-primary/20 px-1 font-semibold")}>
                      {/* No handler of its own: the click bubbles to the row, so it toggles once. */}
                      <button type="button" aria-expanded={mOpen} className="flex items-center gap-1 rounded-sm px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform", mOpen && "rotate-90")} aria-hidden="true" />
                        <span>{fmtMonth(m.month)} total</span>
                      </button>
                    </td>
                    {cells(total(m.days), "month")}
                  </tr>
                  {mOpen ? setterRows(m.days, "month", total(m.days)) : null}
                  {mOpen
                    ? m.weeks.map((w) => {
                        const wOpen = weekOpen(w, m.weeks.length);
                        return (
                          <Fragment key={w[0]}>
                            <tr className="cursor-pointer bg-muted/60" onClick={() => setOpen({ [weekKey(w[0])]: !wOpen })}>
                              <td className={cn(stickyDay, "bg-muted px-1 font-semibold")}>
                                <button type="button" aria-expanded={wOpen} className="flex items-center gap-1 rounded-sm pl-3 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", wOpen && "rotate-90")} aria-hidden="true" />
                                  <span>{fmtWeek(w[0], w[w.length - 1])}</span>
                                </button>
                              </td>
                              {cells(total(w), "week")}
                            </tr>
                            {wOpen ? setterRows(w, "week", total(w)) : null}
                            {wOpen
                              ? w.map((d) => (
                                  <Fragment key={d}>
                                  <tr className="hover:bg-muted/30">
                                    <td
                                      className={cn(
                                        stickyDay,
                                        "bg-card",
                                        d > today ? "text-muted-foreground/60" : d === today ? "text-primary" : "text-muted-foreground",
                                      )}
                                    >
                                      {fmtDay(d)}
                                    </td>
                                    {cells(daily.get(d)!, "day")}
                                  </tr>
                                  {setterRows([d], "day", daily.get(d)!)}
                                  </Fragment>
                                ))
                              : null}
                          </Fragment>
                        );
                      })
                    : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Hover a column for its definition. Not in the dialer, so not shown: leads allocated per setter, rostered clock on and
        off times, invalid leads / wrong numbers, direct-booking cancellation reasons (no ads yet), and the non-negotiables
        (sleep, gym). Rostered hours come from Daily inputs on the Tracker tab.
      </p>
    </ReportSection>
  );
}
