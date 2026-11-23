import { useState } from "react";
import { ChevronDown, ExternalLink, FileText, Headphones, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListenButton } from "@/components/calls/ListenButton";
import { useRepProfiles } from "@/hooks/useManager";
import { useCallTranscript, type LoomReviewCall } from "@/hooks/useLoomReviews";
import { fmtDay, fmtTalk } from "@/lib/loom";
import { cn } from "@/lib/utils";

function ReviewedCall({ call, repName }: { call: LoomReviewCall; repName: string | null }) {
  const [open, setOpen] = useState(false);
  const { data: transcript, isLoading, isError } = useCallTranscript(call.callLogId, open);

  if (!call.callLogId) {
    return (
      <div className="space-y-1 rounded-lg border border-border bg-card p-3">
        <a href={call.url ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline-offset-2 hover:underline">
          <Link2 className="h-4 w-4" /> {call.label || "Recording"} <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {call.note && <p className="text-xs text-muted-foreground">{call.note}</p>}
      </div>
    );
  }

  const meta = [repName, fmtDay(call.calledAt), fmtTalk(call.talk)].filter(Boolean).join(" · ");
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{call.business ?? "Unknown business"}</p>
          <p className="text-[11px] text-muted-foreground">{meta}</p>
        </div>
        {call.outcome && <Badge variant={call.outcome === "booked" ? "default" : "secondary"} className="text-[10px]">{call.outcome.replace(/_/g, " ")}</Badge>}
      </div>
      {call.note && <p className="text-xs text-foreground"><span className="font-medium text-primary">Listen for: </span>{call.note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {call.dialpadCallId
          ? <ListenButton dialpadCallId={call.dialpadCallId} className="flex flex-wrap items-center gap-2" />
          : <span className="text-[11px] text-muted-foreground">No recording linked to this call.</span>}
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-muted">
          <FileText className="h-3.5 w-3.5" /> Transcript <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
          {isLoading ? "Loading…" : isError ? "Couldn't load the transcript." : transcript ?? "No transcript for this call yet."}
        </pre>
      )}
    </div>
  );
}

/** The calls a Loom review talks about, playable next to the video. */
export function ReviewedCalls({ calls }: { calls: LoomReviewCall[] }) {
  const { data: reps = [] } = useRepProfiles();
  if (calls.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
        <Headphones className="h-4 w-4 text-primary" /> {calls.length === 1 ? "The call in this review" : `The ${calls.length} calls in this review`}
      </p>
      <div className="space-y-2">
        {calls.map((c) => <ReviewedCall key={c.id} call={c} repName={reps.find((r) => r.user_id === c.repUserId)?.name ?? null} />)}
      </div>
    </div>
  );
}
