import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, GraduationCap, Trophy, AlertOctagon, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const NEPQ_STAGES = [
  "connection",
  "situation",
  "problem_awareness",
  "solution_awareness",
  "consequence",
  "transition",
  "presentation",
  "commitment",
] as const;

type NepqStage = (typeof NEPQ_STAGES)[number];

const STAGE_LABEL: Record<NepqStage, string> = {
  connection: "Connection",
  situation: "Situation",
  problem_awareness: "Problem",
  solution_awareness: "Solution",
  consequence: "Consequence",
  transition: "Transition",
  presentation: "Presentation",
  commitment: "Commitment",
};

interface ScoreRow {
  id: string;
  call_log_id: string | null;
  created_at: string;
  scorecard: Record<string, unknown> | null;
  overall_score: number | null;
  broke_down_at: string | null;
  booking_blocker: string | null;
  call_logs: CallLogRow | null;
}

interface CallLogRow {
  id: string;
  user_id: string | null;
  outcome: string | null;
  created_at: string;
}

interface JoinedRow {
  overall: number | null;
  stageScores: Partial<Record<NepqStage, number>>;
  bookingBlocker: string | null;
  userId: string | null;
  booked: boolean;
}

const PAGE_SIZE = 1000; // PostgREST caps every response at 1000 rows.

/**
 * One score per call: the latest by created_at (then id). The scoring job has
 * written some calls many times (one call had 1,584 rows), and counting every
 * row let a single call dominate the averages.
 */
export function latestScorePerCall<T extends { id: string; call_log_id: string | null; created_at: string }>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const r of rows) {
    if (!r.call_log_id) continue;
    const cur = latest.get(r.call_log_id);
    if (!cur || r.created_at > cur.created_at || (r.created_at === cur.created_at && r.id > cur.id)) {
      latest.set(r.call_log_id, r);
    }
  }
  return Array.from(latest.values());
}

function readStageScores(scorecard: Record<string, unknown> | null): Partial<Record<NepqStage, number>> {
  if (!scorecard) return {};
  const nepq = (scorecard as { nepq_scores?: unknown }).nepq_scores;
  if (!nepq || typeof nepq !== "object") return {};
  const out: Partial<Record<NepqStage, number>> = {};
  for (const stage of NEPQ_STAGES) {
    const val = (nepq as Record<string, unknown>)[stage];
    if (typeof val === "number" && Number.isFinite(val)) out[stage] = val;
    else if (val && typeof val === "object" && typeof (val as { score?: unknown }).score === "number") {
      out[stage] = (val as { score: number }).score;
    }
  }
  return out;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-6 py-8 text-center">
      <GraduationCap className="mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface Props {
  /** Page date range (local calendar days, inclusive). Filters on the call's date, not when it was scored. */
  dateFrom: string;
  dateTo: string;
  activeRepId?: string;
  selectedRepLabel?: string;
}

/**
 * The scorer writes each blocker as free text, so the same reason arrives in
 * many wordings. Common themes are grouped; anything else keeps its own text.
 * Placeholders ("booked", "none", "n/a") are not blockers.
 */
export function blockerTheme(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const l = t.toLowerCase();
  if (/^(booked|none|n\/a|na|-|no blocker)\.?$/.test(l)) return null;
  if (/(shut|cut) (down|off) the (call|pitch|conversation)|brush[- ]?off|no need for marketing|not interested|hung up/.test(l)) return "Brushed off early (no need / not interested)";
  if (/disconnect|dropped|call (cut|ended) (out|before)|before any conversation/.test(l)) return "Call dropped before a conversation";
  if (/retir|shut down|closed down|clos(ed|ing) the business|no longer (operat|trading|in business)|out of business|ceased trading|sold the business|business (has )?closed/.test(l)) return "Business closed, sold or owner retired";
  if (/too busy|flat out|enough work|fully booked|booked out/.test(l)) return "Too busy / enough work";
  if (/already (has|have|uses|using|with)|existing (agency|provider)|another agency/.test(l)) return "Already has an agency or provider";
  if (/gatekeeper|not the (owner|decision)|decision maker (not|unavailable)/.test(l)) return "Didn't reach the decision maker";
  return t;
}

