import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingDown, TrendingUp, Minus, BarChart3, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useBookedAppointmentsByDateRange, useRescheduleSlotsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { STAGE_LABELS, type CoachingJson } from "@/hooks/useCallCoaching";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { pct, setterShowRate, statsFor, type CoachRow, type RoundRow } from "@/lib/managerMetrics";
import { shiftDateKey, todayDateKey } from "@/lib/reportMetrics";

const DAY = 86_400_000;
const PAGE = 1000;

interface InboundLead { id: string; created_at: string; firstDialAt: string | null }

/** Speed-to-lead: minutes from an inbound (ad) lead landing to its first dial. */
function useSpeedToLead() {
  return useQuery({
    queryKey: ["speed-to-lead"],
    staleTime: 60_000,
    queryFn: async (): Promise<InboundLead[]> => {
      const since = new Date(Date.now() - 14 * DAY).toISOString();
      const { data: leads, error } = await supabase
        .from("contacts")
        .select("id, created_at")
        .eq("lead_type", "inbound")
        .gte("created_at", since);
      if (error) throw error;
      if (!leads?.length) return [];
      const ids = leads.map((l) => l.id);
      const { data: logs, error: logErr } = await supabase
        .from("call_logs")
        .select("contact_id, created_at")
        .in("contact_id", ids)
        .order("created_at", { ascending: true });
      if (logErr) throw logErr;
      const firstDial = new Map<string, string>();
      for (const l of logs ?? []) {
        if (!firstDial.has(l.contact_id)) firstDial.set(l.contact_id, l.created_at);
      }
      return leads.map((l) => ({ id: l.id, created_at: l.created_at, firstDialAt: firstDial.get(l.id) ?? null }));
    },
  });
}

/** Every row: the API returns at most 1,000 a request, so a single select silently drops the rest. */
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const got = (data ?? []) as T[];
    rows.push(...got);
    if (got.length < PAGE) return rows;
  }
}

function useCoachingData() {
  return useQuery({
    queryKey: ["manager-coaching"],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * DAY).toISOString();
      const [coaching, rounds] = await Promise.all([
        allRows<{ user_id: string; coaching: CoachingJson | null; created_at: string }>((a, b) =>
          supabase.from("call_coaching").select("user_id, coaching, created_at").gte("created_at", since).order("created_at").order("id").range(a, b)),
        allRows<RoundRow>((a, b) =>
          supabase.from("roleplay_rounds").select("user_id, mode, passed, created_at").gte("created_at", since).order("created_at").order("id").range(a, b)),
      ]);
      return {
        coaching: coaching.map((r): CoachRow => ({
          user_id: r.user_id,
          stage: r.coaching?.first_broken_stage ?? null,
          pillars: r.coaching?.pillar_scores ?? null,
          created_at: r.created_at,
        })),
        rounds,
      };
    },
  });
}

function Delta({ now, prev }: { now: number | null; prev: number | null }) {
  if (now == null || prev == null) return <Minus className="h-3 w-3 text-muted-foreground/40" />;
  if (now > prev) return <TrendingUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />;
  if (now < prev) return <TrendingDown className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground/40" />;
}

/**
 * The manager's three weekly numbers per rep (this week vs last), plus the
 * four recertification triggers computed live. Thresholds follow the manager
 * playbook, with the pickup→conversation trigger made relative to the team
 * (the absolute 60% bar is an inbound-calibrated number, not cold-call reality).
 */
