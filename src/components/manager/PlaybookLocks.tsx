import { Lock, LockOpen, Loader2, ListChecks } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { usePlaybookLocks, useSetPlaybookLock, industryLockKey } from "@/hooks/usePlaybookLocks";
import { useRepProfiles } from "@/hooks/useManager";
import { useLmsCourses, useLmsLessons, useTeamLessonProgress } from "@/hooks/useLms";
import { courseLockKey } from "@/components/playbook/Classroom";
import { DialerScope } from "@/components/manager/DialerScope";

/**
 * Manager control over the Classroom: which courses a rep can open, which
 * trades inside "Know the trade" are visible, and who has ticked what.
 * Locks are team-wide and enforced by RLS on the write side — a rep can read
 * the lock list but cannot change it.
 */

/** Section names inside the Know the trade course. Keep in step with the seed. */
const INDUSTRY_NAMES = [
  "Electrical", "Plumbing", "HVAC / air conditioning", "Solar & battery", "Building & renovations",
  "Windows, glazing & doors", "Security, data & cabling", "Pest control & specialist cleaning", "Pure commercial & industrial",
];

function LockRow({ label, lockKey }: { label: string; lockKey: string }) {
  const { data: locks } = usePlaybookLocks();
  const setLock = useSetPlaybookLock();
  const { toast } = useToast();
  const locked = locks?.has(lockKey) ?? false;
  async function toggle(next: boolean) {
    try { await setLock.mutateAsync({ key: lockKey, locked: !next }); }
    catch (e) { toast({ title: "Couldn't change that", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" }); }
  }
  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-2">
      {locked ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <LockOpen className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
      <span className={locked ? "flex-1 text-sm text-muted-foreground" : "flex-1 text-sm"}>{label}</span>
      {setLock.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <Switch checked={!locked} onCheckedChange={toggle} aria-label={`${locked ? "Unlock" : "Lock"} ${label}`} />
    </div>
  );
}

function TeamProgress() {
  const { data: reps = [] } = useRepProfiles();
  const { data: courses = [] } = useLmsCourses();
  const { data: lessons = [] } = useLmsLessons();
  const { data: progress } = useTeamLessonProgress();
  const published = lessons.filter((l) => l.published);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-primary" /> Who has worked through what</CardTitle>
        <CardDescription>Lesson ticks per course. A tick is the rep's claim, not proof — the call reviews are where you check it.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {reps.map((r) => {
            const set = progress?.get(r.user_id) ?? new Set<string>();
            const n = published.filter((l) => set.has(l.id)).length;
            const pct = published.length ? Math.round((n / published.length) * 100) : 0;
            return (
              <div key={r.user_id} className="rounded-md border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{n}/{published.length} lessons · {pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {courses.filter((c) => c.published).map((c) => {
                    const cl = published.filter((l) => l.course_id === c.id);
                    const cn = cl.filter((l) => set.has(l.id)).length;
                    const cp = cl.length ? Math.round((cn / cl.length) * 100) : 0;
                    return (
                      <div key={c.id} className="flex items-center gap-2 text-[11px]">
                        <span className="w-40 truncate text-muted-foreground">{c.title}</span>
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted"><div className={cp === 100 ? "h-full bg-emerald-500" : "h-full bg-primary/60"} style={{ width: `${cp}%` }} /></div>
                        <span className="w-10 text-right font-mono text-muted-foreground">{cn}/{cl.length}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function PlaybookLocks() {
  const { data: locks, isLoading } = usePlaybookLocks();
  const { data: courses = [] } = useLmsCourses();
  const lockedCount = locks?.size ?? 0;
  return (
    <div className="space-y-4">
      <DialerScope />
      <TeamProgress />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-primary" /> What the setters can open
            {lockedCount > 0 && <span className="font-mono text-[11px] text-muted-foreground">{lockedCount} locked</span>}
          </CardTitle>
          <CardDescription>
            Switch a course off and reps can't open it. Switch a trade off and its section disappears from Know the trade.
            You still see everything, marked with a lock. Keep week one on the courses they need.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="grid gap-x-8 md:grid-cols-2">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-primary">Courses</p>
                {courses.map((c) => <LockRow key={c.id} label={c.title} lockKey={courseLockKey(c.slug)} />)}
              </div>
              <div>
                <p className="mb-1 mt-4 font-mono text-[10px] uppercase tracking-widest text-primary md:mt-0">Trades inside "Know the trade"</p>
                {INDUSTRY_NAMES.map((n) => <LockRow key={n} label={n} lockKey={industryLockKey(n)} />)}
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Locks apply to the whole team. Reps can read the list but cannot change it — enforced in the database.</p>
        </CardContent>
      </Card>
    </div>
  );
}
