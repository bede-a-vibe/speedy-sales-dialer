/**
 * Insights > Setters: the "Setter team tracker" sheet rebuilt on the dialer's
 * data, one setter (or all setters) at a time. One row per Melbourne day,
 * week and month totals, metrics across the top.
 *
 * Every count reuses an existing definition: ANSWERED_OUTCOMES for answers,
 * the setter's stage ticks on the call (intro, problem, solution, ask: made
 * cumulative by callStagesOf), exit_reason_connection
 * 'hung_up_immediately' for a hang-up before the end of the intro, the
 * Tracker's sets (first meetings booked that day, by booking_method), the
 * Tracker's calendar buckets for how the setter's meetings ended, and
 * get_new_clients credited to the setter of the lead's first booking for
 * units sold and cash.
 */
import { ANSWERED_OUTCOMES, type ReportCallLog } from "@/lib/reportMetrics";
import { CONVERSATION_TAGGING_LAUNCH_DATE } from "@/data/constants";
import { callStagesOf } from "@/lib/callStages";
import { bookingMethodOf, bookingTierOf, calendarBucketOf, dayKeyOf, type NewClientWithCredit, type TrackerInputRow, type TrackerItem } from "@/lib/funnelTracker";

export type SetterCallLog = Pick<
  ReportCallLog,
  "contact_id" | "outcome" | "created_at" | "user_id" | "dialpad_talk_time_seconds" | "reached_connection" | "reached_commitment" | "exit_reason_connection"
> & {
  reached_problem_awareness?: boolean | null;
  reached_solution_awareness?: boolean | null;
};

export { callStagesOf } from "@/lib/callStages";

export interface SetterStats {
  daysWorked: number;
  dials: number;
  leads: Set<string>;
  answers: number;
  /** Call stages (answered calls, cumulative: see callStagesOf). */
  convos: number;
  problem: number;
  solution: number;
  hangups: number;
  fdqs: number;
  qualified: number;
  bookedCalls: number;
  talkSeconds: number;
  /** Talk time of the calls that booked. */
  bookedTalkSeconds: number;
  /** Epoch ms of the first and last dial (day rows only). */
  firstDial: number | null;
  lastDial: number | null;
  rosteredHours: number;
  productiveHours: number;
  sets: number;
  manualSets: number;
  dbs: number;
  setsT1: number;
  setsT2: number;
  onCal: number;
  live: number;
  noShows: number;
  reschedules: number;
  cancels: number;
  missedByUs: number;
  pending: number;
  dqLive: number;
  sold: number;
  cash: number;
}

export function emptySetterStats(): SetterStats {
  return {
    daysWorked: 0, dials: 0, leads: new Set(), answers: 0, convos: 0, problem: 0, solution: 0, hangups: 0, fdqs: 0, qualified: 0, bookedCalls: 0,
    talkSeconds: 0, bookedTalkSeconds: 0, firstDial: null, lastDial: null, rosteredHours: 0, productiveHours: 0,
    sets: 0, manualSets: 0, dbs: 0, setsT1: 0, setsT2: 0,
    onCal: 0, live: 0, noShows: 0, reschedules: 0, cancels: 0, missedByUs: 0, pending: 0, dqLive: 0, sold: 0, cash: 0,
  };
}

const SUMMED: (keyof SetterStats)[] = [
  "daysWorked", "dials", "answers", "convos", "problem", "solution", "hangups", "fdqs", "qualified", "bookedCalls", "talkSeconds", "bookedTalkSeconds",
  "rosteredHours", "productiveHours", "sets", "manualSets", "dbs", "setsT1", "setsT2",
  "onCal", "live", "noShows", "reschedules", "cancels", "missedByUs", "pending", "dqLive", "sold", "cash",
];

/** Week / month / range total = sum of the days. Unique leads are a union; clock times are day-only. */
export function sumSetterStats(days: SetterStats[]): SetterStats {
  const out = emptySetterStats();
  for (const d of days) {
    for (const k of SUMMED) (out[k] as number) += d[k] as number;
    for (const id of d.leads) out.leads.add(id);
  }
  return out;
}

export interface BuildSetterArgs {
  days: string[];
  /** The setters in view: one, or every setter for "All setters". */
  setterIds: Set<string>;
  callLogs: SetterCallLog[];
  /** Bookings plus reschedule slots, as loaded for Insights. */
  items: TrackerItem[];
  inputs: TrackerInputRow[];
  /** user_id -> day -> productive hours. */
  productiveHours: Map<string, Map<string, number>>;
  newClients: NewClientWithCredit[];
}

