import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { failure, json, requireUser, unauthenticated } from "../result";

/** UTC offset (hours) for Australia/Melbourne on a given UTC instant — handles AEST/AEDT. */
function melbourneOffsetHours(at: Date): number {
  for (const offset of [10, 11]) {
    const shifted = new Date(at.getTime() + offset * 3600_000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Australia/Melbourne",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
    const [y, m, d] = parts.split("-").map(Number);
    if (shifted.getUTCFullYear() === y && shifted.getUTCMonth() + 1 === m && shifted.getUTCDate() === d) {
      return offset;
    }
  }
  return 10;
}

/** Today's date in Melbourne as YYYY-MM-DD. */
function melbourneToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** [startUtc, endUtc) ISO bounds for a Melbourne local date (YYYY-MM-DD). */
function melbourneDayBounds(date: string): { start: string; end: string } {
  const noon = new Date(`${date}T12:00:00Z`);
  const offset = melbourneOffsetHours(noon);
  const start = new Date(`${date}T00:00:00Z`);
  start.setTime(start.getTime() - offset * 3600_000);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function pct(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

type RawLog = {
  user_id: string;
  outcome: string;
  dialpad_talk_time_seconds: number | null;
  reached_connection: boolean;
  reached_problem_awareness: boolean;
  reached_solution_awareness: boolean;
  reached_commitment: boolean;
  follow_up_date: string | null;
};

function summarise(logs: RawLog[]) {
  const byOutcome: Record<string, number> = {};
  let talkSeconds = 0;
  let conversations = 0;
  let problem = 0;
  let solution = 0;
  let commitment = 0;
  let followUpsSet = 0;
  let bookings = 0;
  for (const l of logs) {
    byOutcome[l.outcome] = (byOutcome[l.outcome] ?? 0) + 1;
    talkSeconds += l.dialpad_talk_time_seconds ?? 0;
    if (l.reached_connection) conversations += 1;
    if (l.reached_problem_awareness) problem += 1;
    if (l.reached_solution_awareness) solution += 1;
    if (l.reached_commitment) commitment += 1;
    if (l.follow_up_date) followUpsSet += 1;
    if (l.outcome === "booked") bookings += 1;
  }
  return {
    dials: logs.length,
    conversations,
    connect_rate_pct: pct(conversations, logs.length),
    bookings,
    booking_rate_pct: pct(bookings, conversations),
    talk_minutes: Math.round(talkSeconds / 60),
    follow_ups_set: followUpsSet,
    funnel: {
      connection: conversations,
      problem_awareness: problem,
      solution_awareness: solution,
      commitment,
      booked,
    },
    by_outcome: byOutcome,
  };
}

const SELECT =
  "user_id, outcome, dialpad_talk_time_seconds, reached_connection, reached_problem_awareness, reached_solution_awareness, reached_commitment, follow_up_date";

export default defineTool({
  name: "report_snapshot",
  title: "Report snapshot",
  description:
    "Pre-aggregated dialling metrics for a report: dials, conversations, connect rate, bookings, booking rate, talk minutes, funnel-stage counts and outcome breakdown. All day boundaries are Australia/Melbourne local time. Defaults to the signed-in rep ('me'); admins and coaches can pass scope 'team' for a per-rep breakdown. Pair with describe_data for formula definitions.",
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Melbourne local date YYYY-MM-DD (default: today)."),
    days: z
      .number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe("Number of consecutive Melbourne days ending on `date` (default 1)."),
    scope: z.enum(["me", "team"]).optional().describe("'me' (default) or 'team' — team requires admin/coach role."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date, days, scope }, ctx) => {
    const userId = requireUser(ctx);
    if (!userId) return unauthenticated();
    const endDate = date ?? melbourneToday();
    const windowDays = days ?? 1;

    const end = melbourneDayBounds(endDate).end;
    const startDate = new Date(new Date(`${endDate}T12:00:00Z`).getTime() - (windowDays - 1) * 24 * 3600_000)
      .toISOString()
      .slice(0, 10);
    const start = melbourneDayBounds(startDate).start;

    const supabase = supabaseForUser(ctx);
    const wantsTeam = scope === "team";
    let teamAllowed = false;
    if (wantsTeam) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      teamAllowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "coach");
      if (!teamAllowed) return failure("Team scope requires an admin or coach role.");
    }

    let query = supabase.from("call_logs").select(SELECT).gte("created_at", start).lt("created_at", end).limit(20000);
    if (!teamAllowed) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) return failure(error.message);
    const logs = (data ?? []) as RawLog[];

    const result: Record<string, unknown> = {
      window: { start_date: startDate, end_date: endDate, days: windowDays, timezone: "Australia/Melbourne" },
      scope: teamAllowed ? "team" : "me",
      totals: summarise(logs),
    };

    if (teamAllowed) {
      const perRep = new Map<string, RawLog[]>();
      for (const l of logs) {
        const list = perRep.get(l.user_id) ?? [];
        list.push(l);
        perRep.set(l.user_id, list);
      }
      const repIds = [...perRep.keys()];
      const { data: profiles } = await supabase.from("profiles").select("user_id, display_name, email").in("user_id", repIds);
      const names = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? p.email ?? "Unknown rep"]));
      result.per_rep = repIds
        .map((id) => ({ rep: names.get(id) ?? "Unknown rep", ...summarise(perRep.get(id)!) }))
        .sort((a, b) => b.dials - a.dials);
    }

    return json(result);
  },
});
