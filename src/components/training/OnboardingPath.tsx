import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, GraduationCap, Headphones, Mic, Swords, PhoneCall, Radio, Target, ShieldCheck, Rocket, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useSalesReps } from "@/hooks/usePipelineItems";

/**
 * The 14-day new-rep program. Philosophy: ecological learning — you learn by
 * doing, not by memorising word tracks. Live by Day 3; the daily loop of
 * live calls + AI coach feedback + drilling ONE fix is what builds the rep,
 * not study. Progress is keyed by step key; renaming titles is safe, changing
 * keys resets that step.
 */
const STEPS: { key: string; title: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    key: "d1_study_drill",
    title: "Day 1 — Study & drill, no live calls",
    description: "AM: listen to 5 of our BEST booked calls (Real Calls tab) — write down the opener, the discovery transition, and the booking ask, word for word. PM: drill the opener out loud, 2 sessions of 10-15 min (~40 reps each). Record yourself on your phone and listen back — if it sounds stiff, you're not done. Drilled, not memorised.",
    icon: Headphones,
  },
  {
    key: "d2_roleplay_objections",
    title: "Day 2 — Roleplay bot & objection bank",
    description: "AM: run the opener 20 times against the AI roleplay — it throws the five classic brush-offs; practise agree-reduce-redirect. PM: study the objection bank, say each reframe out loud IN YOUR OWN WORDS, then 10 deeper roleplay rounds through discovery to the ask.",
    icon: Swords,
  },
  {
    key: "d3_first_live",
    title: "Day 3 — First live dials, supervised",
    description: "50 dials, a coach beside you or on the line. Goal is NOT volume: deliver the opener live without freezing and survive the first brush-off. Coach doesn't jump in unless you're completely stuck. PM: read your AI coaching, pick ONE thing to fix, drill it 15 min.",
    icon: PhoneCall,
  },
  {
    key: "d4_light_supervision",
    title: "Day 4 — Live dials, light supervision",
    description: "80-100 dials, check-ins at start and end only — the AI coach grades everything. PM: review coaching, one fix, 15-min drill, then 30 min of roleplay on whatever brush-off hit you most today.",
    icon: PhoneCall,
  },
  {
    key: "d5_full_session",
    title: "Day 5 — Full session, coach is the supervisor",
    description: "120-150 dials over 4-5 hours, unsupervised. End of day: review your own coaching feed, pick the one fix, drill it, 15 min roleplay on the day's toughest objection.",
    icon: Rocket,
  },
  {
    key: "d6_discovery_focus",
    title: "Day 6 — Discovery focus",
    description: "Week 2 shifts from opener to conversation. Full session; the coach grades discovery specifically — good open questions, listening, no rushing to pitch. \"Alright\" is a deflection, not an answer: probe under it.",
    icon: Target,
  },
  {
    key: "d7_booking_focus",
    title: "Day 7 — Booking-ask focus",
    description: "Full session; the coach grades the ask — assumptive calendar close, never permission-seeking (\"would you be open to...\" is non-buyer language). Drill the ask + full-call roleplays opener→booking.",
    icon: Target,
  },
  {
    key: "d8_all_stages",
    title: "Day 8 — Full report card",
    description: "Full session, all stages graded. Find your weakest funnel stage in the Coach tab and drill that specifically.",
    icon: ClipboardCheck,
  },
  {
    key: "d9_cert_prep",
    title: "Day 9 — Certification prep",
    description: "Full session dialled as a test day — you're being evaluated against the certification bar. Pressure reveals where you actually are, not where you think you are.",
    icon: Radio,
  },
  {
    key: "d10_certification",
    title: "Day 10 — Certification day",
    description: "Live certification roleplay with a HUMAN evaluator playing a cold scraped tradie, five brush-offs in random order, full call opener→booking. Pass 4 of 5 tests below (opener + brush-offs are mandatory passes) → live unsupervised from Day 11. Fail → remediation plan, drill, retest tomorrow.",
    icon: ShieldCheck,
  },
  {
    key: "d11_14_live",
    title: "Days 11-14 — Live, unsupervised, the loop forever",
    description: "120-150 dials/day. The daily loop: dial → read your coaching → pick ONE fix → drill 15 min → roleplay the day's toughest moment. Weekly team review: one good call, one that needs work. The loop is the program.",
    icon: Rocket,
  },
];

