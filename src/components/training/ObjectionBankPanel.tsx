import { useMemo, useState } from "react";
import { Loader2, MessageSquareText, Radio, RefreshCw, Search, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCanViewAdmin } from "@/hooks/useUserRole";
import { useObjectionBank } from "@/hooks/useCallLearnings";
import { cn } from "@/lib/utils";

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

export const OBJECTION_CATEGORY_STYLES: Record<string, string> = {
  logistical: "bg-slate-500/10 text-slate-700 border-slate-500/20",
  fear: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  smokescreen: "bg-violet-500/10 text-violet-700 border-violet-500/20",
  price: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  timing: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  authority: "bg-indigo-500/10 text-indigo-700 border-indigo-500/20",
  competitor: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  other: "bg-muted text-muted-foreground border-border",
};

interface Props {
  /** Called when the rep wants to drill this objection in the roleplay trainer. */
  onRoleplay?: (objection: string) => void;
}

/**
 * The objection bank, shared by the Playbook page and the Training page.
 * Framework plays sit alongside objections mined straight out of call
 * transcripts, ranked by how often they actually come up on the phones.
 */
export function ObjectionBankPanel({ onRoleplay }: Props) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [mining, setMining] = useState(false);
  const { data, isLoading } = useObjectionBank();
  const canViewAdmin = useCanViewAdmin();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const rows = data ?? [];

  const totals = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const r of rows) byCat[r.category] = (byCat[r.category] ?? 0) + 1;
    return { total: rows.length, fromCalls: rows.filter((r) => r.source === "call").length, byCat };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (activeCategory !== "all" && r.category !== activeCategory) return false;
      if (!q) return true;
      if (r.objectionText.toLowerCase().includes(q)) return true;
      return r.responses.some((e) => String(e?.response ?? "").toLowerCase().includes(q));
    });
  }, [rows, activeCategory, query]);

  async function mineFromCalls() {
    if (mining) return;
    setMining(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("coach-assistant", {
        body: { mode: "mine_objections", limit: 8 },
      });
      if (error) throw error;
      if ((result as any)?.error) throw new Error((result as any).error);
      const r = result as any;
      toast({
        title: "Objections pulled from calls",
        description: `${r.calls_scanned} call${r.calls_scanned === 1 ? "" : "s"} read — ${r.objections_created} new, ${r.objections_reinforced} seen again. ${r.remaining} call${r.remaining === 1 ? "" : "s"} still to read.`,
      });
      queryClient.invalidateQueries({ queryKey: ["objection-bank"] });
    } catch (err: any) {
      toast({
        title: "Could not read the calls",
        description: err?.message ?? "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setMining(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-mono text-muted-foreground">
              {totals.total} objection{totals.total === 1 ? "" : "s"} · {totals.fromCalls} pulled from real calls
            </p>
            {canViewAdmin && (
              <Button variant="outline" size="sm" onClick={mineFromCalls} disabled={mining}>
                {mining ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                {mining ? "Reading calls…" : "Pull objections from calls"}
              </Button>
            )}
          </div>
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
                  <span className={cn("ml-1.5 font-mono text-[10px]", active ? "opacity-80" : "opacity-60")}>{count}</span>
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
            const bookedPct =
              row.timesSeen > 0 && row.source === "call" ? Math.round((row.bookedCount / row.timesSeen) * 100) : null;
            return (
              <Card key={row.id} className="overflow-hidden">
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-medium leading-snug text-foreground">{row.objectionText}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider", OBJECTION_CATEGORY_STYLES[row.category])}>
                          {row.category}
                        </Badge>
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
                          {row.source === "framework" ? (
                            <><Sparkles className="h-3 w-3" /> Framework</>
                          ) : (
                            <><Radio className="h-3 w-3" /> From calls · heard {row.timesSeen}×</>
                          )}
                        </span>
                        {bookedPct !== null && (
                          <span className="text-[11px] font-mono text-emerald-700">Booked {bookedPct}% of the time</span>
                        )}
                      </div>
                    </div>
                    {onRoleplay && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onRoleplay(row.objectionText)}>
                        <MessageSquareText className="mr-1.5 h-3 w-3" />
                        Roleplay
                      </Button>
                    )}
                  </div>
                  {row.responses.length > 0 && (
                    <Accordion type="single" collapsible>
                      <AccordionItem value="responses" className="border-none">
                        <AccordionTrigger className="py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:no-underline">
                          {row.responses.length} example response{row.responses.length === 1 ? "" : "s"}
                        </AccordionTrigger>
                        <AccordionContent className="space-y-2 pt-2">
                          {row.responses.map((r, i) => (
                            <div key={i} className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed">
                              <p>{r.response}</p>
                              {r.source && (
                                <p className="mt-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                  {r.source === "framework" ? "Framework" : `From a real ${r.source}`}
                                </p>
                              )}
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
