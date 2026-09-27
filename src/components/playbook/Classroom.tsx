import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Circle, ExternalLink, GraduationCap, Link2, Loader2, Lock, Pencil, Plus, Save, Trash2, Video, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useCanViewAdmin } from "@/hooks/useUserRole";
import { usePlaybookLocks, industryLockKey } from "@/hooks/usePlaybookLocks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SetterScript } from "@/components/training/SetterScript";
import { SetterBoundaries } from "@/components/training/SetterBoundaries";
import { ColdCallOpener } from "@/components/training/ColdCallOpener";
import { ColdBrushOffs } from "@/components/training/ColdBrushOffs";
import { MindsetsPanel } from "@/components/training/MindsetsPanel";
import { ProblemsPanel } from "@/components/training/ProblemsPanel";
import { PainHooks } from "@/components/training/PainHooks";
import { TradeSegmentsPanel } from "@/components/training/TradeSegmentsPanel";
import { TradiePlaybook } from "@/components/training/TradiePlaybook";
import { ReframeLibrary } from "@/components/training/ReframeLibrary";
import { ObjectionBankPanel } from "@/components/training/ObjectionBankPanel";
import { WordTracks } from "@/components/training/WordTracks";
import { ServicesExplainer } from "@/components/training/ServicesExplainer";
import { CaseStudiesPanel } from "@/components/training/CaseStudiesPanel";
import { GlossaryPanel } from "@/components/training/GlossaryPanel";
import { WinningCallsLibrary } from "@/components/playbook/WinningCallsLibrary";
import { LearningCallsLibrary } from "@/components/playbook/LearningCallsLibrary";
import {
  useLmsCourses, useLmsLessons, useMyLessonProgress, useSetLessonProgress,
  useUpsertCourse, useUpsertLesson, useDeleteLesson, toEmbedUrl,
  type LmsCourse, type LmsLesson, type LmsResource,
} from "@/hooks/useLms";

/**
 * Skool-style classroom. A grid of courses; inside a course, a rail of
 * sections and lessons with ticks, and the lesson (video, notes, resources)
 * on the right. Managers get an edit mode to add courses, lessons, videos
 * and links in-app, so a recorded training lands here once instead of being
 * re-explained on every call.
 */

/** Built-in panels a lesson can carry. Managers pick one in the lesson editor; video + notes render above it. */
export const COMPONENTS: Record<string, { label: string; render: () => React.ReactNode }> = {
  script: { label: "The script (four blocks + stage ticks)", render: () => <SetterScript /> },
  remit: { label: "Your remit (what goes to Bede)", render: () => <SetterBoundaries /> },
  opener: { label: "First 15 seconds (measured)", render: () => <ColdCallOpener /> },
  brushoffs: { label: "Brush-offs, ranked", render: () => <ColdBrushOffs /> },
  mindsets: { label: "Three mindsets + archetypes", render: () => <MindsetsPanel /> },
  problems: { label: "Five problems, bleeding neck, the gap", render: () => <ProblemsPanel /> },
  pain: { label: "Pain hooks you may use cold", render: () => <PainHooks /> },
  subtrades: { label: "Sub-trades (electrical + plumbing)", render: () => <TradeSegmentsPanel /> },
  tradie: { label: "How tradies talk", render: () => <TradiePlaybook /> },
  reframes: { label: "Reframes (four beats)", render: () => <ReframeLibrary /> },
  objections: { label: "Objection bank", render: () => <ObjectionBankPanel /> },
  lines: { label: "Bede's lines", render: () => <WordTracks /> },
  services: { label: "What we sell + Odin Analytics", render: () => <ServicesExplainer /> },
  proof: { label: "Proof & case studies", render: () => <CaseStudiesPanel /> },
  glossary: { label: "Glossary + scenarios", render: () => <GlossaryPanel /> },
  calls: { label: "Winning calls (recordings)", render: () => <WinningCallsLibrary /> },
  lost: { label: "Calls that didn't book", render: () => <LearningCallsLibrary /> },
};

export const courseLockKey = (slug: string) => `course:${slug}`;

/* ---------- tiny notes renderer: paragraphs, **bold**, "- " bullets ---------- */
function Notes({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i} className="text-foreground">{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
    );
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^-\s+/.test(l))) {
          return (
            <ul key={i} className="ml-4 list-disc space-y-1">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^-\s+/, ""))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{inline(b)}</p>;
      })}
    </div>
  );
}

function CoverTile({ course, pct }: { course: LmsCourse; pct: number }) {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-primary/80 via-primary/60 to-slate-900">
      {course.cover_url ? (
        <img src={course.cover_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-end p-4">
          <span className="text-2xl font-bold uppercase tracking-tight text-primary-foreground drop-shadow">{course.title}</span>
        </div>
      )}
      {pct === 100 && (
        <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white">Done</span>
      )}
    </div>
  );
}

