import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { ConfettiBurst } from "@/components/dashboard/ConfettiBurst";
import { SETTER_2026_MARGINAL_BANDS } from "@/lib/compPlan";
import { cn } from "@/lib/utils";

/** The commission brackets as levels: Warm-up (nothing yet), then Level 1 to 4. */
export const PAY_LEVELS = SETTER_2026_MARGINAL_BANDS.map((b, i) => ({
  name: i === 0 ? "Warm-up" : `Level ${i}`,
  from: b.from,
  rate: b.rate,
}));

/** The level a month's paid first-month retainer cash sits in (0 = Warm-up). */
export function levelOf(retainerPaid: number) {
  let level = 0;
  PAY_LEVELS.forEach((l, i) => {
    if (retainerPaid >= l.from) level = i;
  });
  return level;
}

const money = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;
const pct = (r: number) => `${Math.round(r * 100)}%`;

/** The track runs past the top level so Level 4 has room to fill. */
const TRACK_MAX = PAY_LEVELS[PAY_LEVELS.length - 1].from + 10_000;

function readSeen(key: string) {
  try {
    return Number(window.localStorage.getItem(key) ?? "-1");
  } catch {
    return -1;
  }
}
function writeSeen(key: string, level: number) {
  try {
    window.localStorage.setItem(key, String(level));
  } catch {
    // Private window or blocked storage: no confetti memory, nothing breaks.
  }
}

/** What the loaded (coming, not yet paid) retainer does for the setter's level. */
export function loadedLine(retainerPaid: number, loaded: number) {
  if (loaded <= 0) return null;
  const level = levelOf(retainerPaid);
  const landed = levelOf(retainerPaid + loaded);
  const next = PAY_LEVELS[level + 1];
  if (landed > level) return `${money(loaded)} loaded: once paid you hit ${PAY_LEVELS[landed].name} (${pct(PAY_LEVELS[landed].rate)})`;
  if (next) return `${money(loaded)} loaded: ${money(next.from - retainerPaid - loaded)} more to ${next.name}`;
  return `${money(loaded)} loaded`;
}

/**
 * Commission as a level-up bar: the bar fills with first-month retainer cash
 * paid this month and each bracket is a level. `loaded` is retainer that is
 * coming but not paid (closed and owed, or a verbal yes) and shows in grey
 * after the fill, so a setter can see what will push them up. With
 * `celebrateKey` (one per setter per month) it fires confetti the first time a
 * new level is seen.
 */
export function LevelUpBar({
  retainerPaid,
  loaded = 0,
  compact = false,
  celebrateKey,
}: {
  retainerPaid: number;
  loaded?: number;
  compact?: boolean;
  celebrateKey?: string;
}) {
  const level = levelOf(retainerPaid);
  const current = PAY_LEVELS[level];
  const next = PAY_LEVELS[level + 1];
  const fill = Math.min(retainerPaid, TRACK_MAX) / TRACK_MAX;
  const loadedFill = Math.max(0, Math.min(retainerPaid + loaded, TRACK_MAX) / TRACK_MAX - fill);
  const landed = levelOf(retainerPaid + Math.max(0, loaded));
  const loadedText = loadedLine(retainerPaid, loaded);
  const loadedSegment = (
    <div
      className="absolute left-0 top-0 h-full rounded-full bg-muted-foreground/35 transition-all"
      style={{
        // Runs from 0 under the paid fill, so the grey reads as one piece after it.
        width: `${(fill + loadedFill) * 100}%`,
        backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, hsl(var(--background) / 0.35) 4px 8px)",
      }}
      data-testid="level-loaded"
      aria-hidden="true"
    />
  );
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!celebrateKey) return;
    const seen = readSeen(celebrateKey);
    if (level > 0 && level > seen) {
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 2500);
      writeSeen(celebrateKey, level);
      return () => clearTimeout(t);
    }
    if (seen < 0) writeSeen(celebrateKey, level);
  }, [celebrateKey, level]);

  const status = next ? `${money(next.from - retainerPaid)} to ${next.name} (${pct(next.rate)})` : "Max level: 25% on every retainer dollar";

  if (compact) {
    return (
      <div className="min-w-[180px]">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
          {loadedFill > 0 ? loadedSegment : null}
          <div className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all" style={{ width: `${fill * 100}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{current.name}</span> · {status}
        </div>
        {loadedText ? <div className="text-[11px] text-muted-foreground">{loadedText}</div> : null}
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border border-primary/30 bg-primary/5 p-4">
      {celebrate ? <ConfettiBurst active={celebrate} /> : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className={cn("h-4 w-4", level > 0 ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">
            {current.name}
            {level > 0 ? <span className="font-normal text-muted-foreground"> · earning {pct(current.rate)}</span> : null}
          </span>
          {celebrate ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">Level up!</span> : null}
        </div>
        <span className="text-xs text-muted-foreground">{status}</span>
      </div>
      <div className="relative mt-3 h-3 w-full rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={TRACK_MAX} aria-valuenow={Math.round(retainerPaid)} aria-label="Level-up progress">
        {loadedFill > 0 ? loadedSegment : null}
        <div className="absolute left-0 top-0 h-full rounded-full bg-primary transition-all" style={{ width: `${fill * 100}%` }} />
        {PAY_LEVELS.slice(1).map((l) => (
          <div key={l.from} className="absolute top-0 h-full w-0.5 bg-background" style={{ left: `${(l.from / TRACK_MAX) * 100}%` }} aria-hidden="true" />
        ))}
      </div>
      <div className="relative mt-1 h-8 text-[10px] text-muted-foreground">
        {PAY_LEVELS.slice(1).map((l, i) => (
          <div
            key={l.from}
            className={cn(
              "absolute -translate-x-1/2 text-center leading-tight",
              level >= i + 1 ? "font-semibold text-primary" : landed >= i + 1 && "font-semibold text-foreground/70",
            )}
            style={{ left: `${(l.from / TRACK_MAX) * 100}%` }}
          >
            {pct(l.rate)}
            <br />
            {money(l.from / 1000)}k
          </div>
        ))}
      </div>
      {loadedText ? (
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-2.5 w-4 rounded-sm bg-muted-foreground/35" aria-hidden="true" />
          <span>{loadedText}</span>
        </div>
      ) : null}
    </div>
  );
}
