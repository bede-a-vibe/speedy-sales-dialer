import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, Loader2, Send, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

/** One-tap brush-off buttons → the agree-reduce-redirect line + follow-up, instantly. */
const BRUSH_OFFS: { key: string; label: string; match: RegExp }[] = [
  { key: "not_interested", label: "Not interested", match: /not interested/i },
  { key: "too_busy", label: "On the tools", match: /too busy|bad time/i },
  { key: "has_agency", label: "Got someone", match: /already have an agency|referrals/i },
  { key: "send_email", label: "Send an email", match: /send me an email/i },
  { key: "price", label: "How much?", match: /how much does it cost/i },
  { key: "gatekeeper", label: "Gatekeeper", match: /gatekeeper.*owner not around|office manager answers/i },
];

interface BankRow {
  objection_text: string;
  example_responses: Array<{ response: string; source?: string }> | null;
}

function useBrushOffLines() {
  return useQuery({
    queryKey: ["live-coach-brushoffs"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("objection_bank")
        .select("objection_text, example_responses")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as BankRow[];
    },
  });
}

/**
 * Live, in-call coaching. Two speeds:
 * - Brush-off buttons: zero-latency lines from the objection bank (the
 *   agree-reduce-redirect + follow-up pair) the moment the prospect says it.
 * - Ask box: free-text "they said…" → NEPQ-grounded suggestion in ~2s, usable
 *   while the prospect is talking.
 */
export function LiveCoachPanel() {
  const { data: bank = [] } = useBrushOffLines();
  const [active, setActive] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const linesFor = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const b of BRUSH_OFFS) {
      const row = bank.find((r) => b.match.test(r.objection_text));
      if (!row) continue;
      const responses = (row.example_responses ?? []).map((r) => r.response).filter(Boolean);
      // Prefer the field-tested Aussie lines (appended last), fall back to the rest.
      const preferred = (row.example_responses ?? [])
        .filter((r) => r.source === "matt_ryder_ai")
        .map((r) => r.response);
      map.set(b.key, (preferred.length ? preferred : responses).slice(0, 3));
    }
    return map;
  }, [bank]);

  async function ask() {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const { data, error } = await supabase.functions.invoke("coach-assistant", {
        body: { mode: "ask", question: `On a live cold call the prospect just said: "${q}". Give me ONE short thing to say next (2 sentences max), agree-reduce-redirect style, casual Aussie register.` },
      });
      if (error) throw error;
      setAnswer(((data as any)?.answer ?? "").toString());
    } catch {
      setAnswer("Coach unavailable — use the brush-off buttons above.");
    } finally {
      setAsking(false);
    }
  }

  const activeLines = active ? linesFor.get(active) ?? [] : [];

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/[0.03] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-primary">
        <Brain className="h-3.5 w-3.5" /> Live coach — they said…
      </p>
      <div className="flex flex-wrap gap-1.5">
        {BRUSH_OFFS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setActive(active === b.key ? null : b.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              active === b.key
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      {active && activeLines.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {activeLines.map((line, i) => (
            <p key={i} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-1.5">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              ask();
            }
          }}
          placeholder="Or type what they said…"
          className="h-8 border-border bg-background text-xs"
        />
        <button
          type="button"
          onClick={ask}
          disabled={asking || !question.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary disabled:opacity-40"
        >
          {asking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>
      {answer && (
        <div className="mt-1.5 flex items-start gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5">
          <p className="flex-1 text-xs leading-relaxed">{answer}</p>
          <button type="button" onClick={() => setAnswer(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
