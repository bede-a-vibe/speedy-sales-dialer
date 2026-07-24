import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lock, RotateCcw, Send, Swords, Timer, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type Mode = "roleplay" | "opener_drill";

interface Milestone { status: "pass" | "fail" | "skipped"; reason: string }
interface Grade {
  passed: boolean;
  milestones: Record<string, Milestone>;
  failed_milestone: string | null;
  key_message: string;
  coaching: string;
}
interface Turn { role: "rep" | "prospect"; text: string; coaching_note?: string }

const MILESTONE_LABELS: Record<string, string> = {
  opener: "Opener",
  brush_off: "Brush-off",
  discovery: "Discovery",
  booking_ask: "Booking ask",
  final_objection: "Final objection",
};

const PERSONA_NAMES: Record<string, string> = {
  busy_sparky: "Busy sparky",
  skeptical_plumber: "Skeptical old-school plumber",
  young_hustler_mover: "Young hustler (never commits)",
  gatekeeper_office_manager: "Gatekeeper / office manager",
  burned_by_agency: "Burned-by-an-agency tradie",
};

/** Latest-first rounds → number of consecutive passes at a level before any fail. */
function consecutivePasses(rounds: { level: number; passed: boolean | null }[], level: number): number {
  let streak = 0;
  for (const r of rounds) {
    if (r.level !== level) continue;
    if (r.passed) streak += 1;
    else break;
  }
  return streak;
}

/**
 * The roleplay trainer. Five hidden Aussie-tradie personas, levels 1-5 with
 * live escalation, milestone grading (process adherence, not "did you book"),
 * 3 consecutive clean rounds unlock the next level, and a 30-second opener
 * drill mode for the daily forever-drill (20-25 reps in 15 minutes).
 */
