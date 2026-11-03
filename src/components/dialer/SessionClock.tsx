import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Live session timers. The tick lives HERE, in tiny components, not in the
 * dialer page: a page-level 1 s tick re-rendered the whole DialerPage (contact
 * card, log panel, capture panels, CTI wrapper) every second of a session.
 */
export interface SessionTimes {
  isDialing: boolean;
  isSessionPaused: boolean;
  sessionPhaseStartedAt: number | null;
  accumulatedDialingMs: number;
  accumulatedPausedMs: number;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function sessionTotals(t: SessionTimes, now: number) {
  const live = t.sessionPhaseStartedAt ? Math.max(0, now - t.sessionPhaseStartedAt) : 0;
  return {
    dialingMs: t.accumulatedDialingMs + (t.isDialing ? live : 0),
    pausedMs: t.accumulatedPausedMs + (t.isSessionPaused ? live : 0),
  };
}

export function SessionActiveTime({ times, format }: { times: SessionTimes; format: (ms: number) => string }) {
  const now = useNow(times.isDialing);
  return <>{format(sessionTotals(times, now).dialingMs)}</>;
}

export function SessionCallsPerHour({ times, callCount }: { times: SessionTimes; callCount: number }) {
  // Calls per hour moves slowly; a 1 s tick is still cheap at this size.
  const now = useNow(times.isDialing);
  const { dialingMs } = sessionTotals(times, now);
  if (dialingMs <= 60000) return null;
  return (
    <>
      <span className="text-muted-foreground/40">·</span>
      <span className="font-mono text-xs text-foreground tabular-nums">
        <span className="font-bold">{Math.round((callCount / (dialingMs / 3600000)) * 10) / 10}</span>
        <span className="ml-1 text-[10px] uppercase tracking-widest text-muted-foreground">/hr</span>
      </span>
    </>
  );
}

export function SessionPausedBadge({ times, format }: { times: SessionTimes; format: (ms: number) => string }) {
  const now = useNow(times.isSessionPaused);
  if (!times.isSessionPaused) return null;
  return (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-mono text-[10px] uppercase tracking-widest">
      Paused {format(sessionTotals(times, now).pausedMs)}
    </Badge>
  );
}

/** "Ringing · 7s" countdown to the auto no-answer. Ticks itself, not the page. */
export function RingCountdown({ startedAt, totalSeconds }: { startedAt: number; totalSeconds: number }) {
  const now = useNow(true);
  const elapsed = Math.floor((now - startedAt) / 1000);
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
      Ringing · {Math.max(0, totalSeconds - elapsed)}s
    </span>
  );
}
