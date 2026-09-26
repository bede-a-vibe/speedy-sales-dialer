import { AlertTriangle, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { PILLAR_LABELS } from "@/hooks/useCallCoaching";
import { useCallLearnings } from "@/hooks/useCallLearnings";

/** What actually blocked the booking, counted across every scored call. */
function useBookingBlockers() {
  return useQuery({
    queryKey: ["booking-blockers"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_scores")
        .select("booking_blocker, broke_down_at")
        .not("booking_blocker", "is", null)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const blockers = new Map<string, number>();
      const breakdowns = new Map<string, number>();
      for (const row of data ?? []) {
        const b = (row as any).booking_blocker as string | null;
        const d = (row as any).broke_down_at as string | null;
        if (b) blockers.set(b, (blockers.get(b) ?? 0) + 1);
        if (d) breakdowns.set(d, (breakdowns.get(d) ?? 0) + 1);
      }
      const toList = (m: Map<string, number>) =>
        [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);
      return { blockers: toList(blockers), breakdowns: toList(breakdowns), total: (data ?? []).length };
    },
  });
}

/**
 * Where calls are really breaking down — straight from the coach's scoring of
 * every transcribed call, not from a hand-written list of common mistakes.
 */
export function LeakPatternsPanel() {
  const { stageLeaks, pillarAverages, callsAnalysed, isLoading } = useCallLearnings();
  const blockers = useBookingBlockers();

  if (isLoading) return <div className="h-48 rounded-xl border border-border bg-muted/40 animate-pulse" />;

  if (callsAnalysed === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nothing to show yet — patterns appear once calls have been transcribed and scored.
        </CardContent>
      </Card>
    );
  }

  const maxBlocker = blockers.data?.blockers[0]?.count ?? 1;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-primary">
            <TrendingDown className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-widest">From {callsAnalysed} coached calls</span>
          </div>
          <CardTitle className="text-base">Where calls fall over first</CardTitle>
          <CardDescription>The first stage that broke, counted across every call the coach has read.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {stageLeaks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No broken stages recorded yet.</p>
          ) : (
            stageLeaks.map((leak) => (
              <div key={leak.stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{leak.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">{leak.count} calls · {leak.share}%</span>
                </div>
                <Progress value={leak.share} className="h-1.5" />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Team skill averages</CardTitle>
            <CardDescription>Scored out of 5 on every coached call.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pillarAverages.map((p) => (
              <div key={p.pillar} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{PILLAR_LABELS[p.pillar] ?? p.pillar}</span>
                  <span className="font-mono text-xs text-muted-foreground">{p.average || "–"} / 5</span>
                </div>
                <Progress value={(p.average / 5) * 100} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-[10px] uppercase tracking-widest">Booking blockers</span>
            </div>
            <CardTitle className="text-base">What stops the booking</CardTitle>
            <CardDescription>Across {blockers.data?.total ?? 0} scored calls.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(blockers.data?.blockers ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No blockers recorded yet.</p>
            ) : (
              blockers.data!.blockers.map((b) => (
                <div key={b.label} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2">
                  <span className="text-sm text-foreground">{b.label}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {b.count} · {Math.round((b.count / maxBlocker) * 100)}%
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