export function RoleplayTrainer({ initialScenario }: { initialScenario?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("roleplay");
  const [level, setLevel] = useState(1);
  const [history, setHistory] = useState<Turn[]>([]);
  const [persona, setPersona] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [personaRevealed, setPersonaRevealed] = useState<string | null>(null);
  const [cannotTrainNote, setCannotTrainNote] = useState<string | null>(null);
  const [shownNote, setShownNote] = useState(false);
  const [drillCount, setDrillCount] = useState(0);
  const [drillClean, setDrillClean] = useState(0);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, loading, done]);

  const { data: rounds = [] } = useQuery({
    queryKey: ["roleplay-rounds", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roleplay_rounds")
        .select("level, passed, mode, created_at")
        .eq("user_id", user!.id)
        .eq("mode", "roleplay")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { level: number; passed: boolean | null; mode: string; created_at: string }[];
    },
  });

  const maxUnlocked = useMemo(() => {
    let unlocked = 1;
    for (let l = 1; l < 5; l++) {
      // A level is conquered when its latest run includes 3 straight passes.
      if (consecutivePasses(rounds, l) >= 3) unlocked = l + 1;
      else break;
    }
    return unlocked;
  }, [rounds]);

  const streakAtLevel = consecutivePasses(rounds, level);

  async function callRound(nextHistory: Turn[], opts?: { freshRound?: boolean }) {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("coach-assistant", {
        body: {
          mode,
          level,
          persona: opts?.freshRound ? undefined : persona ?? undefined,
          history: nextHistory.map((h) => ({ role: h.role, text: h.text })),
          objection: initialScenario?.trim() || undefined,
          session_shown_cannot_train_note: shownNote,
        },
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);
      const r = result as any;
      setPersona(r.persona ?? null);
      setHistory([...nextHistory, { role: "prospect", text: r.prospect_reply ?? "…", coaching_note: r.coaching_note ?? "" }]);
      if (r.done) {
        setDone(true);
        setGrade(r.grade ?? null);
        setPersonaRevealed(r.persona_revealed?.name ?? null);
        if (r.cannot_train_note) {
          setCannotTrainNote(r.cannot_train_note);
          setShownNote(true);
        }
        if (mode === "opener_drill") {
          setDrillCount((c) => c + 1);
          if (r.grade?.passed) setDrillClean((c) => c + 1);
        }
        qc.invalidateQueries({ queryKey: ["roleplay-rounds", user?.id] });
      }
    } catch (err: any) {
      toast({ title: "Roleplay unavailable", description: err?.message ?? "Try again in a moment.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function startRound() {
    setStarted(true);
    setHistory([]);
    setDone(false);
    setGrade(null);
    setPersonaRevealed(null);
    setCannotTrainNote(null);
    setPersona(null);
    callRound([], { freshRound: true });
  }

  function send() {
    const text = input.trim();
    if (!text || loading || done) return;
    const next: Turn[] = [...history, { role: "rep", text }];
    setHistory(next);
    setInput("");
    callRound(next);
  }

  function resetAll() {
    setStarted(false);
    setHistory([]);
    setDone(false);
    setGrade(null);
    setPersonaRevealed(null);
    setPersona(null);
  }

  const milestoneOrder = mode === "opener_drill"
    ? ["opener", "brush_off", "discovery"]
    : ["opener", "brush_off", "discovery", "booking_ask", "final_objection"];

  return (
    <div className="space-y-3">
      {!started && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setMode("roleplay")}
              className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", mode === "roleplay" ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground")}
            >
              <Swords className="mr-1 inline h-3 w-3" /> Full call
            </button>
            <button
              type="button"
              onClick={() => setMode("opener_drill")}
              className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", mode === "opener_drill" ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground")}
            >
              <Timer className="mr-1 inline h-3 w-3" /> Opener drill (30s reps)
            </button>
          </div>

          {mode === "roleplay" && (
            <div>
              <p className="mb-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Level — 3 clean rounds in a row unlocks the next
              </p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((l) => {
                  const locked = l > maxUnlocked;
                  return (
                    <button
                      key={l}
                      type="button"
                      disabled={locked}
                      onClick={() => setLevel(l)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-md border font-mono text-sm transition-colors",
                        locked
                          ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground/40"
                          : level === l
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      {locked ? <Lock className="h-3.5 w-3.5" /> : l}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Level {level} streak: <span className="font-mono">{Math.min(streakAtLevel, 3)}/3</span> clean.
                {level === 3 && " Level 3 is the live-dial competency bar — a fumbled opener ends the round."}
              </p>
            </div>
          )}

          {mode === "opener_drill" && (
            <p className="text-xs text-muted-foreground">
              The forever drill: opener → one brush-off → transition, ~30 seconds, instant grade, new random persona.
              Target 20-25 reps in 15 minutes. The persona pool rotates behind the scenes — you never know who's answering.
            </p>
          )}

          {initialScenario?.trim() && (
            <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
              <span className="font-mono uppercase tracking-wider text-primary">Drill scenario:</span>{" "}
              <span className="italic">{initialScenario}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={startRound} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {mode === "opener_drill" ? "Start drilling" : "Start round"}
            </Button>
          </div>
        </div>
      )}

      {started && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-border text-[10px]">
              {mode === "opener_drill" ? "Opener drill" : `Full call · Level ${level}`}
            </Badge>
            <Badge variant="outline" className="border-border text-[10px]">Persona: hidden until round end</Badge>
            {mode === "opener_drill" && (
              <span className="ml-auto font-mono">{drillClean}/{drillCount} clean this session</span>
            )}
          </div>

          <ScrollArea className="h-[320px] rounded-md border border-border bg-background p-3">
            <div className="space-y-3">
              {history.map((msg, i) => (
                <div key={i} className={cn("flex flex-col gap-1", msg.role === "rep" ? "items-end" : "items-start")}>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {msg.role === "rep" ? "You (rep)" : "Prospect"}
                  </div>
                  <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed", msg.role === "rep" ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-foreground")}>
                    {msg.text}
                  </div>
                  {msg.role === "prospect" && msg.coaching_note && !done && (
                    <div className="max-w-[85%] rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                      <span className="mr-1 font-mono text-[9px] uppercase tracking-wider">Coach:</span>
                      {msg.coaching_note}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Prospect is thinking…
                </div>
              )}

              {done && grade && (
                <div className={cn("space-y-2 rounded-md border p-3", grade.passed ? "border-emerald-500/40 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5")}>
                  <p className="text-sm font-semibold">
                    {grade.passed ? "Clean round ✅" : "Round failed"}
                    {personaRevealed && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        You were up against: <span className="font-medium text-foreground">{personaRevealed}</span>
                      </span>
                    )}
                  </p>
                  <div className="space-y-1">
                    {milestoneOrder.map((k) => {
                      const m = grade.milestones?.[k];
                      if (!m) return null;
                      const Icon = m.status === "pass" ? CheckCircle2 : m.status === "fail" ? XCircle : MinusCircle;
                      return (
                        <p key={k} className="flex items-start gap-1.5 text-xs">
                          <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", m.status === "pass" ? "text-emerald-600 dark:text-emerald-400" : m.status === "fail" ? "text-destructive" : "text-muted-foreground/50")} />
                          <span>
                            <span className="font-medium">{MILESTONE_LABELS[k] ?? k}:</span>{" "}
                            <span className="text-muted-foreground">{m.reason || m.status}</span>
                          </span>
                        </p>
                      );
                    })}
                  </div>
                  {grade.key_message && (
                    <p className="rounded bg-background/60 px-2 py-1.5 text-xs italic">
                      Where it went sideways: "{grade.key_message}"
                    </p>
                  )}
                  {grade.coaching && <p className="text-xs leading-relaxed">{grade.coaching}</p>}
                  {cannotTrainNote && (
                    <p className="text-[11px] text-muted-foreground">{cannotTrainNote}</p>
                  )}
                </div>
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={done ? (mode === "opener_drill" ? "Hit Next rep to keep drilling." : "Round over — go again or change level.") : "Type your reply as the rep… (Enter to send)"}
              className="min-h-[60px] resize-none"
              disabled={loading || done}
            />
            <div className="flex flex-col gap-2">
              {!done ? (
                <Button onClick={send} disabled={loading || !input.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={startRound} disabled={loading} size="sm">
                  {mode === "opener_drill" ? "Next rep" : "Go again"}
                </Button>
              )}
              <Button variant="outline" size="icon" onClick={resetAll} title="Back to setup">
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
