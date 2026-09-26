import { useState, useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookOpen, Sparkles, Wand2, MessageSquareText, Loader2, GraduationCap, Library, Stethoscope, Swords,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { WinningCallsLibrary } from "@/components/playbook/WinningCallsLibrary";
import { RoleplayTrainer } from "@/components/training/RoleplayTrainer";
import { ObjectionBankPanel, OBJECTION_CATEGORY_STYLES as CATEGORY_STYLES } from "@/components/training/ObjectionBankPanel";
import { SetterScript } from "@/components/training/SetterScript";
import { MindsetsPanel } from "@/components/training/MindsetsPanel";
import { ProblemsPanel } from "@/components/training/ProblemsPanel";
import { TradeSegmentsPanel } from "@/components/training/TradeSegmentsPanel";
import { CaseStudiesPanel } from "@/components/training/CaseStudiesPanel";
import { GlossaryPanel } from "@/components/training/GlossaryPanel";
import { ReframeLibrary } from "@/components/training/ReframeLibrary";
import { ColdCallOpener } from "@/components/training/ColdCallOpener";
import { ColdBrushOffs } from "@/components/training/ColdBrushOffs";
import { PainHooks } from "@/components/training/PainHooks";
import { WordTracks } from "@/components/training/WordTracks";
import { SetterBoundaries } from "@/components/training/SetterBoundaries";
import { useObjectionBank } from "@/hooks/useCallLearnings";

/**
 * Playbook — the reference surface. No progress, no submissions, nothing with
 * a status: this is what a setter opens mid-shift with a prospect talking at
 * them, so it is built to be navigated, not scrolled.
 *
 * A sticky rail instead of tabs. Seven modules across a tab strip forced long
 * nested scrolls and hid everything below the fold; a rail keeps every section
 * one click away and shows where you are. Section choice lives in the URL so a
 * link to a specific module works.
 *
 * Corpus figures are the real ones: 5,573 dials logged, 88 meetings booked,
 * 436 recorded conversations analysed, 72 discovery calls mined for language.
 */

type Group = "call" | "diagnose" | "arsenal" | "reference";

const GROUPS: { key: Group; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "call", label: "Running the call", icon: GraduationCap },
  { key: "diagnose", label: "Who + what's wrong", icon: Stethoscope },
  { key: "arsenal", label: "What you bring", icon: Swords },
  { key: "reference", label: "Look it up", icon: Library },
];