/** Day-10 certification: 4/5 to pass; tests 1 & 2 are mandatory passes. Re-scored on live calls every 30 days. */
const CERT_TESTS: { title: string; pass: string }[] = [
  { title: "1. Opener consistency (mandatory)", pass: "Deliver the opener 5 times in a row — natural, relaxed, identical. Pass: the evaluator couldn't tell you've only trained two weeks. Fail: stiff, rushed, or different every time." },
  { title: "2. Brush-off handling (mandatory)", pass: "All five brush-offs in random order. Pass: 4 of 5 handled with agree-reduce-redirect, no freezing, no defensiveness, no script-reading." },
  { title: "3. Discovery flow", pass: "Pass: 3+ good open questions, follow up on 2+ answers, no pitching before the situation is uncovered. Fail: yes/no questions or rushing to pitch." },
  { title: "4. Booking ask", pass: "Pass: direct ask for a specific time commitment. Fail: hedging, apologising, or not asking." },
  { title: "5. Gatekeeper flow", pass: "Pass: get the owner's name + best callback time without pushing, door left open. Fail: pushing past, hung up on, or lead burned." },
];

function useTrainingProgress() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const progressQuery = useQuery({
    queryKey: ["training-progress"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("training_progress").select("user_id, step_key");
      if (error) throw error;
      return (data ?? []) as { user_id: string; step_key: string }[];
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ stepKey, done }: { stepKey: string; done: boolean }) => {
      if (!user) throw new Error("Not signed in");
      if (done) {
        const { error } = await supabase.from("training_progress").upsert(
          { user_id: user.id, step_key: stepKey },
          { onConflict: "user_id,step_key" },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase.from("training_progress").delete()
          .eq("user_id", user.id).eq("step_key", stepKey);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-progress"] }),
  });

  return { progressQuery, toggle };
}

export function OnboardingPath() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const { data: reps = [] } = useSalesReps();
  const { progressQuery, toggle } = useTrainingProgress();
  const rows = progressQuery.data ?? [];

  const mySteps = useMemo(
    () => new Set(rows.filter((r) => r.user_id === user?.id).map((r) => r.step_key)),
    [rows, user?.id],
  );
  const myDone = STEPS.filter((s) => mySteps.has(s.key)).length;
  const pct = Math.round((myDone / STEPS.length) * 100);

  const teamProgress = useMemo(() => {
    if (!isAdmin) return [];
    const byUser = new Map<string, number>();
    for (const r of rows) {
      if (STEPS.some((s) => s.key === r.step_key)) {
        byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
      }
    }
    return reps
      .map((rep) => ({
        name: rep.display_name || rep.email || "Rep",
        done: byUser.get(rep.user_id) ?? 0,
        isMe: rep.user_id === user?.id,
      }))
      .sort((a, b) => b.done - a.done);
  }, [isAdmin, reps, rows, user?.id]);

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-5 w-5 text-primary" />
          14-Day New Rep Program
          <Badge variant="outline" className={cn("ml-1 font-mono text-[10px]", myDone === STEPS.length && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
            {myDone}/{STEPS.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          Learn by doing, not by memorising — live dials by Day 3. The daily loop (dial → coaching → one fix → drill)
          is the program; study is just the warm-up. Tick a day when you've actually done it.
        </CardDescription>
        <Progress value={pct} className="h-1.5" />
      </CardHeader>
      <CardContent className="space-y-2">
        {STEPS.map((step) => {
          const done = mySteps.has(step.key);
          const Icon = step.icon;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => toggle.mutate({ stepKey: step.key, done: !done })}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card hover:border-primary/40",
              )}
            >
              {done
                ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />}
              <div className="min-w-0">
                <p className={cn("text-sm font-medium", done && "text-muted-foreground line-through decoration-emerald-500/40")}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              <Icon className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
            </button>
          );
        })}

        <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> The certification bar (Day 10)
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Pass at least 4 of 5 with a human evaluator. Tests 1 and 2 are non-negotiable — if you can't deliver a
            consistent opener and handle the basic brush-offs, you're not ready for live calls. Certification gets you
            on the floor; the coach re-scores it on your live calls every 30 days — sustained performance keeps you there.
          </p>
          <div className="space-y-1.5">
            {CERT_TESTS.map((t) => (
              <div key={t.title} className="rounded-md border border-border bg-card px-2.5 py-1.5">
                <p className="text-xs font-medium">{t.title}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{t.pass}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <Mic className="h-3.5 w-3.5" /> The opener drill (how to actually drill)
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Say the opener out loud for 10-15 minutes straight — you should hit it 40+ times per session, two sessions a
            day. Boring is the point: the goal is that it comes out identical and automatic, muscle memory, not
            memorisation. Record yourself and listen back; if the transcript engine mishears your name on live calls, a
            tradie on a worksite can't parse it either — slow the name, pause after the company.
          </p>
        </div>

        {isAdmin && teamProgress.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Team progress</p>
            <div className="space-y-1.5">
              {teamProgress.map((r) => (
                <div key={r.name} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{r.name}{r.isMe ? " (you)" : ""}</span>
                  <Progress value={(r.done / STEPS.length) * 100} className="h-1 w-28" />
                  <span className="font-mono tabular-nums text-muted-foreground">{r.done}/{STEPS.length}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