/* ---------- course grid ---------- */
function CourseGrid({ courses, lessons, done, locked, isManager, onOpen, onNew }: {
  courses: LmsCourse[]; lessons: LmsLesson[]; done: Set<string>; locked: Set<string>;
  isManager: boolean; onOpen: (slug: string) => void; onNew: () => void;
}) {
  const visible = courses.filter((c) => c.published || isManager);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
        <h3 className="flex items-center gap-2 font-medium text-foreground"><GraduationCap className="h-4 w-4 text-primary" /> One course per skill</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Work them top-left to bottom-right. Tick a lesson only when you have actually watched or read it — your
          manager sees the ticks, and the call reviews are where they check you meant it.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((c) => {
          const ls = lessons.filter((l) => l.course_id === c.id && (l.published || isManager));
          const n = ls.filter((l) => done.has(l.id)).length;
          const pct = ls.length ? Math.round((n / ls.length) * 100) : 0;
          const isLocked = locked.has(courseLockKey(c.slug)) || (!!c.industry && locked.has(industryLockKey(c.industry)));
          const disabled = isLocked && !isManager;
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onOpen(c.slug)}
              className={cn(
                "group overflow-hidden rounded-xl border border-border bg-card text-left transition-shadow hover:shadow-md",
                disabled && "cursor-not-allowed opacity-50 hover:shadow-none",
              )}
            >
              <CoverTile course={c} pct={pct} />
              <div className="space-y-2 p-4">
                <div className="flex items-start gap-2">
                  <span className="flex-1 text-base font-semibold">{c.title}</span>
                  {isLocked && <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  {!c.published && <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700">draft</Badge>}
                </div>
                {c.blurb && <p className="line-clamp-2 text-sm text-muted-foreground">{c.blurb}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">{pct}%</span>
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">{ls.length} lesson{ls.length === 1 ? "" : "s"}{isLocked ? " · locked for reps" : ""}</p>
              </div>
            </button>
          );
        })}
        {isManager && (
          <button type="button" onClick={onNew} className="flex min-h-[220px] items-center justify-center rounded-xl border-2 border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground">
            <Plus className="mr-1.5 h-4 w-4" /> New course
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- lesson editor (managers) ---------- */
function LessonEditor({ lesson, courseId, onClose }: { lesson: LmsLesson | null; courseId: string; onClose: () => void }) {
  const { toast } = useToast();
  const save = useUpsertLesson();
  const del = useDeleteLesson();
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [section, setSection] = useState(lesson?.section ?? "Lessons");
  const [sort, setSort] = useState(String(lesson?.sort ?? 100));
  const [video, setVideo] = useState(lesson?.video_url ?? "");
  const [body, setBody] = useState(lesson?.body ?? "");
  const [resources, setResources] = useState((lesson?.resources ?? []).map((r) => `${r.label} | ${r.url}`).join("\n"));
  const [published, setPublished] = useState(lesson?.published ?? true);
  const [component, setComponent] = useState<string>(lesson?.component ?? "");

  async function persist() {
    const res: LmsResource[] = resources.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [label, ...rest] = l.split("|"); const url = rest.join("|").trim();
      return { label: label.trim(), url: url || label.trim() };
    });
    try {
      await save.mutateAsync({ id: lesson?.id, course_id: courseId, title: title.trim(), section: section.trim() || "Lessons", sort: Number(sort) || 100, video_url: video.trim() || null, body: body.trim() || null, resources: res, published, component: component || null });
      toast({ title: lesson ? "Lesson updated" : "Lesson added" }); onClose();
    } catch (e) { toast({ title: "Couldn't save", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }); }
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{lesson ? "Edit lesson" : "New lesson"}</span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_90px]">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title" />
          <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Section (e.g. Start here)" />
          <Input value={sort} onChange={(e) => setSort(e.target.value)} placeholder="Order" type="number" />
        </div>
        <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="Video link — YouTube, Loom, Vimeo, or a direct .mp4" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder={"Notes. Blank line between paragraphs, **bold** for emphasis, lines starting with - for bullets."} />
        <Textarea value={resources} onChange={(e) => setResources(e.target.value)} rows={3} placeholder={"Resources, one per line:  Label | https://link"} />
        <Select value={component || "__none"} onValueChange={(v) => setComponent(v === "__none" ? "" : v)}>
          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Built-in panel (optional)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">No built-in panel</SelectItem>
            {Object.entries(COMPONENTS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={published} onCheckedChange={setPublished} /> Published</label>
          <Button size="sm" disabled={!title.trim() || save.isPending} onClick={persist}>
            {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
          </Button>
          {lesson && (
            <Button size="sm" variant="ghost" className="text-destructive" disabled={del.isPending}
              onClick={async () => { if (confirm(`Delete "${lesson.title}"? Reps' ticks on it go too.`)) { await del.mutateAsync(lesson.id); onClose(); } }}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CourseEditor({ course, onClose }: { course: LmsCourse | null; onClose: () => void }) {
  const { toast } = useToast();
  const save = useUpsertCourse();
  const [title, setTitle] = useState(course?.title ?? "");
  const [blurb, setBlurb] = useState(course?.blurb ?? "");
  const [cover, setCover] = useState(course?.cover_url ?? "");
  const [industry, setIndustry] = useState(course?.industry ?? "");
  const [sort, setSort] = useState(String(course?.sort ?? 100));
  const [published, setPublished] = useState(course?.published ?? true);
  async function persist() {
    try {
      await save.mutateAsync({ id: course?.id, slug: course?.slug, title: title.trim(), blurb: blurb.trim() || null, cover_url: cover.trim() || null, industry: industry.trim() || null, sort: Number(sort) || 100, published });
      toast({ title: course ? "Course updated" : "Course created" }); onClose();
    } catch (e) { toast({ title: "Couldn't save", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }); }
  }
  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{course ? "Edit course" : "New course"}</span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" />
        <Textarea value={blurb} onChange={(e) => setBlurb(e.target.value)} rows={2} placeholder="One or two lines on what it covers" />
        <Input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="Cover image URL (optional — a coloured tile is used otherwise)" />
        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry name, if this course should follow the industry lock (e.g. Electrical)" />
          <Input value={sort} onChange={(e) => setSort(e.target.value)} placeholder="Order" type="number" />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><Switch checked={published} onCheckedChange={setPublished} /> Published</label>
          <Button size="sm" disabled={!title.trim() || save.isPending} onClick={persist}>
            {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- course view ---------- */
function CourseView({ course, lessons, done, isManager, lessonId, onBack, onPick }: {
  course: LmsCourse; lessons: LmsLesson[]; done: Set<string>; isManager: boolean; lessonId: string | null;
  onBack: () => void; onPick: (id: string) => void;
}) {
  const setDone = useSetLessonProgress();
  const [editing, setEditing] = useState<"course" | "new" | LmsLesson | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: locks = new Set<string>() } = usePlaybookLocks();
  // A section named after a locked industry (inside "Know the trade") is hidden for reps.
  const visible = lessons.filter((l) => (l.published || isManager) && (isManager || !locks.has(industryLockKey(l.section))));
  const hiddenSections = isManager ? [] : [...new Set(lessons.filter((l) => locks.has(industryLockKey(l.section))).map((l) => l.section))];
  const sections = useMemo(() => {
    const order: string[] = []; const by = new Map<string, LmsLesson[]>();
    for (const l of visible) { if (!by.has(l.section)) { by.set(l.section, []); order.push(l.section); } by.get(l.section)!.push(l); }
    return order.map((s) => [s, by.get(s)!] as const);
  }, [visible]);

  const active = visible.find((l) => l.id === lessonId) ?? visible[0] ?? null;
  useEffect(() => { if (active && active.id !== lessonId) onPick(active.id); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = visible.filter((l) => done.has(l.id)).length;
  const pct = visible.length ? Math.round((n / visible.length) * 100) : 0;
  const embed = toEmbedUrl(active?.video_url);
  const idx = active ? visible.findIndex((l) => l.id === active.id) : -1;
  const next = idx >= 0 && idx + 1 < visible.length ? visible[idx + 1] : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1.5 h-4 w-4" /> All courses</Button>
        {isManager && (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditing("course")}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit course</Button>
            <Button variant="outline" size="sm" onClick={() => setEditing("new")}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add lesson</Button>
          </>
        )}
      </div>

      {editing === "course" && <CourseEditor course={course} onClose={() => setEditing(null)} />}
      {editing === "new" && <LessonEditor lesson={null} courseId={course.id} onClose={() => setEditing(null)} />}
      {editing && typeof editing === "object" && <LessonEditor lesson={editing} courseId={course.id} onClose={() => setEditing(null)} />}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* rail */}
        <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <div>
            <p className="text-base font-semibold">{course.title}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
              <span className="font-mono text-[11px] text-muted-foreground">{pct}%</span>
            </div>
          </div>
          {sections.map(([sec, ls]) => {
            const isCollapsed = collapsed.has(sec);
            return (
              <div key={sec}>
                <button type="button" onClick={() => { const c = new Set(collapsed); if (c.has(sec)) c.delete(sec); else c.add(sec); setCollapsed(c); }}
                  className="flex w-full items-center justify-between py-1 text-sm font-semibold">
                  {sec}{isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {!isCollapsed && (
                  <div className="space-y-0.5">
                    {ls.map((l) => (
                      <button key={l.id} type="button" onClick={() => onPick(l.id)}
                        className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                          active?.id === l.id ? "bg-amber-100 font-medium text-foreground dark:bg-amber-500/15" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
                        <span className="min-w-0 flex-1 truncate">{l.title}</span>
                        {!l.published && <span className="text-[9px] uppercase text-amber-600">draft</span>}
                        {done.has(l.id) ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground/30" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && <p className="text-xs text-muted-foreground">No lessons yet.</p>}
          {hiddenSections.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><Lock className="mt-0.5 h-3 w-3 shrink-0" /> {hiddenSections.length} more {hiddenSections.length === 1 ? "trade" : "trades"} parked by your manager until you start calling them.</p>
          )}
        </aside>

        {/* lesson */}
        <Card>
          <CardContent className="space-y-4 p-5">
            {active ? (
              <>
                <div className="flex items-start gap-3">
                  <h2 className="flex-1 text-xl font-semibold">{active.title}</h2>
                  {isManager && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditing(active)}><Pencil className="h-3.5 w-3.5" /></Button>}
                  {done.has(active.id) && <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />}
                </div>

                {embed?.kind === "iframe" && (
                  <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
                    <iframe src={embed.src} title={active.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                  </div>
                )}
                {embed?.kind === "video" && <video src={embed.src} controls className="aspect-video w-full rounded-lg border border-border bg-black" />}
                {embed?.kind === "link" && (
                  <a href={embed.src} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-primary underline underline-offset-2">
                    <Video className="h-4 w-4" /> Open the video <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {!embed && !active.component && (
                  <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
                    <Video className="mr-2 h-4 w-4" /> No video on this one yet — the notes below are the lesson.
                  </div>
                )}

                {active.body && <Notes text={active.body} />}
                {active.component && COMPONENTS[active.component]?.render()}

                {active.resources.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-sm font-semibold">Resources</p>
                    <div className="space-y-1">
                      {active.resources.map((r, i) => (
                        <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary underline-offset-2 hover:underline">
                          <span className="flex h-6 w-6 items-center justify-center rounded bg-muted"><Link2 className="h-3.5 w-3.5 text-muted-foreground" /></span>{r.label}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <Button size="sm" variant={done.has(active.id) ? "outline" : "default"} disabled={setDone.isPending}
                    onClick={() => setDone.mutate({ lessonId: active.id, done: !done.has(active.id) })}>
                    {done.has(active.id) ? <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-500" /> Completed — undo</> : <><Circle className="mr-1.5 h-3.5 w-3.5" /> Mark complete</>}
                  </Button>
                  {next && <Button size="sm" variant="ghost" onClick={() => onPick(next.id)}>Next: {next.title} <ChevronRight className="ml-1 h-4 w-4" /></Button>}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Pick a lesson on the left.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ---------- root ---------- */
export function Classroom() {
  const [params, setParams] = useSearchParams();
  const isManager = useCanViewAdmin();
  const { data: courses = [], isLoading } = useLmsCourses();
  const { data: lessons = [] } = useLmsLessons();
  const { data: done = new Set<string>() } = useMyLessonProgress();
  const { data: locks = new Set<string>() } = usePlaybookLocks();
  const [creating, setCreating] = useState(false);

  const slug = params.get("course");
  const lessonId = params.get("lesson");
  const course = courses.find((c) => c.slug === slug) ?? null;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v === null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  if (isLoading) return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading classroom…</div>;

  if (course) {
    const isLocked = locks.has(courseLockKey(course.slug)) || (!!course.industry && locks.has(industryLockKey(course.industry)));
    if (isLocked && !isManager) {
      return (
        <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          <Lock className="mb-2 h-5 w-5" /> Your manager has parked this course for now. Back to <button className="text-primary underline" onClick={() => set({ course: null, lesson: null })}>all courses</button>.
        </div>
      );
    }
    return (
      <CourseView
        course={course}
        lessons={lessons.filter((l) => l.course_id === course.id)}
        done={done}
        isManager={isManager}
        lessonId={lessonId}
        onBack={() => set({ course: null, lesson: null })}
        onPick={(id) => set({ lesson: id })}
      />
    );
  }

  return (
    <div className="space-y-3">
      {creating && <CourseEditor course={null} onClose={() => setCreating(false)} />}
      <CourseGrid courses={courses} lessons={lessons} done={done} locked={locks} isManager={isManager}
        onOpen={(s) => set({ course: s, lesson: null })} onNew={() => setCreating(true)} />
    </div>
  );
}
