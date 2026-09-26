import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Sparkles, Wand2, MessageSquareText, Loader2 } from "lucide-react";
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
import { useObjectionBank } from "@/hooks/useCallLearnings";

export default function PlaybookPage() {
  const { toast } = useToast();

  // Ask state
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askMatched, setAskMatched] = useState<Array<{ id: string; objection_text: string; category: string }>>([]);

  // Roleplay state — round mechanics live inside RoleplayTrainer.
  const [roleplayOpen, setRoleplayOpen] = useState(false);
  const [roleplayObjection, setRoleplayObjection] = useState("");

  const { data: bankRows } = useObjectionBank();
  const totalObjections = bankRows?.length ?? 0;

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
    setRoleplayOpen(true);
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
            {totalObjections} objection{totalObjections === 1 ? "" : "s"} in the bank
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

        <ObjectionBankPanel onRoleplay={openRoleplay} />
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