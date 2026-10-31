import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Headphones, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ListenButton } from "@/components/calls/ListenButton";
import { getOutcomeReasonLabel } from "@/lib/appointments";
import { SHOWED_BUCKETS, hasRecording, hasSetAudio, useCallLibrary, type LibraryBucket, type LibraryCall } from "@/hooks/useCallLibrary";
import { cn } from "@/lib/utils";

/** Ben's first day. Everything the setter can learn from starts here. */
const LIBRARY_SINCE = "2026-09-27T14:00:00.000Z";

type Filter = "showed" | "closed" | "verbal" | "no_close" | "dq" | "second_meeting" | "no_show" | "cancelled" | "all";

const FILTERS: Array<{ key: Filter; label: string; hint: string }> = [
  { key: "showed", label: "Showed", hint: "every sitting: the set worked" },
  { key: "closed", label: "Closed", hint: "sat and signed" },
  { key: "verbal", label: "Verbal", hint: "sat, said yes, not signed" },
  { key: "no_close", label: "No close", hint: "sat, pitched, no" },
  { key: "dq", label: "DQ", hint: "sat, not a fit" },
  { key: "second_meeting", label: "2nd booked", hint: "sat, discovery only" },
  { key: "no_show", label: "No-show", hint: "the set did not hold" },
  { key: "cancelled", label: "Cancelled", hint: "pulled out before the slot" },
  { key: "all", label: "All", hint: "every booked slot with a recording" },
];

const BUCKET_STYLE: Record<LibraryBucket, { label: string; className: string }> = {
  closed: { label: "Closed", className: "border-emerald-500/50 text-emerald-700 dark:text-emerald-300" },
  verbal: { label: "Verbal", className: "border-sky-500/50 text-sky-700 dark:text-sky-300" },
  no_close: { label: "No close", className: "border-border text-foreground" },
  dq: { label: "DQ", className: "border-violet-500/50 text-violet-700 dark:text-violet-300" },
  second_meeting: { label: "2nd booked", className: "border-border text-foreground" },
  no_show: { label: "No-show", className: "border-amber-500/50 text-amber-700 dark:text-amber-300" },
  cancelled: { label: "Cancelled", className: "border-destructive/50 text-destructive" },
  pending: { label: "No outcome", className: "border-border text-muted-foreground" },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const fmtMins = (s: number | null) => (s == null ? null : `${Math.max(1, Math.round(s / 60))} min`);
const money = (n: number | null) => (n == null ? null : `$${Math.round(n).toLocaleString("en-AU")}`);

function matches(call: LibraryCall, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "showed") return SHOWED_BUCKETS.has(call.bucket);
  return call.bucket === filter;
}