export function TeamCoachingPanel({ dateFrom, dateTo, activeRepId, selectedRepLabel }: Props) {
  const query = useQuery({
    queryKey: ["team-coaching-nepq", dateFrom, dateTo, activeRepId ?? "all"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Local-day bounds, the same as the call log range the rest of Insights uses.
      const fromIso = new Date(`${dateFrom}T00:00:00`).toISOString();
      const toIso = new Date(`${dateTo}T23:59:59.999`).toISOString();

      // Page through every score whose call happened in the range. A single
      // request is capped at 1000 rows, so a stable order (id) plus .range()
      // is the only way to read them all.
      const all: ScoreRow[] = [];
      for (let page = 0; ; page += 1) {
        let q = supabase
          .from("call_scores")
          .select(
            "id, call_log_id, created_at, scorecard, overall_score, broke_down_at, booking_blocker, call_logs!inner(id, user_id, outcome, created_at)",
          )
          .gte("call_logs.created_at", fromIso)
          .lte("call_logs.created_at", toIso);
        if (activeRepId) q = q.eq("call_logs.user_id", activeRepId);
        const { data, error } = await q
          .order("id", { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data ?? []) as unknown as ScoreRow[];
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }

      const scores = latestScorePerCall(all);
      const callLogs = scores.map((s) => s.call_logs).filter((c): c is CallLogRow => !!c);
      const callLogMap = new Map(callLogs.map((c) => [c.id, c]));

      const userIds = Array.from(new Set(callLogs.map((c) => c.user_id).filter(Boolean))) as string[];
      let profiles: { user_id: string; display_name: string | null; email: string | null }[] = [];
      if (userIds.length > 0) {
        const { data: pf } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .in("user_id", userIds);
        profiles = pf ?? [];
      }
      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

      const joined: JoinedRow[] = scores.map((s) => {
        const log = s.call_log_id ? callLogMap.get(s.call_log_id) : null;
        return {
          overall: s.overall_score,
          stageScores: readStageScores(s.scorecard),
          bookingBlocker: s.booking_blocker,
          userId: log?.user_id ?? null,
          booked: (log?.outcome ?? "").toLowerCase() === "booked",
        };
      });

      return { joined, profileMap };
    },
  });

  const aggregates = useMemo(() => {
    const rows = query.data?.joined ?? [];
    // Winners vs losers
    const bookedAvgs: Record<NepqStage, { sum: number; n: number }> = Object.fromEntries(
      NEPQ_STAGES.map((s) => [s, { sum: 0, n: 0 }]),
    ) as Record<NepqStage, { sum: number; n: number }>;
    const notBookedAvgs: Record<NepqStage, { sum: number; n: number }> = Object.fromEntries(
      NEPQ_STAGES.map((s) => [s, { sum: 0, n: 0 }]),
    ) as Record<NepqStage, { sum: number; n: number }>;

    for (const r of rows) {
      const target = r.booked ? bookedAvgs : notBookedAvgs;
      for (const stage of NEPQ_STAGES) {
        const v = r.stageScores[stage];
        if (typeof v === "number") {
          target[stage].sum += v;
          target[stage].n += 1;
        }
      }
    }

    const stageComparison = NEPQ_STAGES.map((stage) => {
      const b = bookedAvgs[stage];
      const nb = notBookedAvgs[stage];
      const bookedAvg = b.n > 0 ? b.sum / b.n : null;
      const notBookedAvg = nb.n > 0 ? nb.sum / nb.n : null;
      const gap = bookedAvg !== null && notBookedAvg !== null ? bookedAvg - notBookedAvg : null;
      return { stage, bookedAvg, notBookedAvg, gap };
    });

    // Per-rep aggregates
    const perRep = new Map<
      string,
      { calls: number; booked: number; overallSum: number; overallN: number; stages: Record<NepqStage, { sum: number; n: number }> }
    >();
    for (const r of rows) {
      if (!r.userId) continue;
      let bucket = perRep.get(r.userId);
      if (!bucket) {
        bucket = {
          calls: 0,
          booked: 0,
          overallSum: 0,
          overallN: 0,
          stages: Object.fromEntries(NEPQ_STAGES.map((s) => [s, { sum: 0, n: 0 }])) as Record<NepqStage, { sum: number; n: number }>,
        };
        perRep.set(r.userId, bucket);
      }
      bucket.calls += 1;
      if (r.booked) bucket.booked += 1;
      if (typeof r.overall === "number") {
        bucket.overallSum += r.overall;
        bucket.overallN += 1;
      }
      for (const stage of NEPQ_STAGES) {
        const v = r.stageScores[stage];
        if (typeof v === "number") {
          bucket.stages[stage].sum += v;
          bucket.stages[stage].n += 1;
        }
      }
    }

    const perRepRows = Array.from(perRep.entries()).map(([userId, bucket]) => {
      let weakestStage: NepqStage | null = null;
      let weakestAvg = Infinity;
      for (const stage of NEPQ_STAGES) {
        const s = bucket.stages[stage];
        if (s.n === 0) continue;
        const avg = s.sum / s.n;
        if (avg < weakestAvg) {
          weakestAvg = avg;
          weakestStage = stage;
        }
      }
      return {
        userId,
        calls: bucket.calls,
        bookingRate: bucket.calls > 0 ? bucket.booked / bucket.calls : 0,
        overallAvg: bucket.overallN > 0 ? bucket.overallSum / bucket.overallN : null,
        weakestStage,
        weakestAvg: Number.isFinite(weakestAvg) ? weakestAvg : null,
      };
    }).sort((a, b) => (b.calls - a.calls));

    // Booking blockers among not-booked, grouped into themes so five wordings of
    // "the business closed" count once, and placeholder text ("booked") is dropped.
    const blockerCounts = new Map<string, number>();
    for (const r of rows) {
      if (r.booked) continue;
      const b = blockerTheme(r.bookingBlocker);
      if (!b) continue;
      blockerCounts.set(b, (blockerCounts.get(b) ?? 0) + 1);
    }
    const blockers = Array.from(blockerCounts.entries())
      .map(([blocker, count]) => ({ blocker, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalScored = rows.length;
    const totalBooked = rows.filter((r) => r.booked).length;

    return { stageComparison, perRepRows, blockers, totalScored, totalBooked };
  }, [query.data]);

  const profileMap = query.data?.profileMap;
  const nameFor = (uid: string) => profileMap?.get(uid)?.display_name || profileMap?.get(uid)?.email || uid.slice(0, 8);

  const isLoading = query.isLoading;
  const isError = query.isError;
  const isEmpty = !isLoading && !isError && aggregates.totalScored === 0;

  const maxGap = Math.max(...aggregates.stageComparison.map((s) => Math.abs(s.gap ?? 0)), 0.001);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-primary" />
            Team Coaching · NEPQ{selectedRepLabel ? ` · ${selectedRepLabel}` : activeRepId ? "" : " · All reps"}
          </h3>
          <p className="text-xs text-muted-foreground">
            Auto-generated from call transcripts scored against the NEPQ framework. Calls made in the selected range, latest score per call.
          </p>
        </div>
        {!isLoading && !isEmpty && (
          <div className="text-xs text-muted-foreground tabular-nums">
            {aggregates.totalScored} scored calls · {aggregates.totalBooked} booked
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Card 1: Winners vs Losers by stage */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Winners vs Losers by NEPQ stage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : isError ? (
              <p className="text-sm text-destructive">Failed to load scorecards.</p>
            ) : isEmpty ? (
              <EmptyState message="Coaching insights appear here as your calls get scored." />
            ) : (
              <div className="space-y-2.5">
                <div className="mb-1 flex items-center gap-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-primary" /> Booked</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> Not booked</span>
                </div>
                {aggregates.stageComparison.map(({ stage, bookedAvg, notBookedAvg, gap }) => {
                  const isBigGap = gap !== null && Math.abs(gap) >= maxGap * 0.75 && Math.abs(gap) >= 0.3;
                  return (
                    <div key={stage} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("font-medium", isBigGap && "text-primary")}>{STAGE_LABEL[stage]}</span>
                        <span className="font-mono tabular-nums text-muted-foreground">
                          {bookedAvg !== null ? bookedAvg.toFixed(2) : "—"}
                          <span className="mx-1 text-muted-foreground/50">vs</span>
                          {notBookedAvg !== null ? notBookedAvg.toFixed(2) : "—"}
                          {gap !== null && (
                            <span className={cn("ml-2", gap >= 0 ? "text-primary" : "text-destructive")}>
                              {gap >= 0 ? "+" : ""}{gap.toFixed(2)}
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex h-1.5 gap-1">
                        <div className="h-full flex-1 rounded-sm bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${((bookedAvg ?? 0) / 5) * 100}%` }} />
                        </div>
                        <div className="h-full flex-1 rounded-sm bg-muted overflow-hidden">
                          <div className="h-full bg-muted-foreground/40" style={{ width: `${((notBookedAvg ?? 0) / 5) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Top booking blockers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-destructive" />
              Top booking blockers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : isError ? (
              <p className="text-sm text-destructive">Failed to load scorecards.</p>
            ) : aggregates.blockers.length === 0 ? (
              <EmptyState message="Coaching insights appear here as your calls get scored." />
            ) : (
              <ol className="space-y-1.5">
                {aggregates.blockers.map((b, idx) => {
                  const max = aggregates.blockers[0].count;
                  return (
                    <li key={b.blocker} className="space-y-1">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2">
                          <span className="font-mono tabular-nums text-muted-foreground w-4">{idx + 1}.</span>
                          <span className="text-foreground">{b.blocker}</span>
                        </span>
                        <span className="font-mono tabular-nums text-muted-foreground">{b.count}</span>
                      </div>
                      <div className="h-1 rounded-sm bg-muted overflow-hidden">
                        <div className="h-full bg-destructive/70" style={{ width: `${(b.count / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Card 2: Per-rep weakest stage */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-amber-600" />
            Per-rep weakest stage
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load scorecards.</p>
          ) : aggregates.perRepRows.length === 0 ? (
            <EmptyState message="Coaching insights appear here as your calls get scored." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Scored calls</TableHead>
                  <TableHead className="text-right">Booking rate</TableHead>
                  <TableHead className="text-right">Overall avg</TableHead>
                  <TableHead>Weakest stage</TableHead>
                  <TableHead className="text-right">Stage avg</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregates.perRepRows.map((r) => (
                  <TableRow key={r.userId}>
                    <TableCell className="font-medium">{nameFor(r.userId)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{r.calls}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{(r.bookingRate * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.overallAvg !== null ? r.overallAvg.toFixed(1) : "—"}
                    </TableCell>
                    <TableCell>
                      {r.weakestStage ? (
                        <span className="inline-flex items-center rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:text-amber-100">
                          {STAGE_LABEL[r.weakestStage]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.weakestAvg !== null ? r.weakestAvg.toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}