import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ChevronDown, Circle, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { LoomPlayer } from "@/components/loom/LoomPlayer";
import { ReviewedCalls } from "@/components/loom/ReviewedCalls";
import { Notes } from "@/components/playbook/Classroom";
import { useMyLoomReviews, useStampLoomReview, type LoomReview } from "@/hooks/useLoomReviews";
import { useRepProfiles } from "@/hooks/useManager";
import { fmtDay, fmtLoomLength } from "@/lib/loom";
import { cn } from "@/lib/utils";

function ReviewItem({ review, from, startOpen }: { review: LoomReview; from: string | null; startOpen: boolean }) {
  const { toast } = useToast();
  const { mutate, isPending } = useStampLoomReview();
  const [open, setOpen] = useState(startOpen);
  const ref = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  // A manager reads every recipient row, so pick out their own.
  const mine = review.recipients.find((r) => r.userId === user?.id);
  const unseen = !!mine && !mine.seenAt;
  const watched = !!mine?.watchedAt;

  useEffect(() => { if (startOpen) ref.current?.scrollIntoView({ block: "start" }); }, [startOpen]);
  useEffect(() => { if (open && unseen) mutate({ reviewId: review.id, seen: true }); }, [open, unseen, review.id, mutate]);

  const meta = [from && `from ${from}`, fmtDay(review.createdAt), fmtLoomLength(review.duration), review.calls.length ? `${review.calls.length} call${review.calls.length === 1 ? "" : "s"} attached` : null]
    .filter(Boolean).join(" · ");
  return (
    <div ref={ref} className="rounded-lg border border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        <Video className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{review.title}</span>
          <span className="block text-[11px] text-muted-foreground">{meta}</span>
        </span>
        {unseen && <Badge className="text-[10px]">New</Badge>}
        {watched && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Watched" />}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-3">
          <LoomPlayer url={review.loomUrl} title={review.title} />
          {review.notes && <Notes text={review.notes} />}
          <ReviewedCalls calls={review.calls} />
          <Button size="sm" variant={watched ? "outline" : "default"} disabled={isPending}
            onClick={() => mutate({ reviewId: review.id, watched: !watched }, {
              onError: () => toast({ title: "Couldn't save that", description: "Try again in a moment.", variant: "destructive" }),
            })}>
            {watched ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> Watched — undo</> : <><Circle className="mr-1.5 h-3.5 w-3.5" /> Mark as watched</>}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Loom reviews a manager sent to this rep. Renders nothing until there is one. /training?loom=<id> opens it. */
export function MyLoomReviews() {
  const [params] = useSearchParams();
  const { data: reviews = [] } = useMyLoomReviews();
  const { data: reps = [] } = useRepProfiles();
  const target = params.get("loom");
  const [showAll, setShowAll] = useState(false);
  if (reviews.length === 0) return null;
  const visible = showAll ? reviews : reviews.filter((r, i) => i < 5 || r.id === target);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Video className="h-5 w-5 text-primary" /> Loom reviews for you</CardTitle>
        <CardDescription>Watch it, then listen to the calls it talks about. They're attached underneath.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((r) => (
          <ReviewItem key={r.id} review={r} from={reps.find((p) => p.user_id === r.createdBy)?.name ?? null} startOpen={r.id === target} />
        ))}
        {reviews.length > visible.length && <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>Show all {reviews.length}</Button>}
      </CardContent>
    </Card>
  );
}
