import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dumbbell, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SKILL_TAG_LABELS, STAGE_LABELS } from "@/hooks/useCallCoaching";
import { useCallLearnings } from "@/hooks/useCallLearnings";
import { cn } from "@/lib/utils";

/**
 * Real calls that fell over, side by side with the better path the coach
 * suggested and a drill to practise it. Sourced from coached transcripts.
 */
export function RealDrillsPanel() {
  const { drills, isLoading } = useCallLearnings();
  const [stage, setStage] = useState("all");
  const navigate = useNavigate();

  const stages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of drills) if (d.brokenStage && d.brokenStage !== "none") counts.set(d.brokenStage, (counts.get(d.brokenStage) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [drills]);

  const filtered = stage === "all" ? drills : drills.filter((d) => d.brokenStage === stage);

  if (isLoading) return <div className="h-48 rounded-xl border border-border bg-muted/40 animate-pulse" />;

  if (drills.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No drills yet. They build up automatically as calls get transcribed and coached.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-background/60 p-4">
        <h3 className="font-medium text-foreground">Drills from calls that got away</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Each one is a real call: what happened, the moment it turned, and the line that would have kept it alive.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStage("all")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            stage === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          All <span className="ml-1.5 font-mono text-[10px] opacity-70">{drills.length}</span>
        </button>
        {stages.map(([key, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStage(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              stage === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {STAGE_LABELS[key] ?? key}
            <span className="ml-1.5 font-mono text-[10px] opacity-70">{count}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4">
        {filtered.slice(0, 40).map((drill) => (
          <div key={drill.id} className="rounded-xl border border-border bg-card/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{drill.businessName}</span>
                {drill.brokenStage && drill.brokenStage !== "none" && (
                  <Badge variant="outline" className="text-[10px]">{STAGE_LABELS[drill.brokenStage] ?? drill.brokenStage}</Badge>
                )}
                {drill.skillTag && <Badge variant="secondary" className="text-[10px]">{SKILL_TAG_LABELS[drill.skillTag] ?? drill.skillTag}</Badge>}
              </div>
              <span className="text-[11px] font-mono text-muted-foreground">
                {drill.calledAt ? new Date(drill.calledAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""}
              </span>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-[10px] uppercase tracking-widest text-red-600">What happened</p>
                <p className="mt-2 text-sm text-foreground">{drill.whatHappened}</p>
                {drill.keyMoment && <p className="mt-2 text-sm italic text-muted-foreground">“{drill.keyMoment}”</p>}
              </div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-[10px] uppercase tracking-widest text-emerald-600">Better path</p>
                <p className="mt-2 text-sm text-foreground">{drill.betterPath}</p>
              </div>
            </div>

            {drill.drill && (
              <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm text-foreground">{drill.drill}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => navigate(`/playbook?drill=${encodeURIComponent(drill.drill.slice(0, 200))}`)}
                >
                  <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
                  Practise it
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
