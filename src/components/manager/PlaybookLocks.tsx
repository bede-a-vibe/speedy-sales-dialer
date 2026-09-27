import { Lock, LockOpen, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  usePlaybookLocks,
  useSetPlaybookLock,
  industryLockKey,
  sectionLockKey,
} from "@/hooks/usePlaybookLocks";

/**
 * Manager control over what a new setter sees in the Playbook.
 *
 * Locks are team-wide and enforced by RLS — a rep can read the lock list but
 * cannot write it, so they cannot unlock their own content. Managers still see
 * everything, with a lock icon, so you can check what a rep is looking at.
 */

/** Keep in step with INDUSTRIES in IndustriesPanel. */
const INDUSTRY_NAMES = [
  "Electrical",
  "Plumbing",
  "HVAC / air conditioning",
  "Solar & battery",
  "Building & renovations",
  "Windows, glazing & doors",
  "Security, data & cabling",
  "Pest control & specialist cleaning",
  "Pure commercial & industrial",
];

/** Keep in step with SECTIONS in PlaybookPage. */
const SECTIONS: { id: string; label: string }[] = [
  { id: "script", label: "1 · The script" },
  { id: "reframes", label: "2 · Reframes" },
  { id: "opener", label: "3 · First 15 seconds" },
  { id: "brushoffs", label: "4 · Brush-offs" },
  { id: "mindsets", label: "5 · Three mindsets" },
  { id: "problems", label: "6 · The five problems" },
  { id: "industries", label: "7 · Industries" },
  { id: "trades", label: "8 · Sub-trades" },
  { id: "pain", label: "9 · Finding the pain" },
  { id: "services", label: "10 · What we sell" },
  { id: "lines", label: "11 · The lines" },
  { id: "proof", label: "12 · Proof & case studies" },
  { id: "remit", label: "13 · Your remit" },
  { id: "calls", label: "Winning calls (recordings)" },
  { id: "objections", label: "Objection bank" },
  { id: "glossary", label: "Glossary" },
];

function LockRow({ label, lockKey }: { label: string; lockKey: string }) {
  const { data: locks } = usePlaybookLocks();
  const setLock = useSetPlaybookLock();
  const { toast } = useToast();
  const locked = locks?.has(lockKey) ?? false;

  async function toggle(next: boolean) {
    try {
      await setLock.mutateAsync({ key: lockKey, locked: !next });
    } catch (e) {
      toast({
        title: "Couldn't change that",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-2">
      {locked ? (
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <LockOpen className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      )}
      <span className={locked ? "flex-1 text-sm text-muted-foreground" : "flex-1 text-sm"}>{label}</span>
      {setLock.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <Switch checked={!locked} onCheckedChange={toggle} aria-label={`${locked ? "Unlock" : "Lock"} ${label}`} />
    </div>
  );
}

export function PlaybookLocks() {
  const { data: locks, isLoading } = usePlaybookLocks();
  const lockedCount = locks?.size ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-primary" />
            What the setters can see
            {lockedCount > 0 && (
              <span className="font-mono text-[11px] text-muted-foreground">{lockedCount} locked</span>
            )}
          </CardTitle>
          <CardDescription>
            Switch something off and it disappears for the reps — locked industries collapse to a single line, locked
            sections cannot be opened at all. You still see everything, marked with a lock. Use it to keep week one on
            the two trades they are actually dialling.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="grid gap-x-8 md:grid-cols-2">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-widest text-primary">Industries</p>
                {INDUSTRY_NAMES.map((n) => (
                  <LockRow key={n} label={n} lockKey={industryLockKey(n)} />
                ))}
              </div>
              <div>
                <p className="mb-1 mt-4 font-mono text-[10px] uppercase tracking-widest text-primary md:mt-0">
                  Playbook sections
                </p>
                {SECTIONS.map((s) => (
                  <LockRow key={s.id} label={s.label} lockKey={sectionLockKey(s.id)} />
                ))}
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Locks apply to the whole team, not one rep. Reps can read the lock list but cannot change it — that is
            enforced in the database, not just hidden in the interface.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
