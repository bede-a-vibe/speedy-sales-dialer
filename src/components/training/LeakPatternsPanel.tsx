import { AlertTriangle, TrendingDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PILLAR_LABELS, SKILL_TAG_LABELS } from "@/hooks/useCallCoaching";
import { useCallLearnings } from "@/hooks/useCallLearnings";

/**
 * Where calls are really breaking down — straight from the coach's scoring of
 * every transcribed call, not from a hand-written list of common mistakes.
 */
export function LeakPatternsPanel() {
  const { stageLeaks, skillLeaks, pillarAverages, callsAnalysed, isLoading } = useCallLearnings();

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

  const maxSkill = skillLeaks[0]?.count ?? 1;

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
              <span className="text-[10px] uppercase tracking-widest">One fix per call</span>
            </div>
            <CardTitle className="text-base">The skill the coach flags most</CardTitle>
            <CardDescription>Each coached call gets one thing to work on — this is how they stack up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {skillLeaks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skill flags recorded yet.</p>
            ) : (
              skillLeaks.slice(0, 8).map((s) => (
                <div key={s.tag} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-3 py-2">
                  <span className="text-sm text-foreground">{SKILL_TAG_LABELS[s.tag] ?? s.label}</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {s.count} · {Math.round((s.count / maxSkill) * 100)}%
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