interface Section {
  id: string;
  group: Group;
  n?: number;
  title: string;
  blurb: string;
  drill?: string;
  render: () => ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "script",
    group: "call",
    n: 1,
    title: "The script",
    blurb: "Opener, pitch, appointment setting, ending. Four blocks, word for word. That is the whole call on day one.",
    drill: "Run the four blocks verbatim until they are automatic, including the pauses. Do not add pre-qualifying or the commitment lock-in yet — they come later, one at a time.",
    render: () => <SetterScript />,
  },
  {
    id: "reframes",
    group: "call",
    n: 2,
    title: "Reframes",
    blurb: "Ten reframes across eight objections, each built on the same four beats: validate, reframe, redirect, normalise.",
    drill: "Learn the price reframe word for word — it is the objection you will hit most and the one most likely to end the call badly. Then learn the four beats so you can build your own.",
    render: () => <ReframeLibrary />,
  },
  {
    id: "opener",
    group: "call",
    n: 3,
    title: "First 15 seconds",
    blurb: "What actually separates a call that survives from one that dies, and the two things that feel like failure and are not.",
    drill: "Say your full name and company out loud twenty times before your first dial. Then have someone interrupt you with \"sorry, who?\" and practise repeating it flat and unhurried.",
    render: () => <ColdCallOpener />,
  },
  {
    id: "brushoffs",
    group: "call",
    n: 4,
    title: "Brush-offs",
    blurb: "The nine things you will hear in the first twenty seconds, ranked by frequency, with what each one is actually worth.",
    drill: "Learn the book rate of the top four. Knowing that \"already got someone\" is the best signal on the board and \"not interested\" is the only real stop will change how you spend your day.",
    render: () => <ColdBrushOffs />,
  },
  {
    id: "mindsets",
    group: "diagnose",
    n: 5,
    title: "Three mindsets",
    blurb: "What they believe about growth right now, readable in thirty seconds. Plus archetypes, and what a Google Business Profile actually is.",
    drill: "Learn the tells for each mindset before the words. Mindset decides whether the call goes anywhere — archetype only changes which words you use.",
    render: () => <MindsetsPanel />,
  },
  {
    id: "problems",
    group: "diagnose",
    n: 6,
    title: "The five problems",
    blurb: "Quality, volume, inconsistency, capacity, and the hiring problem that is really a money problem. Plus the bleeding neck and building the gap.",
    drill: "Memorise the two-question diagnostic. Steady or up and down, then one follow-up. Two questions, then stop diagnosing and book.",
    render: () => <ProblemsPanel />,
  },
  {
    id: "trades",
    group: "diagnose",
    n: 7,
    title: "Trades & sub-trades",
    blurb: "A resi emergency sparky and an industrial service sparky run different businesses. One question tells you which call you are in.",
    drill: "Always ask what sort of work they mostly do before anything else. It is the question that makes you sound like you have spoken to people in their trade.",
    render: () => <TradeSegmentsPanel />,
  },
  {
    id: "pain",
    group: "diagnose",
    n: 8,
    title: "Finding the pain",
    blurb: "Ten things that are genuinely hurting these businesses, and which of them you may ask a stranger about.",
    drill: "Pick three hooks and commit them to memory. One per call, then stop talking. Running the list is an interrogation.",
    render: () => <PainHooks />,
  },
  {
    id: "lines",
    group: "arsenal",
    n: 9,
    title: "The lines",
    blurb: "Bede's own word tracks, split into the ones that transfer to a cold call and the ones that will backfire in your hands.",
    drill: "Learn the nine on the left properly rather than half-learning thirty. Read the right-hand set once so you recognise them.",
    render: () => <WordTracks />,
  },
  {
    id: "proof",
    group: "arsenal",
    n: 10,
    title: "Proof & case studies",
    blurb: "The results you can use, and how to use one without sounding like every other agency that has rung them.",
    drill: "Learn the Near Me Electrical result in one line. Relevance beats scale — never reach for the biggest number you know.",
    render: () => <CaseStudiesPanel />,
  },
  {
    id: "remit",
    group: "arsenal",
    n: 11,
    title: "Your remit",
    blurb: "The questions that go to Bede, the one hard rule, and what to capture before you hang up.",
    drill: "Memorise the handoff line. It is the answer to every pricing question you will get this week.",
    render: () => <SetterBoundaries />,
  },
  {
    id: "calls",
    group: "reference",
    title: "Winning calls",
    blurb: "Real recordings that became clients. Listen for tone, not structure.",
    render: () => <WinningCallsLibrary />,
  },
  {
    id: "objections",
    group: "reference",
    title: "Objection bank",
    blurb: "Every objection captured off the phones, with how reps responded.",
    render: () => <ObjectionBankPanel />,
  },
  {
    id: "glossary",
    group: "reference",
    title: "Glossary",
    blurb: "Every term you will hear from either side of the call, in plain English. Searchable.",
    render: () => <GlossaryPanel />,
  },
];

