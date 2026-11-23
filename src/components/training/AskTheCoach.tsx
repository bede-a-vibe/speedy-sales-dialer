import { useState } from "react";
import { Sparkles, Wand2, MessageSquareText, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { OBJECTION_CATEGORY_STYLES as CATEGORY_STYLES } from "@/components/training/ObjectionBankPanel";

export function AskTheCoach({ onRoleplay }: { onRoleplay: (q: string) => void }) {
  const { toast } = useToast();
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askMatched, setAskMatched] = useState<Array<{ id: string; objection_text: string; category: string }>>([]);

  async function runAsk() {
    const q = askQuestion.trim();
    if (!q || askLoading) return;
    setAskLoading(true); setAskAnswer(null); setAskMatched([]);
    try {
      const { data: result, error } = await supabase.functions.invoke("coach-assistant", { body: { mode: "ask", question: q } });
      if (error) throw error;
      if ((result as { error?: string })?.error) throw new Error((result as { error?: string }).error);
      setAskAnswer((result as { answer?: string })?.answer ?? "");
      setAskMatched((result as { matched_objections?: typeof askMatched })?.matched_objections ?? []);
    } catch (err) {
      toast({ title: "Coach unavailable", description: err instanceof Error ? err.message : "Something went wrong asking the coach.", variant: "destructive" });
    } finally { setAskLoading(false); }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.04] to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Wand2 className="h-4 w-4 text-primary" /> Ask the Coach</CardTitle>
        <CardDescription>Stuck on something that isn't in a course? Answers are grounded in the team's own objection bank.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input value={askQuestion} onChange={(e) => setAskQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runAsk(); } }}
            placeholder='How do I handle "we already have an agency"?' className="min-w-[200px] flex-1" disabled={askLoading} />
          <Button onClick={runAsk} disabled={askLoading || !askQuestion.trim()}>{askLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ask"}</Button>
          <Button variant="outline" onClick={() => onRoleplay(askQuestion.trim() || "")}><MessageSquareText className="mr-2 h-4 w-4" /> Roleplay</Button>
        </div>
        {askLoading && <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Coach is thinking…</div>}
        {askAnswer && !askLoading && (
          <div className="space-y-3">
            <div className="rounded-md border border-primary/30 bg-background p-4">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-primary"><Sparkles className="h-3 w-3" /> Suggested reply</div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{askAnswer}</p>
            </div>
            {askMatched.length > 0 && (
              <div>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Grounded in {askMatched.length} objection{askMatched.length === 1 ? "" : "s"}</div>
                <div className="flex flex-wrap gap-2">
                  {askMatched.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
                      <Badge variant="outline" className={cn("text-[9px] uppercase", CATEGORY_STYLES[m.category])}>{m.category}</Badge>
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