export function ManagerMetrics() {
  // The same loaders Insights uses: every call in the window and the one attendance rule.
  const today = todayDateKey();
  const showFrom = shiftDateKey(today, -27);
  const logsQuery = useCallLogsByDateRange(shiftDateKey(today, -14), today);
  const bookingsQuery = useBookedAppointmentsByDateRange(showFrom, today);
  const slotsQuery = useRescheduleSlotsByDateRange(showFrom, today);
  const coachingQuery = useCoachingData();
  const queries = [logsQuery, bookingsQuery, slotsQuery, coachingQuery];
  const isError = queries.some((q) => q.isError);
  const isLoading = !isError && queries.some((q) => q.isLoading);
  const logs = logsQuery.data;
  const bookings = bookingsQuery.data;
  const slots = slotsQuery.data;
  const data = coachingQuery.data;
  const { data: reps = [] } = useSalesReps();
  const { data: inboundLeads = [] } = useSpeedToLead();

  const speedToLead = useMemo(() => {
    if (!inboundLeads.length) return null;
    const dialled = inboundLeads.filter((l) => l.firstDialAt);
    const minutes = dialled
      .map((l) => (new Date(l.firstDialAt!).getTime() - new Date(l.created_at).getTime()) / 60_000)
      .filter((m) => m >= 0)
      .sort((a, b) => a - b);
    const median = minutes.length ? minutes[Math.floor(minutes.length / 2)] : null;
    const within5 = minutes.filter((m) => m <= 5).length;
    return {
      total: inboundLeads.length,
      undialled: inboundLeads.length - dialled.length,
      median,
      within5Pct: minutes.length ? Math.round((100 * within5) / minutes.length) : null,
    };
  }, [inboundLeads]);

  // Fixed per load of the calls, so the rolling windows don't rebuild the model on every render.
  const now = logsQuery.dataUpdatedAt;
  const model = useMemo(() => {
    if (!data || !logs || !bookings || !slots) return null;
    const { coaching, rounds } = data;

    const pillarAvg = (userId: string, fromMs: number, toMs: number): number | null => {
      const scores: number[] = [];
      for (const c of coaching) {
        if (c.user_id !== userId || !c.pillars) continue;
        const t = new Date(c.created_at).getTime();
        if (t < fromMs || t >= toMs) continue;
        for (const v of Object.values(c.pillars)) {
          if (typeof v === "number") scores.push(v);
        }
      }
      if (!scores.length) return null;
      return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    };

    const activeReps = reps.filter((r) => logs.some((l) => l.user_id === r.user_id));
    const team7 = statsFor(logs, null, now - 7 * DAY, now);
    const teamConvRate = pct(team7.conv2, team7.pickups);

    const rows = activeReps.map((rep) => {
      const cur = statsFor(logs, rep.user_id, now - 7 * DAY, now);
      const prev = statsFor(logs, rep.user_id, now - 14 * DAY, now - 7 * DAY);

      const show = setterShowRate(bookings, slots, rep.user_id, showFrom, today);

      // Recert triggers (manager playbook §recert)
      const flags: string[] = [];
      const stageCounts = new Map<string, number>();
      for (const c of coaching) {
        if (c.user_id !== rep.user_id || !c.stage || c.stage === "none") continue;
        if (new Date(c.created_at).getTime() < now - 7 * DAY) continue;
        stageCounts.set(c.stage, (stageCounts.get(c.stage) ?? 0) + 1);
      }
      for (const [stage, n] of stageCounts) {
        if (n >= 10) flags.push(`Same stage failing repeatedly: ${STAGE_LABELS[stage] ?? stage} on ${n} calls in 7 days`);
      }
      const convRate = pct(cur.conv2, cur.pickups);
      if (convRate != null && teamConvRate != null && cur.pickups >= 15 && convRate < teamConvRate * 0.6) {
        flags.push(`Pickup→conversation well below team (${convRate}% vs team ${teamConvRate}%)`);
      }
      const last5 = statsFor(logs, rep.user_id, now - 5 * DAY, now);
      if (last5.bookings === 0 && last5.dials >= 300) {
        flags.push(`0 bookings in 5 days despite ${last5.dials} dials`);
      }
      if (show.rate != null && show.resolved >= 4 && show.rate < 50) {
        flags.push(`Show rate ${show.rate}% over the last 4 weeks (${show.showed} of ${show.resolved})`);
      }

      const drillDays = new Set(
        rounds
          .filter((rr) => rr.user_id === rep.user_id && rr.mode === "opener_drill" && new Date(rr.created_at).getTime() >= now - 7 * DAY)
          .map((rr) => new Date(rr.created_at).toDateString()),
      );
      const drillReps7d = rounds.filter(
        (rr) => rr.user_id === rep.user_id && rr.mode === "opener_drill" && new Date(rr.created_at).getTime() >= now - 7 * DAY,
      ).length;

      return {
        name: rep.display_name || rep.email || "Rep",
        cur, prev,
        convRate,
        prevConvRate: pct(prev.conv2, prev.pickups),
        bookPer100: cur.dials >= 20 ? Math.round((100 * cur.bookings) / cur.dials * 10) / 10 : null,
        prevBookPer100: prev.dials >= 20 ? Math.round((100 * prev.bookings) / prev.dials * 10) / 10 : null,
        showRate: show.rate,
        showN: show.resolved,
        pillarNow: pillarAvg(rep.user_id, now - 7 * DAY, now),
        pillarPrev: pillarAvg(rep.user_id, now - 14 * DAY, now - 7 * DAY),
        drillDays: drillDays.size,
        drillReps7d,
        flags,
      };
    }).sort((a, b) => (b.bookPer100 ?? -1) - (a.bookPer100 ?? -1));

    return { rows, teamConvRate };
  }, [data, logs, bookings, slots, reps, showFrom, today, now]);

  return (
    <div className="space-y-3">
      {speedToLead && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Speed to lead (inbound, last 14 days)
            </CardTitle>
            <CardDescription>Within 5 minutes of the form ≈ 100x. This is the one metric where minutes matter.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="font-mono text-2xl font-semibold">{speedToLead.total}</p>
              <p className="text-xs text-muted-foreground">inbound leads</p>
            </div>
            <div>
              <p className={cn("font-mono text-2xl font-semibold", (speedToLead.median ?? 99) <= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                {speedToLead.median != null ? `${Math.round(speedToLead.median)}m` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">median to first dial</p>
            </div>
            <div>
              <p className="font-mono text-2xl font-semibold">{speedToLead.within5Pct != null ? `${speedToLead.within5Pct}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">dialled within 5 min</p>
            </div>
            {speedToLead.undialled > 0 && (
              <div>
                <p className="font-mono text-2xl font-semibold text-destructive">{speedToLead.undialled}</p>
                <p className="text-xs text-muted-foreground">never dialled — burning intent</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" /> The three weekly numbers
          </CardTitle>
          <CardDescription>
            Per rep, last 7 days vs the 7 before. Ranked on bookings per 100 dials — the ranking metric. Show rate is
            first meetings they set that sat, over 4 weeks, with no-shows, cancellations and moved meetings counted against it. Keep this table private: reps should see their own numbers and the
            team average, not each other's.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>}
          {isError && <p className="py-4 text-center text-sm text-destructive">Couldn't load all the numbers. Refresh to try again.</p>}
          {model && model.rows.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No calls in the last 14 days.</p>
          )}
          {model && model.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    <th className="py-1.5 pr-3">Rep</th>
                    <th className="py-1.5 pr-3">Pickup → 2-min conv</th>
                    <th className="py-1.5 pr-3">Bookings / 100 dials</th>
                    <th className="py-1.5 pr-3">Show rate (4w)</th>
                    <th className="py-1.5 pr-3">Pillar avg (7d)</th>
                    <th className="py-1.5 pr-3">Opener drill (7d)</th>
                    <th className="py-1.5">Dials · pickups · bookings (7d)</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.map((r) => (
                    <tr key={r.name} className="border-b border-border/50">
                      <td className="py-2 pr-3 font-medium">{r.name}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          {r.convRate != null ? `${r.convRate}%` : "—"} <Delta now={r.convRate} prev={r.prevConvRate} />
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          {r.bookPer100 != null ? r.bookPer100 : "—"} <Delta now={r.bookPer100} prev={r.prevBookPer100} />
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {r.showRate != null ? `${r.showRate}%` : "—"}
                        {r.showN > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({r.showN})</span>}
                      </td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          {r.pillarNow != null ? `${r.pillarNow}/5` : "—"} <Delta now={r.pillarNow} prev={r.pillarPrev} />
                        </span>
                      </td>
                      <td className={cn("py-2 pr-3 font-mono tabular-nums", r.drillDays >= 5 ? "text-emerald-600 dark:text-emerald-400" : r.drillDays === 0 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400")}>
                        {r.drillDays}/5 days ({r.drillReps7d} reps)
                      </td>
                      <td className="py-2 font-mono tabular-nums text-muted-foreground">
                        {r.cur.dials} · {r.cur.pickups} · {r.cur.bookings}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {model && model.rows.some((r) => r.flags.length > 0) && (
        <Card className="border-amber-500/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Recertification flags
            </CardTitle>
            <CardDescription>
              Triggers from the playbook below. A flag means a 2-5 day targeted reset conversation — diagnosis first, one
              pattern, targeted roleplay, re-verify. Not a re-onboarding, and no mark on the record once cleared.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {model.rows.filter((r) => r.flags.length > 0).map((r) => (
              <div key={r.name} className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <p className="text-sm font-medium">{r.name}</p>
                {r.flags.map((f, i) => (
                  <p key={i} className="text-xs text-muted-foreground">• {f}</p>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
