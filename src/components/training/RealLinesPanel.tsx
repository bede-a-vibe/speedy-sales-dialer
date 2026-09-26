import { useMemo, useState } from "react";
import { Quote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SKILL_TAG_LABELS } from "@/hooks/useCallCoaching";
import { useCallLearnings } from "@/hooks/useCallLearnings";
import { cn } from "@/lib/utils";

/**
 * Lines reps actually used on calls that booked. Pulled from the AI coach's
 * pass over real transcripts — nothing here is written by hand.
 */
export function RealLinesPanel() {
  const { winningLines, bookedAnalysed, isLoading } = useCallLearnings();
  const [tag, setTag] = useState("all");

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of winningLines) if (l.skillTag) counts.set(l.skillTag, (counts.get(l.skillTag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [winningLines]);

  const filtered = tag === "all" ? winningLines : winningLines.filter((l) => l.skillTag === tag);

  if (isLoading) {
    return <div className="h-40 rounded-xl border border-border bg-muted/40 animate-pulse" />;
  }

  if (winningLines.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No winning lines yet. They appear here automatically once booked calls have been transcribed and coached.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <h3 className="font-medium text-foreground">Lines that actually booked meetings</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Taken word for word from {bookedAnalysed} booked call{bookedAnalysed === 1 ? "" : "s"}. Say them in your own voice — the
          structure is what matters, not the wording.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTag("all")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            tag === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          All <span className="ml-1.5 font-mono text-[10px] opacity-70">{winningLines.length}</span>
        </button>
        {tags.map(([key, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTag(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              tag === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {SKILL_TAG_LABELS[key] ?? key}
            <span className="ml-1.5 font-mono text-[10px] opacity-70">{count}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {filtered.slice(0, 60).map((line, i) => (
          <div key={`${line.line.slice(0, 40)}-${i}`} className="rounded-xl border border-border bg-card/70 p-4">
            <div className="flex gap-3">
              <Quote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm leading-relaxed text-foreground">{line.line}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {line.skillTag && <Badge variant="outline" className="text-[10px]">{SKILL_TAG_LABELS[line.skillTag] ?? line.skillTag}</Badge>}
              <span className="text-[11px] font-mono text-muted-foreground">
                {line.businessName}
                {line.calledAt ? ` · ${new Date(line.calledAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
