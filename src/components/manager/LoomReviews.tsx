import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ChevronDown, Eye, GraduationCap, Link2, Loader2, Pencil, Plus, Search, Trash2, Video, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { LoomPlayer } from "@/components/loom/LoomPlayer";
import { ReviewedCalls } from "@/components/loom/ReviewedCalls";
import { Notes } from "@/components/playbook/Classroom";
import { useLmsCourses } from "@/hooks/useLms";
import {
  fetchCallForReview, useCallPicker, useDeleteLoomReview, useLoomReviews, useSaveLoomReview,
  type LoomReview, type LoomReviewCall,
} from "@/hooks/useLoomReviews";
import { useRepProfiles, type RepProfile } from "@/hooks/useManager";
import { fetchLoomMeta, fmtDay, fmtLoomLength, fmtTalk, normaliseLoomUrl } from "@/lib/loom";
import { cn } from "@/lib/utils";

const DEFAULT_SECTION = "Loom reviews";
const errorText = (e: unknown) => (e as { message?: string })?.message ?? "Try again.";

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ---------- attach calls ---------- */
function CallPicker({ reps, defaultRep, picked, onAdd }: {
  reps: RepProfile[]; defaultRep: string | null; picked: LoomReviewCall[]; onAdd: (c: LoomReviewCall) => void;
}) {
  const [search, setSearch] = useState("");
  const [rep, setRep] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const term = useDebounced(search, 300);
  const repFilter = rep ?? defaultRep ?? "all";
  const { data: calls = [], isLoading, isError } = useCallPicker(term, repFilter === "all" ? null : repFilter, true);
  const pickedIds = new Set(picked.map((c) => c.callLogId));
  const available = calls.filter((c) => !pickedIds.has(c.callLogId));
  const nameOf = (id: string | null) => reps.find((r) => r.user_id === id)?.name ?? "Unknown";
  const linkOk = /^https:\/\/\S+$/.test(url.trim());

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="h-9 pl-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by business name" />
        </div>
        <Select value={repFilter} onValueChange={setRep}>
          <SelectTrigger className="h-9 w-40 text-xs" aria-label="Whose calls"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reps</SelectItem>
            {reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card">
        {isLoading ? <p className="p-3 text-xs text-muted-foreground">Loading calls…</p>
          : isError ? <p className="p-3 text-xs text-destructive">Couldn't load calls. Try again in a moment.</p>
          : available.length === 0 ? <p className="p-3 text-xs text-muted-foreground">{calls.length ? "Every match is already attached." : "No calls match."}</p>
          : available.map((c) => (
            <button key={c.id} type="button" onClick={() => onAdd(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50">
              <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate font-medium">{c.business ?? "Unknown business"}</span>
              <span className="shrink-0 text-muted-foreground">{nameOf(c.repUserId)}</span>
              <span className="shrink-0 text-muted-foreground">{c.outcome?.replace(/_/g, " ")}</span>
              <span className="w-14 shrink-0 text-right font-mono text-muted-foreground">{fmtTalk(c.talk)}</span>
              <span className="w-14 shrink-0 text-right text-muted-foreground">{fmtDay(c.calledAt)}</span>
            </button>
          ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {term.trim().length >= 2 ? "Searching every call of 30 seconds or more." : "Calls of 30 seconds or more from the last 14 days. Type a name to search further back."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Input className="h-8 min-w-[140px] flex-1 text-xs" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Or a recording that isn't in the dialer: its name" />
        <Input className="h-8 min-w-[160px] flex-1 text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://fathom.video/share/…" />
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={!linkOk}
          onClick={() => {
            onAdd({ id: `link-${url.trim()}`, callLogId: null, label: label.trim() || "Recording", url: url.trim(), note: null, repUserId: null, business: null, outcome: null, calledAt: null, talk: null, dialpadCallId: null });
            setLabel(""); setUrl("");
          }}>
          Add link
        </Button>
      </div>
    </div>
  );
}

/* ---------- create / edit ---------- */
function ReviewForm({ review, seedCall, reps, onClose }: {
  review: LoomReview | null; seedCall: LoomReviewCall | null; reps: RepProfile[]; onClose: () => void;
}) {
  const { toast } = useToast();
  const save = useSaveLoomReview();
  const { data: courses = [] } = useLmsCourses();
  const [link, setLink] = useState(review?.loomUrl ?? "");
  const [title, setTitle] = useState(review?.title ?? "");
  const [duration, setDuration] = useState<number | null>(review?.duration ?? null);
  const [notes, setNotes] = useState(review?.notes ?? "");
  const [to, setTo] = useState<string[]>(review?.recipients.map((r) => r.userId) ?? (seedCall?.repUserId ? [seedCall.repUserId] : []));
  const [calls, setCalls] = useState<LoomReviewCall[]>(review?.calls ?? (seedCall ? [seedCall] : []));
  const [inLibrary, setInLibrary] = useState(!!review?.lesson);
  const [pickedCourse, setPickedCourse] = useState<string | null>(review?.lesson?.courseId ?? null);
  const [section, setSection] = useState(review?.lesson?.section ?? DEFAULT_SECTION);

  const courseId = pickedCourse ?? courses.find((c) => c.slug === "learn-from-real-calls")?.id ?? courses[0]?.id ?? null;
  const loomUrl = normaliseLoomUrl(link);

  // Loom gives the title and length away; only fill the title if it's still empty.
  useEffect(() => {
    if (!loomUrl || loomUrl === review?.loomUrl) return;
    let live = true;
    setDuration(null);
    void fetchLoomMeta(loomUrl).then((m) => {
      if (!live) return;
      setDuration(m.duration);
      if (m.title) setTitle((t) => t || m.title!);
    });
    return () => { live = false; };
  }, [loomUrl, review?.loomUrl]);

  // The picker opens on the rep it's going to, when that is one person.
  const onlyRep = to.length === 1 ? to[0] : null;
  // Someone moved to former keeps the reviews they were sent; show them so they aren't dropped unseen.
  const people = [...reps, ...to.filter((id) => !reps.some((r) => r.user_id === id)).map((id) => ({ user_id: id, name: "Former rep" }))];
  const problem = !loomUrl ? "Paste a Loom link"
    : !title.trim() ? "Give it a title"
    : to.length === 0 && !inLibrary ? "Pick who it's for, or add it to the Classroom"
    : inLibrary && !courseId ? "Pick a course" : null;

  async function persist() {
    if (problem || !loomUrl) return;
    try {
      await save.mutateAsync({
        id: review?.id ?? null, title, loomUrl, duration, notes, reps: to, calls,
        courseId: inLibrary ? courseId : null, section,
      });
      toast({
        title: review ? "Review updated" : "Review sent",
        description: [to.length ? "It's on their Training page" : null, inLibrary ? "in the Classroom" : null].filter(Boolean).join(" and ") + ".",
      });
      onClose();
    } catch (e) {
      toast({ title: "Couldn't save the review", description: errorText(e), variant: "destructive" });
    }
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{review ? "Edit Loom review" : "New Loom review"}</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <p className="text-sm font-medium">The Loom</p>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste the Loom link" aria-label="Loom link" />
          {link.trim() && !loomUrl && <p className="text-xs text-destructive">That isn't a Loom share link.</p>}
          <div className="flex items-center gap-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" maxLength={200} />
            {duration ? <span className="shrink-0 text-xs text-muted-foreground">{fmtLoomLength(duration)}</span> : null}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Who it's for</p>
          <div className="flex flex-wrap gap-2">
            {people.map((r) => {
              const on = to.includes(r.user_id);
              return (
                <Button key={r.user_id} type="button" size="sm" variant={on ? "default" : "outline"} aria-pressed={on}
                  onClick={() => setTo((prev) => (on ? prev.filter((x) => x !== r.user_id) : [...prev, r.user_id]))}>
                  {on && <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}{r.name}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">The calls you reviewed</p>
          {calls.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
              <span className="min-w-0 flex-1 truncate text-xs">
                <span className="font-medium">{c.callLogId ? c.business ?? "Unknown business" : c.label}</span>
                <span className="ml-2 text-muted-foreground">{[reps.find((r) => r.user_id === c.repUserId)?.name, fmtDay(c.calledAt), fmtTalk(c.talk)].filter(Boolean).join(" · ")}</span>
              </span>
              <Input className="h-8 min-w-[180px] flex-1 text-xs" value={c.note ?? ""} placeholder="What to listen for (optional)"
                onChange={(e) => setCalls((prev) => prev.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2" aria-label="Remove call" onClick={() => setCalls((prev) => prev.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          <CallPicker reps={reps} defaultRep={onlyRep} picked={calls} onAdd={(c) => setCalls((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]))} />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Notes</p>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5}
            placeholder="What to take from it. Shown to the rep, and under the video in the Classroom if you add it there. ## Heading, **bold** and - bullets work." />
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={inLibrary} onCheckedChange={setInLibrary} /> Add to the Classroom for the whole team</label>
          {inLibrary && (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select value={courseId ?? undefined} onValueChange={setPickedCourse}>
                  <SelectTrigger className="h-9 text-sm" aria-label="Course"><SelectValue placeholder="Course" /></SelectTrigger>
                  <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}{c.published ? "" : " (draft)"}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="h-9" value={section} onChange={(e) => setSection(e.target.value)} placeholder="Section" aria-label="Section" />
              </div>
              <p className="text-xs text-muted-foreground">It becomes a lesson with the video, your notes and the calls attached. Everyone can hear the calls and see whose they are.</p>
            </>
          )}
          {!inLibrary && review?.lesson && <p className="text-xs text-destructive">Saving removes it from {review.lesson.courseTitle ?? "the Classroom"}, along with the ticks on it.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!!problem || save.isPending} onClick={persist}>
            {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{review ? "Save changes" : "Send review"}
          </Button>
          {problem && <span className="text-xs text-muted-foreground">{problem}.</span>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- one sent review ---------- */
function ReviewRow({ review, reps, onEdit }: { review: LoomReview; reps: RepProfile[]; onEdit: () => void }) {
  const { toast } = useToast();
  const del = useDeleteLoomReview();
  const [open, setOpen] = useState(false);
  const nameOf = (id: string) => reps.find((r) => r.user_id === id)?.name ?? "Former rep";

  async function copy() {
    const path = review.recipients.length || !review.lesson?.courseSlug
      ? `/training?loom=${review.id}`
      : `/training?tab=classroom&course=${review.lesson.courseSlug}&lesson=${review.lesson.id}`;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Couldn't copy the link", variant: "destructive" });
    }
  }
  async function remove() {
    if (!confirm(`Delete "${review.title}"?${review.lesson ? " It comes out of the Classroom too." : ""} The Loom itself is not deleted.`)) return;
    try { await del.mutateAsync(review.id); toast({ title: "Review deleted" }); }
    catch (e) { toast({ title: "Couldn't delete it", description: errorText(e), variant: "destructive" }); }
  }

  return (
    <div className="rounded-lg border border-border">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center gap-2 p-3 text-left">
        <Video className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-[180px] flex-1">
          <span className="block text-sm font-medium">{review.title}</span>
          <span className="block text-[11px] text-muted-foreground">
            {[fmtDay(review.createdAt), fmtLoomLength(review.duration), `${review.calls.length} call${review.calls.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
          </span>
        </span>
        {review.recipients.map((r) => (
          <Badge key={r.userId} variant="outline" className={cn("gap-1 text-[10px]", r.watchedAt ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : !r.seenAt && "text-muted-foreground")}>
            {r.watchedAt ? <CheckCircle2 className="h-3 w-3" /> : r.seenAt ? <Eye className="h-3 w-3" /> : null}
            {nameOf(r.userId)} · {r.watchedAt ? "watched" : r.seenAt ? "opened" : "not opened"}
          </Badge>
        ))}
        {review.lesson && <Badge variant="secondary" className="gap-1 text-[10px]"><GraduationCap className="h-3 w-3" /> {review.lesson.courseTitle ?? "Classroom"}</Badge>}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
            <Button size="sm" variant="outline" onClick={copy}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Copy link</Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={del.isPending} onClick={remove}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</Button>
          </div>
          <LoomPlayer url={review.loomUrl} title={review.title} />
          {review.notes && <Notes text={review.notes} />}
          <ReviewedCalls calls={review.calls} />
        </div>
      )}
    </div>
  );
}

/**
 * Manager → Loom reviews. Paste a Loom, pick who it's for, attach the calls it
 * reviews, and optionally publish it as a Classroom lesson. Call review's "Send a
 * Loom on this call" lands here with ?call=<call log id> already attached.
 */
export function LoomReviews() {
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  const { data: reviews = [], isLoading, isError } = useLoomReviews();
  const { data: reps = [] } = useRepProfiles();
  const [editing, setEditing] = useState<{ review: LoomReview | null; seed: LoomReviewCall | null } | null>(null);
  const [rep, setRep] = useState("all");

  const callParam = params.get("call");
  useEffect(() => {
    if (!callParam) return;
    let live = true;
    const clear = () => setParams((prev) => { const n = new URLSearchParams(prev); n.delete("call"); return n; }, { replace: true });
    fetchCallForReview(callParam)
      .then((c) => {
        if (!live) return;
        setEditing({ review: null, seed: c });
        if (!c) toast({ title: "That call couldn't be found", variant: "destructive" });
        clear();
      })
      .catch((e) => { if (live) { toast({ title: "Couldn't load that call", description: errorText(e), variant: "destructive" }); clear(); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callParam]);

  const list = reviews.filter((r) => rep === "all" || r.recipients.some((x) => x.userId === rep));
  return (
    <div className="space-y-4">
      {editing && (
        <ReviewForm key={editing.review?.id ?? editing.seed?.id ?? "new"} review={editing.review} seedCall={editing.seed} reps={reps} onClose={() => setEditing(null)} />
      )}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Loom reviews</CardTitle>
              <CardDescription>Send a Loom to a rep with the calls attached. They see it on Training with a badge in the sidebar, and you see who has watched it.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={rep} onValueChange={setRep}>
                <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filter by rep"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reps</SelectItem>
                  {reps.map((r) => <SelectItem key={r.user_id} value={r.user_id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => setEditing({ review: null, seed: null })}><Plus className="mr-1.5 h-3.5 w-3.5" /> New Loom review</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p>
            : isError ? <p className="text-xs text-destructive">Couldn't load the reviews. Refresh to try again.</p>
            : list.length === 0 ? <p className="text-xs text-muted-foreground">No Loom reviews yet.</p>
            : list.map((r) => (
              <ReviewRow key={r.id} review={r} reps={reps} onEdit={() => { setEditing({ review: r, seed: null }); document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" }); }} />
            ))}
        </CardContent>
      </Card>
    </div>
  );
}