export function buildSetterDailyStats(args: BuildSetterArgs): Map<string, SetterStats> {
  const { days, setterIds } = args;
  const byDay = new Map(days.map((d) => [d, emptySetterStats()]));
  const get = (d: string) => byDay.get(d);

  for (const l of args.callLogs) {
    if (!l.user_id || !setterIds.has(l.user_id) || !l.created_at) continue;
    const s = get(dayKeyOf(l.created_at));
    if (!s) continue;
    const t = new Date(l.created_at).getTime();
    s.dials += 1;
    if (l.contact_id) s.leads.add(l.contact_id);
    s.talkSeconds += Number(l.dialpad_talk_time_seconds) || 0;
    s.firstDial = s.firstDial == null ? t : Math.min(s.firstDial, t);
    s.lastDial = s.lastDial == null ? t : Math.max(s.lastDial, t);
    if (!ANSWERED_OUTCOMES.has(l.outcome)) continue;
    s.answers += 1;
    // Stage ticks exist from the tagging launch; earlier calls only count a booking.
    const tagged = dayKeyOf(l.created_at) >= CONVERSATION_TAGGING_LAUNCH_DATE;
    const st = tagged ? callStagesOf(l) : { intro: false, problem: false, solution: false, ask: false, booked: l.outcome === "booked" };
    if (st.intro) s.convos += 1;
    if (st.problem) s.problem += 1;
    if (st.solution) s.solution += 1;
    if (st.ask) s.qualified += 1;
    if (l.exit_reason_connection === "hung_up_immediately") s.hangups += 1;
    if (l.outcome === "disqualified") s.fdqs += 1;
    if (st.booked) {
      s.bookedCalls += 1;
      s.bookedTalkSeconds += Number(l.dialpad_talk_time_seconds) || 0;
    }
  }

  for (const r of args.inputs) {
    if (r.funnel !== "cold" || !r.user_id || !setterIds.has(r.user_id)) continue;
    const s = get(r.day);
    if (s) s.rosteredHours += Number(r.rostered_hours) || 0;
  }
  for (const uid of setterIds) {
    for (const [d, h] of args.productiveHours.get(uid) ?? []) {
      const s = get(d);
      if (s) s.productiveHours += h;
    }
  }

  for (const i of args.items) {
    if (!i.created_by || !setterIds.has(i.created_by) || i.is_follow_up) continue;
    // Sets: first meetings this setter booked that day.
    if (!i.is_reschedule_slot && i.created_at) {
      const s = get(dayKeyOf(i.created_at));
      if (s) {
        s.sets += 1;
        const method = bookingMethodOf(i);
        if (method === "manual_set") s.manualSets += 1;
        if (method === "self_booked") s.dbs += 1;
        const tier = bookingTierOf(i);
        if (tier === "tier_1") s.setsT1 += 1;
        else if (tier === "tier_2") s.setsT2 += 1;
      }
    }
    // How this setter's first meetings ended, on the day they were due.
    if (i.scheduled_for) {
      const s = get(dayKeyOf(i.scheduled_for));
      if (!s) continue;
      s.onCal += 1;
      const bucket = calendarBucketOf(i);
      if (bucket === "live") {
        s.live += 1;
        if (i.appointment_outcome === "disqualified") s.dqLive += 1;
      } else if (bucket === "noshow") s.noShows += 1;
      else if (bucket === "missed_by_us") s.missedByUs += 1;
      else if (bucket === "cancelled") s.cancels += 1;
      else if (bucket === "rescheduled") s.reschedules += 1;
      else s.pending += 1;
    }
  }

  for (const n of args.newClients) {
    if (!n.setter_id || !setterIds.has(n.setter_id)) continue;
    const s = get(n.first_start);
    if (!s) continue;
    s.sold += 1;
    s.cash += (n.mrr || 0) + (n.one_off || 0);
  }

  for (const s of byDay.values()) if (s.dials > 0) s.daysWorked = 1;
  return byDay;
}

export const rate = (n: number, d: number) => (d > 0 ? (100 * n) / d : null);
export const per = (n: number, d: number) => (d > 0 ? n / d : null);
