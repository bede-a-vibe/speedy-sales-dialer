import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReportSection } from "@/components/reports/ReportSection";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useSalesReps } from "@/hooks/usePipelineItems";

/** A conversation "survives" the opener when talk time clears this bar. */
const SURVIVAL_SECONDS = 120;
/** Empirical: ~93% of booked calls cleared 2 minutes; ~1 in 5 calls past the bar books. */
const BOOK_RATE_PAST_BAR = 0.2;

interface Row {
  user_id: string;
  outcome: string;
  talk: number;
  created_at: string;
}

interface ConfusionRow { day: string; transcript_calls: number; confusion_calls: number }

/** Daily identity-confusion aggregates ("from where, sorry?" openings), refreshed hourly by cron. */
function useOpenerConfusion(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["opener-confusion", dateFrom, dateTo],
    staleTime: 60_000,
    queryFn: async (): Promise<ConfusionRow[]> => {
      const { data, error } = await supabase
        .from("opener_confusion_daily" as never)
        .select("day, transcript_calls, confusion_calls")
        .gte("day", dateFrom)
        .lte("day", dateTo);
      if (error) throw error;
      return (data ?? []) as unknown as ConfusionRow[];
    },
  });
}

function useAnsweredCalls(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ["opener-survival", dateFrom, dateTo],
    staleTime: 60_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("user_id, outcome, dialpad_talk_time_seconds, created_at")
        .in("outcome", ["booked", "not_interested", "follow_up", "dnc"])
        .not("dialpad_talk_time_seconds", "is", null)
        .gte("created_at", `${dateFrom}T00:00:00`)
        .lte("created_at", `${dateTo}T23:59:59`);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        user_id: r.user_id,
        outcome: r.outcome,
        talk: r.dialpad_talk_time_seconds ?? 0,
        created_at: r.created_at,
      }));
    },
  });
}

/**
 * The opener lever: % of real pickups that survive past 2 minutes of talk.
 * Empirically ~93% of everything we've booked cleared this bar, and ~1 in 5
 * conversations past it books — so every extra survivor is ~0.2 bookings.
 */
export function OpenerSurvivalCard({ dateFrom, dateTo, activeRepId }: { dateFrom: string; dateTo: string; activeRepId?: string }) {
  const { data: rows = [], isLoading } = useAnsweredCalls(dateFrom, dateTo);
  const { data: confusion = [] } = useOpenerConfusion(dateFrom, dateTo);
  const { data: reps = [] } = useSalesReps();

  const confusionStats = useMemo(() => {
    const calls = confusion.reduce((a, r) => a + r.transcript_calls, 0);
    const confused = confusion.reduce((a, r) => a + r.confusion_calls, 0);
    return calls >= 5 ? { pct: Math.round((100 * confused) / calls), calls } : null;
  }, [confusion]);

  const repName = useMemo(() => {
    const m = new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Rep"]));
    return (uid: string) => m.get(uid) ?? "Rep";
  }, [reps]);

  const filtered = activeRepId ? rows.filter((r) => r.user_id === activeRepId) : rows;
  const pickups = filtered.length;
  const survived = filtered.filter((r) => r.talk >= SURVIVAL_SECONDS).length;
  const rate = pickups ? Math.round((100 * survived) / pickups) : 0;

  const perRep = useMemo(() => {
    const byRep = new Map<string, { pickups: number; survived: number }>();
    for (const r of rows) {
      const s = byRep.get(r.user_id) ?? { pickups: 0, survived: 0 };
      s.pickups += 1;
      if (r.talk >= SURVIVAL_SECONDS) s.survived += 1;
      byRep.set(r.user_id, s);
    }
    return [...byRep.entries()]
      .map(([uid, s]) => ({ uid, ...s, rate: s.pickups ? Math.round((100 * s.survived) / s.pickups) : 0 }))
      .sort((a, b) => b.pickups - a.pickups);
  }, [rows]);

  return (
    <ReportSection
      title="Opener Survival — the 2-Minute Gate"
      description="Real pickups that turn into a 2-minute-plus conversation. 93% of everything ever booked cleared this bar; roughly 1 in 5 conversations past it books."
    >
      {isLoading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
      ) : pickups === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No answered calls with talk-time data in this range.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="font-mono text-3xl font-semibold text-foreground">{rate}%</p>
              <p className="text-xs text-muted-foreground">{survived} of {pickups} pickups survived past 2 min</p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
              <Radio className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">
                +10 pts here ≈ <span className="font-medium text-foreground">{Math.round(pickups * 0.1 * BOOK_RATE_PAST_BAR)} extra bookings</span>{" "}
                on this volume. Tag your opener on every call — the Funnel tab compares them.
              </p>
            </div>
            {confusionStats && (
              <div>
                <p className={cn("font-mono text-3xl font-semibold", confusionStats.pct >= 30 ? "text-destructive" : confusionStats.pct >= 15 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                  {confusionStats.pct}%
                </p>
                <p className="text-xs text-muted-foreground" title='Conversations opening with "from where, sorry?" / "who is this?" — the name didn&apos;t land first time'>
                  name didn't land first time ({confusionStats.calls} convos)
                </p>
              </div>
            )}
          </div>
          {!activeRepId && perRep.length > 1 && (
            <div className="space-y-1.5">
              {perRep.map((r) => (
                <div key={r.uid} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 w-32 truncate">{repName(r.uid)}</span>
                  <Progress value={r.rate} className="h-1.5 flex-1" />
                  <span className={cn("w-24 text-right font-mono tabular-nums", r.rate >= 35 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                    {r.rate}% ({r.survived}/{r.pickups})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </ReportSection>
  );
}
