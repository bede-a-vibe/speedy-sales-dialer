import { useMemo, useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useRepProfiles, useReviewQueue, useSaveReview, type ReviewableCall } from "@/hooks/useManager";

const fmtTalk = (s: number | null) => (s ? `${Math.floor(s / 60)}m ${s % 60}s` : "—");

export function CallReviewQueue() {
  const { data, isLoading } = useReviewQueue();
  const { data: reps = [] } = useRepProfiles();
  const [rep, setRep] = useState("all");
  const [view, setView] = useState<"todo" | "done">("todo");
  const [open, setOpen] = useState<ReviewableCall | null>(null);

  const nameOf = (id: string) => reps.find((r) => r.user_id === id)?.name ?? "Unknown";
  const reviewed = useMemo(() => new Map((data?.reviews ?? []).map((r) => [r.call_log_id, r])), [data]);
  const list = (data?.calls ?? [])
    .filter((c) => rep === "all" || c.user_id === rep)
    .filter((c) => (view === "todo" ? !reviewed.has(c.id) : reviewed.has(c.id)));

  const weekAgo = Date.now() - 7 * 86_400_000;
  const perRep = reps.map((r) => ({
    ...r,
    count: (data?.reviews ?? []).filter((x) => x.rep_user_id === r.user_id && new Date(x.created_at).getTime() >= weekAgo).length,
  })).filter((r) => (data?.calls ?? []).some((c) => c.user_id === r.user_id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {perRep.map((r) => (
          <div key={r.user_id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <span className="font-medium">{r.name}</span>
            <span className="ml-2 font-mono text-muted-foreground">{r.count} reviewed this week</span>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Call review</CardTitle>
              <CardDescription>Booked calls and conversations over 60 seconds from the last 14 days. Reps see your score and notes on their Training page.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={rep} onValueChange={setRep}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reps</SelectItem>
                  {reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant={view === "todo" ? "default" : "outline"} onClick={() => setView("todo")}>To review</Button>
              <Button size="sm" variant={view === "done" ? "default" : "outline"} onClick={() => setView("done")}>Reviewed</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
            : list.length === 0 ? <p className="text-xs text-muted-foreground">{view === "todo" ? "Nothing waiting — all caught up." : "No reviews yet."}</p>
            : (
              <div className="divide-y divide-border">
                {list.slice(0, 80).map((c) => {
                  const r = reviewed.get(c.id);
                  return (
                    <button key={c.id} onClick={() => setOpen(c)} className="flex w-full items-center gap-3 py-2.5 text-left text-xs hover:bg-muted/40">
                      <span className="w-24 shrink-0 font-medium">{nameOf(c.user_id)}</span>
                      <span className="min-w-0 flex-1 truncate">{c.business ?? "Unknown business"}</span>
                      <Badge variant={c.outcome === "booked" ? "default" : "secondary"} className="text-[10px]">{c.outcome.replace(/_/g, " ")}</Badge>
                      <span className="w-16 font-mono text-muted-foreground">{fmtTalk(c.talk)}</span>
                      <span className="w-20 text-muted-foreground">{new Date(c.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                      {!c.transcript && <span className="text-[10px] text-muted-foreground">no transcript</span>}
                      {r && <span className="flex items-center gap-1 font-mono text-primary"><Star className="h-3 w-3 fill-current" />{r.score}</span>}
                    </button>
                  );
                })}
              </div>
            )}
        </CardContent>
      </Card>

      {open && (
        <ReviewDialog call={open} repName={nameOf(open.user_id)} existing={reviewed.get(open.id)} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}

function ReviewDialog({ call, repName, existing, onClose }: {
  call: ReviewableCall; repName: string; existing?: { score: number; went_well: string | null; improve: string | null; stage_problem_solution?: boolean | null; stage_solution_commit?: boolean | null }; onClose: () => void;
}) {
  const [score, setScore] = useState(existing?.score ?? 0);
  const [wentWell, setWentWell] = useState(existing?.went_well ?? "");
  const [improve, setImprove] = useState(existing?.improve ?? "");
  const [ps, setPs] = useState<boolean | null>(existing?.stage_problem_solution ?? null);
  const [sc, setSc] = useState<boolean | null>(existing?.stage_solution_commit ?? null);
  const save = useSaveReview();
  const { toast } = useToast();

  const submit = async () => {
    try {
      await save.mutateAsync({ call_log_id: call.id, rep_user_id: call.user_id, score, went_well: wentWell, improve, stage_problem_solution: ps, stage_solution_commit: sc });
      toast({ title: "Review saved", description: `${repName} will see it on their Training page.` });
      onClose();
    } catch (e: any) {
      toast({ title: "Couldn't save review", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{repName} — {call.business ?? "Unknown business"}</DialogTitle>
          <p className="text-xs text-muted-foreground">{call.outcome.replace(/_/g, " ")} · {fmtTalk(call.talk)} · {new Date(call.created_at).toLocaleString("en-AU")}</p>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="max-h-[55vh] space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">
            {call.summary && <p><span className="font-medium">Summary: </span>{call.summary}</p>}
            {call.notes && <p><span className="font-medium">Rep notes: </span>{call.notes}</p>}
            <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{call.transcript ?? "No transcript for this call yet."}</p>
          </div>
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-medium">Score</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setScore(n)} aria-label={`${n} stars`}>
                    <Star className={cn("h-6 w-6", n <= score ? "fill-primary text-primary" : "text-muted-foreground/40")} />
                  </button>
                ))}
              </div>
            </div>
            {([["Problem found → solution presented", ps, setPs], ["Solution → commitment", sc, setSc]] as const).map(([label, v, set]) => (
              <div key={label} className="flex items-center justify-between gap-2 text-xs">
                <span>{label}</span>
                <div className="flex gap-1">
                  {([["Yes", true], ["No", false], ["AI", null]] as const).map(([l, val]) => (
                    <Button key={l} type="button" size="sm" variant={v === val ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => set(val as boolean | null)}>{l}</Button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="mb-1.5 text-xs font-medium">What went well</p>
              <Textarea value={wentWell} onChange={(e) => setWentWell(e.target.value)} rows={4} />
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium">One thing to fix next call</p>
              <Textarea value={improve} onChange={(e) => setImprove(e.target.value)} rows={4} />
            </div>
            <Button className="w-full" disabled={score === 0 || save.isPending} onClick={submit}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> {existing ? "Update review" : "Mark reviewed"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