function AskTheCoach({ onRoleplay }: { onRoleplay: (q: string) => void }) {
  const { toast } = useToast();
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askMatched, setAskMatched] = useState<Array<{ id: string; objection_text: string; category: string }>>([]);

  async function runAsk() {
    const q = askQuestion.trim();
    if (!q || askLoading) return;
    setAskLoading(true);
    setAskAnswer(null);
    setAskMatched([]);
    try {
      const { data: result, error } = await supabase.functions.invoke("coach-assistant", {
        body: { mode: "ask", question: q },
      });
      if (error) throw error;
      if ((result as { error?: string })?.error) throw new Error((result as { error?: string }).error);
      setAskAnswer((result as { answer?: string })?.answer ?? "");
      setAskMatched((result as { matched_objections?: typeof askMatched })?.matched_objections ?? []);
    } catch (err) {
      toast({
        title: "Coach unavailable",
        description: err instanceof Error ? err.message : "Something went wrong asking the coach.",
        variant: "destructive",
      });
    } finally {
      setAskLoading(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.04] to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="h-4 w-4 text-primary" />
          Ask the Coach
        </CardTitle>
        <CardDescription>
          Stuck on something that isn't on this page? Answers are grounded in your team's own objection bank.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={askQuestion}
            onChange={(e) => setAskQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runAsk();
              }
            }}
            placeholder='How do I handle "we already have an agency"?'
            className="min-w-[200px] flex-1"
            disabled={askLoading}
          />
          <Button onClick={runAsk} disabled={askLoading || !askQuestion.trim()}>
            {askLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
          </Button>
          <Button variant="outline" onClick={() => onRoleplay(askQuestion.trim() || "")}>
            <MessageSquareText className="mr-2 h-4 w-4" />
            Roleplay
          </Button>
        </div>

        {askLoading && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Coach is thinking…
          </div>
        )}

        {askAnswer && !askLoading && (
          <div className="space-y-3">
            <div className="rounded-md border border-primary/30 bg-background p-4">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" /> Suggested reply
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{askAnswer}</p>
            </div>
            {askMatched.length > 0 && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Grounded in {askMatched.length} objection{askMatched.length === 1 ? "" : "s"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {askMatched.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
                      <Badge variant="outline" className={cn("text-[9px] uppercase", CATEGORY_STYLES[m.category])}>
                        {m.category}
                      </Badge>
                      <span className="max-w-[280px] truncate">{m.objection_text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlaybookPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [roleplayOpen, setRoleplayOpen] = useState(false);
  const [roleplayObjection, setRoleplayObjection] = useState("");

  const { data: bankRows } = useObjectionBank();
  const totalObjections = bankRows?.length ?? 0;

  const activeId = searchParams.get("s") ?? "script";
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
  const numberedCount = SECTIONS.filter((s) => s.n != null).length;

  function selectSection(id: string) {
    const next = new URLSearchParams(searchParams);
    next.set("s", id);
    setSearchParams(next, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Deep link from the Coach tab: /playbook?drill=<scenario> opens the
  // roleplay dialog pre-loaded with that drill.
  useEffect(() => {
    const drill = searchParams.get("drill");
    if (drill && !roleplayOpen) {
      setRoleplayObjection(drill);
      setRoleplayOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("drill");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openRoleplay(objection: string) {
    setRoleplayObjection(objection);
    setRoleplayOpen(true);
  }

  const railButton = (s: Section) => (
    <button
      key={s.id}
      onClick={() => selectSection(s.id)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
        s.id === active.id
          ? "border-primary/50 bg-primary/10 font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {s.n != null && (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px]",
            s.id === active.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {s.n}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{s.title}</span>
    </button>
  );

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <BookOpen className="h-6 w-6 text-primary" />
              Playbook
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Everything you need mid-call, built from Odin's own call history. Nothing here is theory — every line came
              off one of our recordings and you can go back and listen to it.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["5,573", "dials"],
              ["88", "meetings booked"],
              ["436", "calls analysed"],
              [String(totalObjections), "objections banked"],
            ].map(([n, label]) => (
              <Badge key={label} variant="outline" className="border-border bg-muted/40 font-normal">
                <span className="font-mono font-semibold text-foreground">{n}</span>
                <span className="ml-1 text-muted-foreground">{label}</span>
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Rail */}
          <nav className="lg:sticky lg:top-4 lg:self-start">
            <div className="space-y-4 rounded-xl border border-border bg-card p-3">
              {GROUPS.map((g) => {
                const Icon = g.icon;
                return (
                  <div key={g.key}>
                    <p className={cn(
                      "mb-1.5 flex items-center gap-1.5 px-1 font-mono text-[10px] uppercase tracking-widest",
                      g.key === "reference" ? "text-muted-foreground" : "text-primary",
                    )}>
                      <Icon className="h-3.5 w-3.5" /> {g.label}
                    </p>
                    <div className="space-y-0.5">
                      {SECTIONS.filter((s) => s.group === g.key).map(railButton)}
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>

          {/* Content */}
          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border border-border bg-background/60 p-4">
              {active.n != null && (
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  Module {active.n} of {numberedCount}
                </p>
              )}
              <h2 className="mt-0.5 text-lg font-semibold text-foreground">{active.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{active.blurb}</p>
              {active.drill && (
                <div className="mt-3 rounded-md border border-primary/25 bg-primary/5 px-3 py-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">Drill this</p>
                  <p className="mt-0.5 text-sm">{active.drill}</p>
                </div>
              )}
            </div>

            {active.render()}

            <AskTheCoach onRoleplay={openRoleplay} />
          </div>
        </div>
      </div>

      {/* Roleplay trainer dialog */}
      <Dialog open={roleplayOpen} onOpenChange={setRoleplayOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              Roleplay trainer
            </DialogTitle>
            <DialogDescription>
              Five hidden tradie personas, levels 1-5, milestone grading. Pass = clean process, not "did you book".
            </DialogDescription>
          </DialogHeader>
          <RoleplayTrainer key={roleplayObjection} initialScenario={roleplayObjection} />
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
