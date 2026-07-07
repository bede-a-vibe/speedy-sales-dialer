import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search, Sparkles, Radio } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
    </AppLayout>
  );
}