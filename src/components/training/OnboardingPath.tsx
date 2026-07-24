import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, GraduationCap, Trophy, BookOpenText, MessageSquareQuote, Swords, ClipboardCheck, Headphones, Rocket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useSalesReps } from "@/hooks/usePipelineItems";

/**
 * The new-rep onboarding path. Steps reference material that already lives in
 * the app (winning calls, scripts, objection bank, AI roleplay) in the order a
 * new starter should work through it. Edit the list freely — progress is keyed
 * by step key, so renaming titles is safe; changing keys resets that step.
 */
const STEPS: { key: string; title: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    key: "winning_calls",
    title: "Study 3 winning calls",
    description: "Real Calls tab: read + listen to Showed & Closed calls (start with Cozlec). Note the opener, the questions, how the booking lands.",
    icon: Trophy,
  },
  {
    key: "opening_script",
    title: "Learn the opening script",
    description: "Scripts tab: the first 30 seconds, out loud, until it sounds like you — not a script.",
    icon: MessageSquareQuote,
  },
  {
    key: "objection_bank",
    title: "Know the top objections",
    description: "Playbook: read the objection bank's top entries and the NEPQ responses. You should never hear an objection for the first time on a live call.",
    icon: BookOpenText,
  },
  {
    key: "roleplay",
    title: "Roleplay with the AI coach",
    description: "Playbook → Roleplay: run at least 3 rounds — one cold open, one 'not interested', one 'send me an email'.",
    icon: Swords,
  },
  {
    key: "logging",
    title: "Learn logging + outcomes",
    description: "Definitions tab: outcomes (incl. Gatekeeper), conversation stages, DQ rules, and the DM capture flow. Bad logging poisons everyone's stats.",
    icon: ClipboardCheck,
  },
  {
    key: "shadow_calls",
    title: "Shadow 5 real calls",
    description: "Real Calls tab: listen to a mix — no-answers for rhythm, a gatekeeper hit, a booked call. Cold calling is mostly cadence.",
    icon: Headphones,
  },
  {
    key: "first_power_hour",
    title: "First live power hour",
    description: "Run a real session with a coach nearby. Your calls are recorded + scored automatically — review them together after.",
    icon: Rocket,
  },
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
          New Rep Onboarding Path
          <Badge variant="outline" className={cn("ml-1 font-mono text-[10px]", myDone === STEPS.length && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
            {myDone}/{STEPS.length}
          </Badge>
        </CardTitle>
        <CardDescription>
          Work top to bottom — every step links to material already in this app. Tick a step when you can do it, not when you've skimmed it.
        </CardDescription>
        <Progress value={pct} className="h-1.5" />
      </CardHeader>
      <CardContent className="space-y-2">
        {STEPS.map((step, i) => {
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
                  {i + 1}. {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              <Icon className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />
            </button>
          );
        })}

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
