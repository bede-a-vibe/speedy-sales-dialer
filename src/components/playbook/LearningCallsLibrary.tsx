import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Clock, Loader2, Lightbulb, MessageSquareWarning, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useUnsuccessfulCalls, type UnsuccessfulCall } from "@/hooks/useUnsuccessfulCalls";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { STAGE_LABELS, SKILL_TAG_LABELS } from "@/hooks/useCallCoaching";
import { EXIT_STAGE_LABELS, getExitReasonLabel } from "@/lib/funnelMetrics";
import { formatTalk } from "@/hooks/useDialpadCallStats";

/**
 * Calls that didn't book. Real conversations of two minutes or more that
 * went somewhere and then fell over, each with the coach's read of the exact
 * moment and the better path. The winning library shows the destination;
 * this shows the wrong turns, which is where most of the learning is.
 */

type StageFilter = "all" | string;

const OUTCOME_LABEL: Record<string, string> = {
  follow_up: "Follow-up",
  not_interested: "Not interested",
  dnc: "Do not call",
  disqualified: "Disqualified",
  no_answer: "No answer",
  gatekeeper: "Gatekeeper",
};

function Row({ call, repName }: { call: UnsuccessfulCall; repName: string }) {
  const [open, setOpen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const c = call.coaching;
  const broke = c?.first_broken_stage && c.first_broken_stage !== "none" ? STAGE_LABELS[c.first_broken_stage] : null;
  const skill = c?.skill_tag ? SKILL_TAG_LABELS[c.skill_tag] ?? c.skill_tag : null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{call.businessName}</span>
        {call.industry && <Badge variant="outline" className="border-border bg-muted/40 text-[10px] text-muted-foreground">{call.industry}</Badge>}
        {broke && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
            Lost at: {broke}
          </Badge>
        )}
        {!broke && call.exitStage && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
            {EXIT_STAGE_LABELS[call.exitStage]}
          </Badge>
        )}
        <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
          {OUTCOME_LABEL[call.outcome] ?? call.outcome.replace(/_/g, " ")}
        </Badge>
        <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
          <Clock className="h-3 w-3" /> {formatTalk(call.talkSeconds)}
        </span>
        <span className="text-xs text-muted-foreground">
          {repName} · {new Date(call.calledAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
          {call.exitReason && call.exitStage && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Rep logged it as: </span>
              {getExitReasonLabel(call.exitStage, call.exitReason)}
            </p>
          )}

          {c ? (
            <>
              {c.summary && <p className="text-muted-foreground">{c.summary}</p>}
              {c.key_moment && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-amber-700 dark:text-amber-300">The moment it turned</p>
                  <p className="mt-1 italic">{c.key_moment}</p>
                  {c.what_happened && <p className="mt-1.5 text-xs text-muted-foreground">{c.what_happened}</p>}
                </div>
              )}
              {c.better_path && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                    <Lightbulb className="h-3 w-3" /> The better path
                  </p>
                  <p className="mt-1">{c.better_path}</p>
                  {c.example_lines && c.example_lines.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {c.example_lines.map((l, i) => (
                        <p key={i} className="border-l-2 border-primary/50 pl-2 text-sm font-medium">{l}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {c.went_well && (
                <p className="text-xs">
                  <span className="font-medium text-emerald-700 dark:text-emerald-300">What still worked: </span>
                  <span className="text-muted-foreground">{c.went_well}</span>
                </p>
              )}
              {c.drill && (
                <p className="text-xs">
                  <span className="font-medium text-foreground">Drill: </span>
                  <span className="text-muted-foreground">{c.drill}</span>
                </p>
              )}
              {skill && <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">{skill}</Badge>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Not coached yet — the coach pass runs a few times a day. Read the transcript and find the turn yourself; that is the exercise.
            </p>
          )}

          <div>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowTranscript((v) => !v)}>
              {showTranscript ? "Hide transcript" : "Read the transcript"}
            </Button>
            {showTranscript && (
              <pre className="mt-2 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 font-sans text-xs leading-relaxed text-muted-foreground">
                {call.transcript.replace(/^Dialpad Transcript\n?/, "")}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LearningCallsLibrary() {
  const { data: calls = [], isLoading } = useUnsuccessfulCalls();
  const { data: reps = [] } = useSalesReps();
  const [stage, setStage] = useState<StageFilter>("all");
  const [minMinutes, setMinMinutes] = useState<2 | 5 | 10>(2);
  const [q, setQ] = useState("");

  const nameOf = (id: string) => reps.find((r) => r.user_id === id)?.display_name ?? "Rep";

  const stages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of calls) {
      const k = c.coaching?.first_broken_stage && c.coaching.first_broken_stage !== "none" ? c.coaching.first_broken_stage : null;
      if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [calls]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return calls.filter((c) => {
      if (c.talkSeconds < minMinutes * 60) return false;
      if (stage !== "all" && c.coaching?.first_broken_stage !== stage) return false;
      if (!needle) return true;
      return (
        c.businessName.toLowerCase().includes(needle) ||
        (c.industry ?? "").toLowerCase().includes(needle) ||
        (c.coaching?.summary ?? "").toLowerCase().includes(needle) ||
        (c.coaching?.key_moment ?? "").toLowerCase().includes(needle)
      );
    });
  }, [calls, minMinutes, stage, q]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="font-medium text-foreground">The calls that didn't book</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Real conversations, two minutes or longer, that got somewhere and then fell over. The winning library shows
          the destination — this shows the wrong turns, and that is where most of the learning is. Each one carries the
          coach's read of the exact moment it turned and what the better path was. Read the moment first, decide what
          you would have said, then open the better path.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <MessageSquareWarning className="h-4 w-4 text-primary" />
            {filtered.length} of {calls.length} long calls
          </CardTitle>
          <CardDescription>Filter by where the call broke. Start with the stage you are weakest at — the Coach tab on Training tells you which.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, industry, or what happened…" className="pl-8" />
            </div>
            <div className="flex gap-1">
              {([2, 5, 10] as const).map((m) => (
                <Button key={m} size="sm" variant={minMinutes === m ? "default" : "outline"} className="h-8 text-xs" onClick={() => setMinMinutes(m)}>
                  {m}m+
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={stage === "all" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setStage("all")}>
              All stages
            </Button>
            {stages.map(([k, n]) => (
              <Button key={k} size="sm" variant={stage === k ? "default" : "outline"} className="h-7 text-xs" onClick={() => setStage(k)}>
                {STAGE_LABELS[k] ?? k} <span className="ml-1 font-mono opacity-60">{n}</span>
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading calls…</div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches. Widen the filters.</p>
          ) : (
            <div className={cn("space-y-2")}>
              {filtered.map((c) => <Row key={c.callLogId} call={c} repName={nameOf(c.repUserId)} />)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
