import { useMemo, useState } from "react";
import { Brain, ChevronDown, ChevronRight, Quote, Sparkles, Swords, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useSalesReps } from "@/hooks/usePipelineItems";
import {
  PILLAR_LABELS,
  PILLAR_ORDER,
  SKILL_TAG_LABELS,
  STAGE_LABELS,
  STREAM_LABELS,
  useCoachedCalls,
  useRepCoachingProfiles,
  type CoachedCall,
} from "@/hooks/useCallCoaching";

const OUTCOME_BADGE: Record<string, string> = {
  booked: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  not_interested: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  follow_up: "border-primary/40 bg-primary/10 text-primary",
  dnc: "border-destructive/40 bg-destructive/10 text-destructive",
  gatekeeper: "border-border bg-muted text-muted-foreground",
};

function outcomeLabel(o: string | null): string {
  if (!o) return "Call";
  return o.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function CoachedCallRow({ call }: { call: CoachedCall }) {
  const [open, setOpen] = useState(false);
  const c = call.coaching;
  const skill = c.skill_tag ? SKILL_TAG_LABELS[c.skill_tag] ?? c.skill_tag : null;
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{call.businessName}</span>
        {c.stream && STREAM_LABELS[c.stream] && (
          <Badge variant="outline" className="border-border bg-muted text-[10px] text-muted-foreground">
            {STREAM_LABELS[c.stream]}
          </Badge>
        )}
        {c.stream_mismatch && (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-[10px] text-destructive">
            Wrong playbook
          </Badge>
        )}
        {c.first_broken_stage && c.first_broken_stage !== "none" && STAGE_LABELS[c.first_broken_stage] && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
            Lost at: {STAGE_LABELS[c.first_broken_stage]}
          </Badge>
        )}
        {c.first_broken_stage === "none" && (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
            Clean call
          </Badge>
        )}
        {skill && (
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">{skill}</Badge>
        )}
        <Badge variant="outline" className={cn("text-[10px]", OUTCOME_BADGE[call.outcome ?? ""] ?? "border-border text-muted-foreground")}>
          {outcomeLabel(call.outcome)}
        </Badge>
        {call.calledAt && (
          <span className="text-xs text-muted-foreground">
            {new Date(call.calledAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
          {c.summary && <p className="text-muted-foreground">{c.summary}</p>}
          {c.pillar_scores && (
            <div className="flex flex-wrap gap-1.5">
              {PILLAR_ORDER.filter((p) => typeof c.pillar_scores![p] === "number").map((p) => {
                const score = c.pillar_scores![p] as number;
                return (
                  <span
                    key={p}
                    className={cn(
                      "rounded-full border px-2 py-0.5 font-mono text-[10px]",
                      score >= 4
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : score <= 2
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {PILLAR_LABELS[p]} {score}/5
                  </span>
                );
              })}
            </div>
          )}
          {c.key_moment && (
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-amber-700 dark:text-amber-300">
                <Quote className="h-3 w-3" /> The moment
              </p>
              <p className="text-xs italic leading-relaxed">{c.key_moment}</p>
              {c.what_happened && <p className="mt-1.5 text-xs text-muted-foreground">{c.what_happened}</p>}
            </div>
          )}
          {c.better_path && (
            <div className="rounded-md border border-primary/25 bg-primary/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-primary">
                <TrendingUp className="h-3 w-3" /> The better path
              </p>
              <p className="text-xs leading-relaxed">{c.better_path}</p>
              {(c.example_lines ?? []).length > 0 && (
                <ul className="mt-2 space-y-1">
                  {c.example_lines!.map((line, i) => (
                    <li key={i} className="rounded bg-background/60 px-2 py-1 text-xs italic">"{line}"</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {c.went_well && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-emerald-600 dark:text-emerald-400">Went well:</span> {c.went_well}
              </p>
            )}
            {c.drill && (
              <p className="inline-flex items-start gap-1 text-xs text-muted-foreground">
                <Swords className="mt-0.5 h-3 w-3 shrink-0" />
                <span><span className="font-medium text-foreground">Drill:</span> {c.drill}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The AI coach: per-rep focus areas built from real call analysis, plus a
 * call-by-call feed of "the moment / the better path" coaching. Reps see their
 * own calls; admins can flick between reps.
 */
export function CoachPanel() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const { data: reps = [] } = useSalesReps();
  const { data: calls = [], isLoading: callsLoading } = useCoachedCalls();
  const { data: profiles = [] } = useRepCoachingProfiles();
  const [repFilter, setRepFilter] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState<string | null>(null);
  const [streamFilter, setStreamFilter] = useState<string | null>(null);

  const activeUserId = repFilter ?? user?.id ?? null;
  const profile = profiles.find((p) => p.userId === activeUserId) ?? null;

  const repName = useMemo(() => {
    const m = new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Rep"]));
    return (uid: string) => m.get(uid) ?? "Rep";
  }, [reps]);

  const visible = useMemo(
    () =>
      calls.filter(
        (c) =>
          (!activeUserId || c.userId === activeUserId) &&
          (!skillFilter || c.coaching.skill_tag === skillFilter) &&
          (!streamFilter || c.coaching.stream === streamFilter),
      ),
    [calls, activeUserId, skillFilter, streamFilter],
  );

  const streamCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of calls) {
      if (activeUserId && c.userId !== activeUserId) continue;
      const s = c.coaching.stream;
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return counts;
  }, [calls, activeUserId]);

  const skillCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of calls) {
      if (activeUserId && c.userId !== activeUserId) continue;
      const t = c.coaching.skill_tag;
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [calls, activeUserId]);

  return (
    <div className="space-y-4">
      {isAdmin && reps.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {reps.map((r) => (
            <button
              key={r.user_id}
              type="button"
              onClick={() => setRepFilter(r.user_id === activeUserId ? null : r.user_id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                r.user_id === activeUserId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
              )}
            >
              {r.display_name || r.email || "Rep"}
            </button>
          ))}
        </div>
      )}

      <Card className="border-primary/25">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            {activeUserId === user?.id || !activeUserId ? "Your coaching focus" : `${repName(activeUserId)}'s coaching focus`}
            {profile && (
              <Badge variant="outline" className="ml-1 font-mono text-[10px] text-muted-foreground">
                {profile.callsAnalyzed} calls analysed
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Built by AI from your real conversations, benchmarked against the calls that booked. Updates as you dial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!profile && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No profile yet — it appears automatically once the coach has analysed a few of your answered calls.
            </p>
          )}
          {profile?.focusAreas.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium">
                {i + 1}. {f.area ?? "Focus area"}
                {f.skill_tag && SKILL_TAG_LABELS[f.skill_tag] && (
                  <Badge variant="outline" className="ml-2 border-primary/40 bg-primary/10 text-[10px] text-primary">
                    {SKILL_TAG_LABELS[f.skill_tag]}
                  </Badge>
                )}
              </p>
              {f.evidence && <p className="mt-1 text-xs text-muted-foreground">{f.evidence}</p>}
              {f.better_path && <p className="mt-1 text-xs"><span className="font-medium">Better path:</span> {f.better_path}</p>}
              {f.drill && (
                <p className="mt-1 inline-flex items-start gap-1 text-xs text-muted-foreground">
                  <Swords className="mt-0.5 h-3 w-3 shrink-0" /> {f.drill}
                </p>
              )}
            </div>
          ))}
          {(profile?.strengths ?? []).length > 0 && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                <Sparkles className="h-3 w-3" /> Keep doing
              </p>
              {profile!.strengths.map((s, i) => (
                <p key={i} className="text-xs leading-relaxed">
                  <span className="font-medium text-foreground">{s.area}</span>
                  {s.evidence ? <span className="text-muted-foreground"> — {s.evidence}</span> : null}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Call-by-call coaching</CardTitle>
          <CardDescription>Every answered call gets reviewed: the moment it was won or lost, and the better path.</CardDescription>
          {streamCounts.size > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[...streamCounts.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStreamFilter(streamFilter === s ? null : s)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    streamFilter === s
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
                  )}
                >
                  {STREAM_LABELS[s] ?? s}
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">{n}</span>
                </button>
              ))}
            </div>
          )}
          {skillCounts.size > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[...skillCounts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, n]) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSkillFilter(skillFilter === tag ? null : tag)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    skillFilter === tag
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
                  )}
                >
                  {SKILL_TAG_LABELS[tag] ?? tag}
                  <span className="ml-1 font-mono text-[10px] text-muted-foreground">{n}</span>
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {callsLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!callsLoading && visible.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing coached yet — answered calls are analysed automatically a few times a day.
            </p>
          )}
          {visible.map((c) => (
            <CoachedCallRow key={c.id} call={c} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
