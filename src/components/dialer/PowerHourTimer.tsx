import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flame, Pause, Play, RotateCcw, Target, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POWER_HOUR_DURATION_MS = 60 * 60 * 1000; // 60 minutes

interface PowerHourTimerProps {
  /** Current session call count (from useDialerSession) */
  sessionCallCount: number;
  /** Whether the dialer session is actively running */
  isSessionActive: boolean;
  /** When true, auto-start the Power Hour as soon as the session becomes active. */
  autoStart?: boolean;
  /** Compact horizontal layout for top-of-page banner. */
  compact?: boolean;
}

/**
 * Power Hour Timer — Fanatical Prospecting feature.
 *
 * A dedicated 60-minute countdown that tracks calls/hour in real time.
 * Designed to push reps into a focused, high-intensity calling block
 * where the only goal is maximum dials per hour.
 *
 * Jeb Blount's "Golden Hours" concept: treat your prime calling time
 * like it's worth gold — because it is.
 */
export function PowerHourTimer({ sessionCallCount, isSessionActive, autoStart = false, compact = false }: PowerHourTimerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [callsAtStart, setCallsAtStart] = useState(0);
  const [bestCallsPerHour, setBestCallsPerHour] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("powerHour_bestCPH") ?? "0");
    } catch {
      return 0;
    }
  });

  const startTimeRef = useRef<number | null>(null);
  const pausedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const powerHourCalls = isRunning || isPaused ? sessionCallCount - callsAtStart : 0;
  const remainingMs = Math.max(0, POWER_HOUR_DURATION_MS - elapsedMs);
  const isComplete = isRunning && remainingMs <= 0;
  const progressPct = Math.min((elapsedMs / POWER_HOUR_DURATION_MS) * 100, 100);

  // Calls per hour (projected from current pace)
  const callsPerHour = useMemo(() => {
    if (elapsedMs < 5000) return 0; // Need at least 5s of data
    return Math.round((powerHourCalls / elapsedMs) * POWER_HOUR_DURATION_MS);
  }, [powerHourCalls, elapsedMs]);

  // Format remaining time as MM:SS
  const formattedRemaining = useMemo(() => {
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingMs]);

  // Tick the timer
  useEffect(() => {
    if (!isRunning || isPaused) return;
    tickRef.current = setInterval(() => {
      if (startTimeRef.current === null) return;
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 250);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [isRunning, isPaused]);

  // Auto-complete when time runs out
  useEffect(() => {
    if (isComplete) {
      setIsRunning(false);
      setIsPaused(false);
      if (tickRef.current) clearInterval(tickRef.current);
      // Save personal best
      if (powerHourCalls > bestCallsPerHour) {
        setBestCallsPerHour(powerHourCalls);
        try {
          localStorage.setItem("powerHour_bestCPH", String(powerHourCalls));
        } catch {
          // localStorage unavailable
        }
      }
    }
  }, [isComplete, powerHourCalls, bestCallsPerHour]);

  const startPowerHour = useCallback(() => {
    const now = Date.now();
    startTimeRef.current = now;
    pausedAtRef.current = 0;
    setElapsedMs(0);
    setCallsAtStart(sessionCallCount);
    setIsRunning(true);
    setIsPaused(false);
  }, [sessionCallCount]);

  // Auto-start when session begins (if autoStart prop enabled)
  useEffect(() => {
    if (!autoStart) return;
    if (!isSessionActive) return;
    if (isRunning || isPaused) return;
    if (elapsedMs > 0) return; // already completed this session
    startPowerHour();
  }, [autoStart, isSessionActive, isRunning, isPaused, elapsedMs, startPowerHour]);

  // Auto-reset when session ends so next session can auto-start cleanly
  const wasSessionActiveRef = useRef(isSessionActive);
  useEffect(() => {
    if (wasSessionActiveRef.current && !isSessionActive) {
      // Session ended — clear power hour state
      setIsRunning(false);
      setIsPaused(false);
      setElapsedMs(0);
      setCallsAtStart(0);
      startTimeRef.current = null;
      pausedAtRef.current = 0;
      if (tickRef.current) clearInterval(tickRef.current);
    }
    wasSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  const pausePowerHour = useCallback(() => {
    setIsPaused(true);
    pausedAtRef.current = Date.now();
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const resumePowerHour = useCallback(() => {
    if (startTimeRef.current !== null && pausedAtRef.current > 0) {
      const pauseDuration = Date.now() - pausedAtRef.current;
      startTimeRef.current += pauseDuration;
    }
    pausedAtRef.current = 0;
    setIsPaused(false);
  }, []);

  const resetPowerHour = useCallback(() => {
    setIsRunning(false);
    setIsPaused(false);
    setElapsedMs(0);
    setCallsAtStart(0);
    startTimeRef.current = null;
    pausedAtRef.current = 0;
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  // Intensity colour based on calls/hour pace
  const intensityColor = useMemo(() => {
    if (callsPerHour >= 40) return "text-green-500";
    if (callsPerHour >= 25) return "text-yellow-500";
    if (callsPerHour >= 15) return "text-orange-500";
    return "text-red-500";
  }, [callsPerHour]);

  const intensityLabel = useMemo(() => {
    if (callsPerHour >= 40) return "Crushing It";
    if (callsPerHour >= 25) return "Solid Pace";
    if (callsPerHour >= 15) return "Pick It Up";
    return "Get Dialling";
  }, [callsPerHour]);

  // Not active — show start button
  if (!isRunning && !isPaused && elapsedMs === 0) {
    // In compact (top-banner) mode, hide entirely until running
    if (compact) return null;
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="h-4 w-4 text-orange-500" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Power Hour
          </h3>
          {bestCallsPerHour > 0 && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
              <Trophy className="h-3 w-3 text-yellow-500" />
              PB: {bestCallsPerHour} calls/hr
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          60 minutes of focused, high-intensity dialling. No distractions. Maximum dials.
          Beat your personal best.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full border-orange-500/30 text-orange-500 hover:bg-orange-500/10"
          onClick={startPowerHour}
          disabled={!isSessionActive}
        >
          <Flame className="h-4 w-4 mr-2" />
          Start Power Hour
        </Button>
        {!isSessionActive && (
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Start a dialling session first to activate Power Hour.
          </p>
        )}
      </div>
    );
  }

  // Completed state
  if (!isRunning && !isPaused && elapsedMs > 0) {
    if (compact) return null;
    return (
      <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-yellow-500" />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Power Hour Complete
          </h3>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center">
            <div className="text-2xl font-black font-mono text-foreground">{powerHourCalls}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Total Calls</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black font-mono text-foreground">{callsPerHour}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Calls/Hour</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-black font-mono text-yellow-500">{bestCallsPerHour}</div>
            <div className="text-[9px] text-muted-foreground uppercase">Personal Best</div>
          </div>
        </div>
        {powerHourCalls >= bestCallsPerHour && powerHourCalls > 0 && (
          <div className="text-center text-xs font-bold text-yellow-500 mb-3">
            New Personal Best!
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={resetPowerHour}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset
        </Button>
      </div>
    );
  }

  // Active / paused state
  if (compact) {
    return (
      <div className={cn(
        "rounded-lg border px-4 py-2.5 transition-all",
        isPaused
          ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-orange-500/30 bg-orange-500/5",
      )}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className={cn("h-4 w-4 shrink-0", isPaused ? "text-yellow-500" : "text-orange-500 animate-pulse")} />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold whitespace-nowrap">
              {isPaused ? "Paused" : "Power Hour"}
            </span>
          </div>

          <div className="font-mono text-2xl font-black text-foreground tabular-nums">
            {formattedRemaining}
          </div>

          <div className="flex-1 min-w-[80px] h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-orange-500" />
              <span className="font-mono font-black text-foreground">{powerHourCalls}</span>
              <span className="text-[10px] uppercase text-muted-foreground tracking-wider">calls</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Target className={cn("h-3.5 w-3.5", intensityColor)} />
              <span className={cn("font-mono font-black", intensityColor)}>{callsPerHour}</span>
              <span className="text-[10px] uppercase text-muted-foreground tracking-wider">/hr</span>
            </div>
            <div className="hidden md:flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              <span className="font-mono font-black text-yellow-500">{bestCallsPerHour}</span>
              <span className="text-[10px] uppercase text-muted-foreground tracking-wider">PB</span>
            </div>
          </div>

          <div className="flex gap-1">
            {isPaused ? (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={resumePowerHour}>
                <Play className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={pausePowerHour}>
                <Pause className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={resetPowerHour}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-lg border p-4 transition-all",
      isPaused
        ? "border-yellow-500/30 bg-yellow-500/5"
        : "border-orange-500/30 bg-orange-500/5",
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className={cn("h-4 w-4", isPaused ? "text-yellow-500" : "text-orange-500 animate-pulse")} />
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            {isPaused ? "Power Hour Paused" : "Power Hour Active"}
          </h3>
        </div>
        <div className="flex gap-1">
          {isPaused ? (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={resumePowerHour}>
              <Play className="h-3 w-3" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={pausePowerHour}>
              <Pause className="h-3 w-3" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={resetPowerHour}>
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Countdown */}
      <div className="text-center mb-3">
        <div className="text-4xl font-black font-mono text-foreground tracking-tight">
          {formattedRemaining}
        </div>
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
          Remaining
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-secondary mb-4 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Zap className="h-3 w-3 text-orange-500" />
            <span className="text-xl font-black font-mono">{powerHourCalls}</span>
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Calls</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Target className={cn("h-3 w-3", intensityColor)} />
            <span className={cn("text-xl font-black font-mono", intensityColor)}>
              {callsPerHour}
            </span>
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">Calls/Hr</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Trophy className="h-3 w-3 text-yellow-500" />
            <span className="text-xl font-black font-mono text-yellow-500">{bestCallsPerHour}</span>
          </div>
          <div className="text-[9px] text-muted-foreground uppercase">PB</div>
        </div>
      </div>

      {/* Intensity label */}
      <div className={cn("text-center text-xs font-bold mt-3", intensityColor)}>
        {intensityLabel}
      </div>
    </div>
  );
}
