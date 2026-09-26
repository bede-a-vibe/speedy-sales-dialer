import { useState } from "react";
import { CheckCircle2, ClipboardPen, Loader2, Lock, Send, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useMySelfReviewableCalls, useSaveSelfReview, type SelfReviewableCall } from "@/hooks/useManager";
import { cn } from "@/lib/utils";

/**
 * A rep reviews their own calls and sends them up.
 *
 * One record per call holds both halves: the rep's self-review and the
 * manager's. A database trigger makes the manager's fields immutable to the
 * rep and locks the self-review once submitted, so this component can be
 * straightforward about what it writes.
 */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "border-border bg-muted/50 text-muted-foreground" },
  submitted: { label: "With your manager", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  reviewed: { label: "Reviewed", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
};

function Stars({ value, onChange, readOnly }: { value: number; onChange?: (n: number) => void; readOnly?: boolean }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={cn("rounded p-0.5", !readOnly && "hover:scale-110 transition-transform")}
          aria-label={`${n} out of 5`}
        >
          <Star className={n <= value ? "h-4 w-4 fill-primary text-primary" : "h-4 w-4 text-muted-foreground/30"} />
        </button>
      ))}
    </span>
  );
}

function CallRow({ call }: { call: SelfReviewableCall }) {
  const { toast } = useToast();
  const save = useSaveSelfReview();
  const review = call.review;
  const status = review?.status ?? "none";
  const locked = status === "submitted" || status === "reviewed";

  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(review?.self_score ?? 0);
  const [wentWell, setWentWell] = useState(review?.self_went_well ?? "");
  const [improve, setImprove] = useState(review?.self_improve ?? "");

  const when = new Date(call.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  const mins = call.talk ? `${Math.round(call.talk / 60)}m` : "—";

  async function persist(submit: boolean) {
    if (score < 1) {
      toast({ title: "Give it a score first", description: "One to five, your honest read.", variant: "destructive" });
      return;
    }
    try {
      await save.mutateAsync({
        call_log_id: call.id,
        existing_id: review?.id ?? null,
        self_score: score,
        self_went_well: wentWell,
        self_improve: improve,
        submit,
      });
      toast({
        title: submit ? "Sent to your manager" : "Saved as a draft",
        description: submit ? "You can't edit it now, but you'll see the feedback here when it comes back." : "Come back and submit it when you're ready.",
      });
      if (submit) setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Try again in a moment.";
      toast({ title: "Couldn't save that", description: msg, variant: "destructive" });
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
      >
        <span className="text-sm font-medium">{call.business ?? "Unknown business"}</span>
        {call.outcome === "booked" && (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[9px] uppercase text-emerald-700 dark:text-emerald-300">
            booked
          </Badge>
        )}
        {status !== "none" && (
          <Badge variant="outline" className={cn("font-mono text-[9px] uppercase", STATUS_META[status]?.cls)}>
            {STATUS_META[status]?.label}
          </Badge>
        )}
        {review?.score && !review.seen_at && (
          <Badge className="bg-primary font-mono text-[9px] uppercase text-primary-foreground">new feedback</Badge>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{when} · {mins}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-3">
          {locked ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {status === "submitted" ? "Submitted and locked. Waiting on your manager." : "Reviewed."}
                </span>
                <span className="ml-auto"><Stars value={review?.self_score ?? 0} readOnly /></span>
              </div>
              {review?.self_went_well && (
                <p className="text-sm"><span className="font-medium text-emerald-700 dark:text-emerald-300">You said went well: </span>{review.self_went_well}</p>
              )}
              {review?.self_improve && (
                <p className="text-sm"><span className="font-medium text-primary">You said to fix: </span>{review.self_improve}</p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Your score</span>
                <Stars value={score} onChange={setScore} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">What went well?</label>
                <Textarea value={wentWell} onChange={(e) => setWentWell(e.target.value)} rows={2} placeholder="Be specific — which line, which moment." />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">What would you do differently?</label>
                <Textarea value={improve} onChange={(e) => setImprove(e.target.value)} rows={2} placeholder="The one thing you'd change, not five." />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => persist(false)}>
                  {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Save draft
                </Button>
                <Button size="sm" disabled={save.isPending} onClick={() => persist(true)}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Submit to manager
                </Button>
              </div>
            </>
          )}

          {review?.score != null && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="mb-1 flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">Your manager's review</span>
                <span className="ml-auto"><Stars value={review.score} readOnly /></span>
              </div>
              {review.went_well && (
                <p className="text-sm"><span className="font-medium text-emerald-700 dark:text-emerald-300">Went well: </span>{review.went_well}</p>
              )}
              {review.improve && (
                <p className="mt-1 text-sm"><span className="font-medium text-primary">Fix next call: </span>{review.improve}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SelfReviewPanel() {
  const { user } = useAuth();
  const { data: calls = [], isLoading } = useMySelfReviewableCalls(user?.id);

  const pending = calls.filter((c) => !c.review || c.review.status === "draft").length;
  const awaiting = calls.filter((c) => c.review?.status === "submitted").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <ClipboardPen className="h-5 w-5 text-primary" />
          Review your own calls
          {pending > 0 && <Badge variant="outline" className="border-border font-mono text-[10px]">{pending} to do</Badge>}
          {awaiting > 0 && (
            <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 font-mono text-[10px] text-sky-700 dark:text-sky-300">
              {awaiting} with your manager
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Your booked calls and any real conversation over a minute, from the last fortnight. Score it honestly, say
          what you'd change, then send it up. Reviewing your own call before anyone else does is the single fastest way
          to get better at this.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your calls…
          </div>
        ) : calls.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing to review yet. Booked calls and conversations over a minute will show up here.
          </p>
        ) : (
          <div className="space-y-2">
            {calls.map((c) => <CallRow key={c.id} call={c} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