function CallRow({ call }: { call: LibraryCall }) {
  const [open, setOpen] = useState(false);
  const transcript = call.setting?.transcript ?? null;
  const summary = call.setting?.summary ?? null;
  const style = BUCKET_STYLE[call.bucket];
  const reason = getOutcomeReasonLabel(call.outcomeReason);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <Badge variant="outline" className={cn("shrink-0 text-[10px]", style.className)}>
          {style.label}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {call.businessName}
            {call.contactPerson ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{call.contactPerson}</span> : null}
            {call.state ? <span className="ml-1.5 text-[10px] text-muted-foreground">{call.state}</span> : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {call.isFollowUp ? "Second meeting " : "Met "}
            {fmtDate(call.metAt)}
            {call.mrr ? ` · ${money(call.mrr)}/mo` : ""}
            {call.dealValue ? ` · ${money(call.dealValue)} one-off` : ""}
            {reason ? ` · ${reason}` : ""}
            {call.daysOut != null ? ` · set ${call.daysOut} day${call.daysOut === 1 ? "" : "s"} out` : ""}
            {call.rescheduleCount > 0 ? ` · moved ${call.rescheduleCount}×` : ""}
            {call.setterName ? ` · set by ${call.setterName}` : ""}
            {call.closerName && call.closerName !== call.setterName ? ` · closer ${call.closerName}` : ""}
            {call.isQualified === true ? " · qualified" : call.isQualified === false ? " · not qualified" : ""}
          </p>
        </div>

        {call.setting?.dialpadCallId && hasSetAudio(call) ? (
          <ListenButton dialpadCallId={call.setting.dialpadCallId} className="shrink-0" />
        ) : (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal text-muted-foreground">
            No set audio
          </Badge>
        )}

        {call.meetingRecordingUrl ? (
          <Button asChild size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs">
            <a href={call.meetingRecordingUrl} target="_blank" rel="noopener noreferrer">
              <Video className="h-3.5 w-3.5" />
              {call.meetingRecordingSource === "fathom" ? "Fathom" : "Recording"}
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        ) : SHOWED_BUCKETS.has(call.bucket) ? (
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal text-muted-foreground">
            No meeting recording
          </Badge>
        ) : null}

        {transcript || summary ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-primary hover:bg-muted"
          >
            <FileText className="h-3.5 w-3.5" />
            {transcript ? "Transcript" : "Summary"}
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-2 border-t border-border p-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            The booking call{call.setting?.talkSeconds ? ` · ${fmtMins(call.setting.talkSeconds)}` : ""}
            {call.setting?.calledAt ? ` · ${fmtDate(call.setting.calledAt)}` : ""}
          </p>
          {summary ? <p className="whitespace-pre-line text-xs text-foreground">{summary}</p> : null}
          {transcript ? (
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
              {transcript}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Every booked slot since Ben started that has something to hear: the cold call that
 * set it, the meeting recording, or both. Filter by how the slot ended and compare: the
 * sets that held against the sets that didn't, the sittings that closed against the ones
 * that were disqualified. Slots with neither recording are hidden (Bede, 31 Oct 2026) and
 * counted, so a bucket that looks thin is visibly thin rather than silently trimmed.
 */
export function CallLibrary() {
  const { data: calls = [], isLoading } = useCallLibrary(LIBRARY_SINCE);
  const [filter, setFilter] = useState<Filter>("showed");
  const [setter, setSetter] = useState<string>("all");

  const recorded = useMemo(() => calls.filter(hasRecording), [calls]);
  const setters = useMemo(() => [...new Set(recorded.map((c) => c.setterName).filter((n): n is string => Boolean(n)))].sort(), [recorded]);
  const bySetter = (c: LibraryCall) => setter === "all" || c.setterName === setter;
  const counts = useMemo(() => {
    const map = new Map<Filter, number>();
    for (const f of FILTERS) map.set(f.key, recorded.filter((c) => matches(c, f.key) && bySetter(c)).length);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorded, setter]);
  const visible = useMemo(
    () => recorded.filter((c) => matches(c, filter) && bySetter(c)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recorded, filter, setter],
  );
  /** Slots in this bucket with nothing to hear, so the rep knows what is not on the list. */
  const hidden = useMemo(
    () => calls.filter((c) => !hasRecording(c) && matches(c, filter) && bySetter(c)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [calls, filter, setter],
  );
  const coverage = useMemo(() => {
    const withSet = visible.filter(hasSetAudio).length;
    const withMeeting = visible.filter((c) => c.meetingRecordingUrl).length;
    return { withSet, withMeeting };
  }, [visible]);
  const hiddenNote = hidden > 0 ? `${hidden} slot${hidden === 1 ? "" : "s"} without any recording hidden` : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Headphones className="h-4 w-4 text-primary" />
          Call library
        </CardTitle>
        <CardDescription className="text-xs">
          Every booked slot since 28 Sep with something to hear: the cold call that set it, the meeting recording, or
          both. Flip between Showed and No-show to hear what a set that holds sounds like against one that doesn't, then
          between Closed and DQ to hear the difference in the sitting.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" size="sm" value={filter} onValueChange={(v) => v && setFilter(v as Filter)} className="flex-wrap justify-start">
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.key} value={f.key} title={f.hint} className="h-7 gap-1 px-2 text-xs">
                {f.label}
                <span className="font-mono text-[10px] text-muted-foreground">{counts.get(f.key) ?? 0}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {setters.length > 1 ? (
            <ToggleGroup type="single" size="sm" value={setter} onValueChange={(v) => v && setSetter(v)} className="ml-auto">
              <ToggleGroupItem value="all" className="h-7 px-2 text-xs">All setters</ToggleGroupItem>
              {setters.map((s) => (
                <ToggleGroupItem key={s} value={s} className="h-7 px-2 text-xs">{s}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
        </div>

        {isLoading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {hiddenNote ? `Nothing with a recording in this bucket yet. ${hiddenNote}.` : "Nothing in this bucket yet."}
          </p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              {visible.length} slot{visible.length === 1 ? "" : "s"} · {coverage.withSet} with the booking call · {coverage.withMeeting} with the meeting recording
              {hiddenNote ? ` · ${hiddenNote}` : ""}.
            </p>
            <div className="space-y-2">
              {visible.map((c) => (
                <CallRow key={c.pipelineItemId} call={c} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
