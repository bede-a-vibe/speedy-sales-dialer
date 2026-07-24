import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search, Sparkles, Radio, Wand2, MessageSquareText, Loader2, RotateCcw, Trophy, Send } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { WinningCallsLibrary } from "@/components/playbook/WinningCallsLibrary";

type ObjectionRow = {
  id: string;
  objection_text: string;
  category: string;
  example_responses: Array<{ response: string; source?: string }> | null;
  source: "framework" | "call";
  times_seen: number;
  booked_count: number;
  led_to_booking: boolean | null;
};

const CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "logistical", label: "Logistical" },
  { key: "fear", label: "Fear" },
  { key: "smokescreen", label: "Smokescreen" },
  { key: "price", label: "Price" },
  { key: "timing", label: "Timing" },
  { key: "authority", label: "Authority" },
  { key: "competitor", label: "Competitor" },
  { key: "other", label: "Other" },
];

const CATEGORY_STYLES: Record<string, string> = {
  logistical: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  fear: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  smokescreen: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  price: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  timing: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  authority: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
  competitor: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  other: "bg-muted text-muted-foreground border-border",
};

export default function PlaybookPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const { toast } = useToast();

  // Ask state
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askMatched, setAskMatched] = useState<Array<{ id: string; objection_text: string; category: string }>>([]);

  // Roleplay state
  const [roleplayOpen, setRoleplayOpen] = useState(false);
  const [roleplayObjection, setRoleplayObjection] = useState("");
  const [roleplayStarted, setRoleplayStarted] = useState(false);
  const [roleplayHistory, setRoleplayHistory] = useState<Array<{ role: "rep" | "prospect"; text: string; coaching_note?: string }>>([]);
  const [repInput, setRepInput] = useState("");
  const [roleplayLoading, setRoleplayLoading] = useState(false);
  const [roleplayDone, setRoleplayDone] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [roleplayHistory, roleplayLoading]);

  // Deep link from the Coach tab: /playbook?drill=<scenario> opens the
  // roleplay dialog pre-loaded with that drill.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const drill = searchParams.get("drill");
    if (drill && !roleplayOpen) {
      setRoleplayObjection(drill);
      setRoleplayOpen(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ["objection-bank"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("objection_bank")
        .select("id, objection_text, category, example_responses, source, times_seen, booked_count, led_to_booking")
        .order("source", { ascending: true })
        .order("times_seen", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ObjectionRow[];
    },
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeCategory !== "all" && r.category !== activeCategory) return false;
      if (!q) return true;
      if (r.objection_text.toLowerCase().includes(q)) return true;
      return (r.example_responses ?? []).some((e) =>
        String(e?.response ?? "").toLowerCase().includes(q),
      );
    });
  }, [data, activeCategory, query]);

  const totals = useMemo(() => {
    const rows = data ?? [];
    const byCat: Record<string, number> = {};
    for (const r of rows) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
    return { total: rows.length, byCat };
  }, [data]);

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
      if ((result as any)?.error) throw new Error((result as any).error);
      setAskAnswer((result as any)?.answer ?? "");
      setAskMatched((result as any)?.matched_objections ?? []);
    } catch (err: any) {
      toast({
        title: "Coach unavailable",
        description: err?.message ?? "Something went wrong asking the coach.",
        variant: "destructive",
      });
    } finally {
      setAskLoading(false);
    }
  }

  function openRoleplay(objection: string) {
    setRoleplayObjection(objection);
    setRoleplayStarted(false);
    setRoleplayHistory([]);
    setRepInput("");
    setRoleplayDone(false);
    setRoleplayOpen(true);
  }

  async function startRoleplay() {
    const obj = roleplayObjection.trim();
    if (!obj || roleplayLoading) return;
    setRoleplayStarted(true);
    setRoleplayLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("coach-assistant", {
        body: { mode: "roleplay", objection: obj, history: [] },
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);
      const r = result as any;
      setRoleplayHistory([{ role: "prospect", text: r.prospect_reply ?? "…" }]);
      setRoleplayDone(Boolean(r.done));
    } catch (err: any) {
      toast({
        title: "Roleplay failed to start",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
      setRoleplayStarted(false);
    } finally {
      setRoleplayLoading(false);
    }
  }

  async function sendRepReply() {
    const text = repInput.trim();
    if (!text || roleplayLoading || roleplayDone) return;
    const nextHistory: Array<{ role: "rep" | "prospect"; text: string; coaching_note?: string }> = [
      ...roleplayHistory,
      { role: "rep", text },
    ];
    setRoleplayHistory(nextHistory);
    setRepInput("");
    setRoleplayLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("coach-assistant", {
        body: {
          mode: "roleplay",
          objection: roleplayObjection,
          history: nextHistory.map((h) => ({ role: h.role, text: h.text })),
        },
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);
      const r = result as any;
      setRoleplayHistory([
        ...nextHistory,
        { role: "prospect", text: r.prospect_reply ?? "…", coaching_note: r.coaching_note ?? "" },
      ]);
      setRoleplayDone(Boolean(r.done));
    } catch (err: any) {
      toast({
        title: "Coach unavailable",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setRoleplayLoading(false);
    }
  }

  function resetRoleplay() {
    setRoleplayStarted(false);
    setRoleplayHistory([]);
    setRepInput("");
    setRoleplayDone(false);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              Playbook
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              NEPQ-style objection bank. Framework plays plus real objections captured from your calls.
            </p>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            {totals.total} objection{totals.total === 1 ? "" : "s"} in the bank
          </div>
        </div>

        <WinningCallsLibrary />

        {/* Ask the Coach */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.04] to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              Ask the Coach
            </CardTitle>
            <CardDescription>
              NEPQ-grounded suggestions for handling any objection. Answers pull from your team's playbook.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
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
                className="flex-1"
                disabled={askLoading}
              />
              <Button onClick={runAsk} disabled={askLoading || !askQuestion.trim()}>
                {askLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}
              </Button>
              <Button
                variant="outline"
                onClick={() => openRoleplay(askQuestion.trim() || "")}
                disabled={roleplayLoading}
              >
                <MessageSquareText className="h-4 w-4 mr-2" />
                Roleplay
              </Button>
            </div>

            {askLoading && (
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Coach is thinking…
              </div>
            )}

            {askAnswer && !askLoading && (
              <div className="space-y-3">
                <div className="rounded-md border border-primary/30 bg-background p-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3" /> Suggested NEPQ reply
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{askAnswer}</p>
                </div>
                {askMatched.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Grounded in {askMatched.length} objection{askMatched.length === 1 ? "" : "s"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {askMatched.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs flex items-center gap-2"
                        >
                          <Badge variant="outline" className={cn("text-[9px] uppercase", CATEGORY_STYLES[m.category])}>
                            {m.category}
                          </Badge>
                          <span className="truncate max-w-[280px]">{m.objection_text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search objections or responses…"
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const count = c.key === "all" ? totals.total : totals.byCat[c.key] ?? 0;
                const active = activeCategory === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setActiveCategory(c.key)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted",
                    )}
                  >
                    {c.label}
                    <span className={cn("ml-1.5 font-mono text-[10px]", active ? "opacity-80" : "opacity-60")}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg border border-border bg-muted/40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No objections match your search yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map((row) => {
              const responses = row.example_responses ?? [];
              const bookedPct =
                row.times_seen > 0 && row.source === "call"
                  ? Math.round((row.booked_count / row.times_seen) * 100)
                  : null;
              return (
                <Card key={row.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base leading-snug">{row.objection_text}</CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider", CATEGORY_STYLES[row.category])}>
                            {row.category}
                          </Badge>
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                            {row.source === "framework" ? (
                              <><Sparkles className="h-3 w-3" /> Framework</>
                            ) : (
                              <><Radio className="h-3 w-3" /> From calls · seen {row.times_seen}×</>
                            )}
                          </span>
                          {bookedPct !== null && (
                            <span className="text-[11px] font-mono text-emerald-700">
                              Booked {bookedPct}% of the time
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => openRoleplay(row.objection_text)}
                      >
                        <MessageSquareText className="h-3 w-3 mr-1.5" />
                        Roleplay
                      </Button>
                    </div>
                  </CardHeader>
                  {responses.length > 0 && (
                    <CardContent className="pt-0">
                      <Accordion type="single" collapsible>
                        <AccordionItem value="responses" className="border-none">
                          <AccordionTrigger className="py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:no-underline">
                            {responses.length} example response{responses.length === 1 ? "" : "s"}
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 pt-2">
                            {responses.map((r, i) => (
                              <div
                                key={i}
                                className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed"
                              >
                                <p>{r.response}</p>
                                {r.source && (
                                  <p className="mt-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                    {r.source === "framework" ? "Framework" : "From a real call"}
                                  </p>
                                )}
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Roleplay dialog */}
      <Dialog open={roleplayOpen} onOpenChange={setRoleplayOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              Roleplay
            </DialogTitle>
            <DialogDescription>
              Practice against a realistic prospect holding this objection. The coach grades each reply.
            </DialogDescription>
          </DialogHeader>

          {!roleplayStarted ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Objection to roleplay
                </label>
                <Textarea
                  value={roleplayObjection}
                  onChange={(e) => setRoleplayObjection(e.target.value)}
                  placeholder='e.g. "We already have an agency"'
                  className="mt-1.5 min-h-[80px]"
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={startRoleplay} disabled={!roleplayObjection.trim() || roleplayLoading}>
                  {roleplayLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Start roleplay
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-xs">
                <span className="font-mono uppercase tracking-wider text-muted-foreground">Objection:</span>{" "}
                <span className="italic">"{roleplayObjection}"</span>
              </div>

              <ScrollArea className="h-[360px] rounded-md border border-border bg-background p-3">
                <div className="space-y-3">
                  {roleplayHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex flex-col gap-1",
                        msg.role === "rep" ? "items-end" : "items-start",
                      )}
                    >
                      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        {msg.role === "rep" ? "You (rep)" : "Prospect"}
                      </div>
                      <div
                        className={cn(
                          "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                          msg.role === "rep"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground border border-border",
                        )}
                      >
                        {msg.text}
                      </div>
                      {msg.role === "prospect" && msg.coaching_note && (
                        <div className="max-w-[85%] rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-800 leading-snug">
                          <span className="font-mono uppercase tracking-wider text-[9px] mr-1">Coach:</span>
                          {msg.coaching_note}
                        </div>
                      )}
                    </div>
                  ))}
                  {roleplayLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Prospect is thinking…
                    </div>
                  )}
                  {roleplayDone && (
                    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      They're coming around — the prospect agreed to a next step. Nice work.
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Textarea
                  value={repInput}
                  onChange={(e) => setRepInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendRepReply();
                    }
                  }}
                  placeholder={roleplayDone ? "Roleplay complete — reset to try another." : "Type your reply as the rep… (Enter to send)"}
                  className="min-h-[60px] resize-none"
                  disabled={roleplayLoading || roleplayDone}
                />
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={sendRepReply}
                    disabled={roleplayLoading || roleplayDone || !repInput.trim()}
                    size="icon"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={resetRoleplay} title="Reset">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}