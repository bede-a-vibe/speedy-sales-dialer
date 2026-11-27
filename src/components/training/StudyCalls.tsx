import { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ExternalLink, Headphones, Loader2, Search, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ListenButton } from "@/components/calls/ListenButton";
import { useToast } from "@/hooks/use-toast";
import { useMyStudyNotes, useSaveStudyNote, useStudyCalls, type StudyCall, type StudyNote } from "@/hooks/useCallStudy";
import { useCallTranscript } from "@/hooks/useLoomReviews";
import { fmtTalk } from "@/lib/loom";
import { cn } from "@/lib/utils";
import { readableTranscript } from "@/lib/transcript";

type Filter = "winning" | "closed" | "showed";
const FILTERS: Array<{ key: Filter; label: string; hint: string }> = [
  { key: "winning", label: "All winning", hint: "closed, or sat and qualified" },
  { key: "closed", label: "Showed and closed", hint: "sat and signed" },
  { key: "showed", label: "Showed, no close", hint: "sat, qualified, not signed" },
];
const inFilter = (c: StudyCall, f: Filter) => f === "winning" || (f === "closed") === (c.result === "closed");

const RESULT_BADGE: Record<StudyCall["result"], { label: string; cls: string }> = {
  closed: { label: "Closed", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  showed: { label: "Showed", cls: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  booked: { label: "Booked", cls: "border-primary/40 text-primary" },
  not_booked: { label: "", cls: "border-border text-muted-foreground" },
};
const STEP = 25;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Melbourne" });

function StudyRow({ call, note, name }: { call: StudyCall; note: StudyNote | undefined; name: string }) {
  const { toast } = useToast();
  const save = useSaveStudyNote();
  const [open, setOpen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [worked, setWorked] = useState(note?.worked ?? "");
  const [useNext, setUseNext] = useState(note?.useNext ?? "");
  const { data: transcript, isLoading, isError } = useCallTranscript(call.id, showTranscript);
  const style = RESULT_BADGE[call.result];
  const changed = worked.trim() !== (note?.worked ?? "") || useNext.trim() !== (note?.useNext ?? "");
  const ready = worked.trim().length > 0 && useNext.trim().length > 0;

  async function submit() {
    try {
      await save.mutateAsync({ callLogId: call.id, worked, useNext });
      toast({ title: note ? "Review updated" : "Review saved", description: "Your manager can see it." });
    } catch (e) {
      toast({ title: "Couldn't save that", description: (e as { message?: string })?.message ?? "Try again in a moment.", variant: "destructive" });
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 p-3 text-left">
        <Badge variant="outline" className={cn("shrink-0 text-[10px]", style.cls)}>{style.label || call.outcome.replace(/_/g, " ")}</Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{call.business ?? "Unknown business"}</span>
        {note && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Reviewed" />}
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{fmtTalk(call.talk)}</span>
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">{fmtDate(call.calledAt)}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <ListenButton dialpadCallId={call.dialpadCallId} className="flex flex-wrap items-center gap-2" />
            {call.meetingUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={call.meetingUrl} target="_blank" rel="noopener noreferrer"><Video className="mr-1.5 h-3.5 w-3.5" /> The meeting <ExternalLink className="ml-1.5 h-3 w-3" /></a>
              </Button>
            )}
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowTranscript((v) => !v)}>{showTranscript ? "Hide transcript" : "Transcript"}</Button>
          </div>
          {showTranscript && (
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 font-sans text-xs leading-relaxed">
              {isLoading ? "Loading…" : isError ? "Couldn't load the transcript." : readableTranscript(transcript) ?? "No transcript for this call."}
            </pre>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              What moved the call forward, and what cost it?
              <Textarea value={worked} onChange={(e) => setWorked(e.target.value)} rows={3} maxLength={4000} placeholder="The line or the moment, not a summary." className="text-foreground" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              What will you use on your next call?
              <Textarea value={useNext} onChange={(e) => setUseNext(e.target.value)} rows={3} maxLength={4000} placeholder={`One thing of ${name}'s, in your words.`} className="text-foreground" />
            </label>
          </div>
          <Button size="sm" disabled={!ready || !changed || save.isPending} onClick={submit}>
            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{note ? "Update review" : "Save review"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Someone else's calls, for a rep to listen to and review. */
export function StudyCalls({ sourceId, name }: { sourceId: string; name: string }) {
  const { data: allCalls = [], isLoading, isError } = useStudyCalls([sourceId]);
  // Someone else's calls are here to learn from, so only the ones that won.
  const calls = useMemo(() => allCalls.filter((c) => c.winning), [allCalls]);
  const { data: notes } = useMyStudyNotes();
  const [filter, setFilter] = useState<Filter>("winning");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(STEP);

  const counts = useMemo(() => new Map(FILTERS.map((f) => [f.key, calls.filter((c) => inFilter(c, f.key)).length])), [calls]);
  const term = search.trim().toLowerCase();
  const list = useMemo(
    () => calls.filter((c) => inFilter(c, filter) && (!term || (c.business ?? "").toLowerCase().includes(term))),
    [calls, filter, term],
  );
  const reviewed = calls.filter((c) => notes?.has(c.id)).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Headphones className="h-5 w-5 text-primary" /> Review {name}'s calls
          {calls.length > 0 && <Badge variant="outline" className="font-mono text-[10px]">{reviewed} of {calls.length} reviewed</Badge>}
        </CardTitle>
        <CardDescription>The calls that set a meeting that closed, or where a qualified prospect sat. Listen, then write what moved it and the one thing you'll use. Your manager reads these.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" size="sm" value={filter} onValueChange={(v) => { if (v) { setFilter(v as Filter); setLimit(STEP); } }} className="flex-wrap justify-start">
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.key} value={f.key} title={f.hint} className="h-7 gap-1 px-2 text-xs">
                {f.label} <span className="font-mono text-[10px] text-muted-foreground">{counts.get(f.key) ?? 0}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="relative ml-auto w-full sm:w-56">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setLimit(STEP); }} placeholder="Business name" className="h-8 pl-8 text-xs" />
          </div>
        </div>
        {isLoading || !notes ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
          : isError ? <p className="py-6 text-center text-sm text-destructive">Couldn't load the calls. Refresh to try again.</p>
          : list.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No calls match.</p>
          : list.slice(0, limit).map((c) => <StudyRow key={c.id} call={c} note={notes.get(c.id)} name={name} />)}
        {list.length > limit && <Button size="sm" variant="ghost" className="w-full" onClick={() => setLimit((n) => n + STEP)}>Show more ({list.length - limit} left)</Button>}
      </CardContent>
    </Card>
  );
}
