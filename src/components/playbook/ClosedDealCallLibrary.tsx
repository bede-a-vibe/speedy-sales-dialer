import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Trophy, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ListenButton } from "@/components/calls/ListenButton";
import { useClosedDealCalls, type ClosedDealCall } from "@/hooks/useClosedDealCalls";
import { cn } from "@/lib/utils";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

const fmtMins = (s: number | null) => (s == null ? null : `${Math.round(s / 60)} min`);

const money = (n: number | null) => (n == null ? null : `$${Math.round(n).toLocaleString("en-AU")}`);

function DealCard({ deal }: { deal: ClosedDealCall }) {
  const [open, setOpen] = useState(false);
  const transcript = deal.setting?.transcript ?? null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <Trophy className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {deal.businessName}
            {deal.state ? <span className="ml-1.5 text-[10px] text-muted-foreground">{deal.state}</span> : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Closed {fmtDate(deal.metAt)}
            {deal.mrr ? ` · ${money(deal.mrr)}/mo` : ""}
            {deal.daysToMeeting != null ? ` · booked ${deal.daysToMeeting} day${deal.daysToMeeting === 1 ? "" : "s"} out` : ""}
            {deal.setting?.setterName ? ` · set by ${deal.setting.setterName}` : ""}
          </p>
        </div>

        {/* The cold call that created the meeting — the bit a setter studies. */}
        {deal.setting?.dialpadCallId ? (
          <ListenButton dialpadCallId={deal.setting.dialpadCallId} className="shrink-0" />
        ) : (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal text-muted-foreground">
            No set audio
          </Badge>
        )}

        {deal.meetingRecordingUrl ? (
          <Button asChild size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs">
            <a href={deal.meetingRecordingUrl} target="_blank" rel="noopener noreferrer">
              <Video className="h-3.5 w-3.5" />
              {deal.meetingRecordingSource === "fathom" ? "Fathom" : "Recording"}
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        ) : (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal text-muted-foreground">
            No meeting recording
          </Badge>
        )}

        {transcript ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5" />
            Transcript
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </button>
        ) : null}
      </div>

      {open && transcript ? (
        <div className="border-t border-border p-3">
          <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            The booking call{deal.setting?.talkSeconds ? ` · ${fmtMins(deal.setting.talkSeconds)}` : ""}
          </p>
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
            {transcript}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Every deal that closed, with the call that booked it and the meeting itself.
 *
 * This is the only library where you can hear a set and then hear the money
 * that came from it. Deals with no recording are still listed, labelled: a
 * library that quietly drops half the closes would teach a setter that the
 * sets we happen to have audio for are the ones that work.
 */
export function ClosedDealCallLibrary() {
  const { data: deals = [], isLoading } = useClosedDealCalls();

  const coverage = useMemo(() => {
    const withSet = deals.filter((d) => d.setting?.dialpadCallId).length;
    const withMeeting = deals.filter((d) => d.meetingRecordingUrl).length;
    const withBoth = deals.filter((d) => d.setting?.dialpadCallId && d.meetingRecordingUrl).length;
    return { withSet, withMeeting, withBoth };
  }, [deals]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Calls that turned into clients
        </CardTitle>
        <CardDescription className="text-xs">
          Every closed deal, with the cold call that booked the meeting and the meeting recording. Start with the
          booking call — that is the part you control.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </>
        ) : deals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No closed deals yet. The first one lands here automatically.
          </p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              {deals.length} closed · {coverage.withSet} with the booking call · {coverage.withMeeting} with the
              meeting · {coverage.withBoth} with both.
            </p>
            {deals.map((d) => (
              <DealCard key={d.pipelineItemId} deal={d} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
