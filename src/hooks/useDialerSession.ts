import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useClearOwnDialerLeadLocks, useRollingDialerQueue, type DialerFilterOptions } from "@/hooks/useContacts";
import { BOOKED_APPOINTMENT_DEFAULT_TIME } from "@/lib/appointments";
import { CallOutcome } from "@/data/mockData";
import { toast } from "sonner";

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((v) => String(v).padStart(2, "0")).join(":");
}

export interface UseDialerSessionOptions {
  industry: string;
  stateFilter: string;
  filters?: DialerFilterOptions;
}

export function useDialerSession({ industry, stateFilter, filters }: UseDialerSessionOptions) {
  const { user } = useAuth();

  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [followUpTime, setFollowUpTime] = useState(BOOKED_APPOINTMENT_DEFAULT_TIME);
  const [assignedRepId, setAssignedRepId] = useState("");
  const [isDialing, setIsDialing] = useState(false);
  const [isSessionPaused, setIsSessionPaused] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isRecoveringQueue, setIsRecoveringQueue] = useState(false);
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(false);
  const [callCount, setCallCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [sessionOutcomes, setSessionOutcomes] = useState<Partial<Record<CallOutcome, number>>>({});
  const [showSummary, setShowSummary] = useState(false);

  // Session timers
  const [sessionTick, setSessionTick] = useState(() => Date.now());
  const [sessionPhaseStartedAt, setSessionPhaseStartedAt] = useState<number | null>(null);
  const [accumulatedDialingMs, setAccumulatedDialingMs] = useState(0);
  const [accumulatedPausedMs, setAccumulatedPausedMs] = useState(0);

  const leadAdvanceInFlightRef = useRef(false);
  const hasInitializedDialerFiltersRef = useRef(false);

  const queue = useRollingDialerQueue({ industry, state: stateFilter, userId: user?.id, filters });
  const clearOwnDialerLeadLocks = useClearOwnDialerLeadLocks();

  const isSessionActive = isDialing || isSessionPaused;

  const currentContact = currentIndex !== null && currentIndex < queue.contacts.length
    ? queue.contacts[currentIndex]
    : null;
  const nextContact = currentIndex !== null && currentIndex + 1 < queue.contacts.length
    ? queue.contacts[currentIndex + 1]
    : null;

  const liveDialingMs = isDialing && sessionPhaseStartedAt ? Math.max(0, sessionTick - sessionPhaseStartedAt) : 0;
  const livePausedMs = isSessionPaused && sessionPhaseStartedAt ? Math.max(0, sessionTick - sessionPhaseStartedAt) : 0;
  const totalDialingMs = accumulatedDialingMs + liveDialingMs;
  const totalPausedMs = accumulatedPausedMs + livePausedMs;

  const resetLeadState = useCallback((assignedUserId?: string) => {
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
    setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
    setAssignedRepId(assignedUserId || "");
    leadAdvanceInFlightRef.current = false;
  }, []);

  const resetSessionTimers = useCallback(() => {
    setSessionTick(Date.now());
    setSessionPhaseStartedAt(null);
    setAccumulatedDialingMs(0);
    setAccumulatedPausedMs(0);
  }, []);

  // Default assigned rep to current user
  useEffect(() => {
    if (user?.id) setAssignedRepId((c) => c || user.id);
  }, [user?.id]);

  // Session timer tick
  useEffect(() => {
    if (!isSessionActive) return;
    setSessionTick(Date.now());
    const id = window.setInterval(() => setSessionTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isSessionActive]);

  // Prefetch buffer when approaching end
  useEffect(() => {
    if (!isSessionActive || !nextContact?.id) return;
    void queue.ensureBuffer();
  }, [queue.ensureBuffer, isSessionActive, nextContact?.id]);

  // Auto-stop when queue empties
  useEffect(() => {
    if (!isSessionActive || currentIndex === null) return;
    if (queue.contacts.length > 0 && isBootstrappingSession) {
      setIsBootstrappingSession(false);
      return;
    }
    if (queue.contacts.length === 0) {
      if (isBootstrappingSession || queue.isPrefetching) return;
      stopSession();
    } else if (currentIndex >= queue.contacts.length) {
      setCurrentIndex(queue.contacts.length - 1);
    }
  }, [queue.contacts.length, isBootstrappingSession, isSessionActive, currentIndex, queue.isPrefetching]);

  // Reset on filter change outside session
  useEffect(() => {
    if (!hasInitializedDialerFiltersRef.current) {
      hasInitializedDialerFiltersRef.current = true;
      return;
    }
    if (isStartingSession || queue.sessionId) return;
    setCurrentIndex(null);
    setIsSessionPaused(false);
    resetLeadState(user?.id || "");
    resetSessionTimers();
  }, [industry, stateFilter, filters, isStartingSession, queue.sessionId, resetLeadState, resetSessionTimers, user?.id]);

  const startDialing = useCallback(async () => {
    if (isStartingSession) return;
    const now = Date.now();
    setIsStartingSession(true);
    setIsBootstrappingSession(true);
    setIsSessionPaused(false);
    setCallCount(0);
    setSkippedCount(0);
    setSessionOutcomes({});
    setShowSummary(false);
    setSessionTick(now);
    setSessionPhaseStartedAt(now);
    setAccumulatedDialingMs(0);
    setAccumulatedPausedMs(0);
    resetLeadState(user?.id || "");

    try {
      const claimedCount = await queue.startSession();
      if (claimedCount <= 0) {
        setIsDialing(false);
        setCurrentIndex(null);
        setIsBootstrappingSession(false);
        resetSessionTimers();
        await queue.stopSession();
        toast.info("No more leads in queue.");
        return;
      }
      setIsDialing(true);
      setCurrentIndex(0);
      void queue.ensureBuffer();
    } catch (error) {
      setIsDialing(false);
      setCurrentIndex(null);
      setIsBootstrappingSession(false);
      resetSessionTimers();
      await queue.stopSession();
      toast.error(error instanceof Error ? error.message : "Unable to start dialing session.");
    } finally {
      setIsStartingSession(false);
    }
  }, [isStartingSession, queue, resetLeadState, resetSessionTimers, user?.id]);

  const pauseSession = useCallback(async (beforePause?: () => Promise<void>) => {
    if (!isDialing) return;
    if (beforePause) await beforePause();
    const now = Date.now();
    setAccumulatedDialingMs((c) => c + (sessionPhaseStartedAt ? Math.max(0, now - sessionPhaseStartedAt) : 0));
    setSessionTick(now);
    setSessionPhaseStartedAt(now);
    setIsDialing(false);
    setIsSessionPaused(true);
    toast.info("Dialing paused. Resume when you're ready for the next call.");
  }, [isDialing, sessionPhaseStartedAt]);

  const resumeSession = useCallback(() => {
    if (!isSessionPaused) return;
    const now = Date.now();
    setAccumulatedPausedMs((c) => c + (sessionPhaseStartedAt ? Math.max(0, now - sessionPhaseStartedAt) : 0));
    setSessionTick(now);
    setSessionPhaseStartedAt(now);
    setIsSessionPaused(false);
    setIsDialing(true);
    toast.success("Dialing resumed.");
  }, [isSessionPaused, sessionPhaseStartedAt]);

  const stopSession = useCallback(() => {
    if (callCount > 0) setShowSummary(true);
    setIsStartingSession(false);
    setIsBootstrappingSession(false);
    setIsDialing(false);
    setIsSessionPaused(false);
    setCurrentIndex(null);
    resetLeadState(user?.id || "");
    resetSessionTimers();
    void queue.stopSession();
  }, [callCount, queue, resetLeadState, resetSessionTimers, user?.id]);

  const recoverQueue = useCallback(async () => {
    if (!user?.id || isRecoveringQueue) return;
    setIsRecoveringQueue(true);
    setIsStartingSession(false);
    setIsBootstrappingSession(false);
    setIsDialing(false);
    setIsSessionPaused(false);
    setCurrentIndex(null);
    setShowSummary(false);
    setCallCount(0);
    setSkippedCount(0);
    setSessionOutcomes({});
    resetLeadState(user.id);
    resetSessionTimers();

    try {
      await queue.stopSession();
      const clearedCount = await clearOwnDialerLeadLocks.mutateAsync(user.id);
      await queue.refreshPreviewCount();
      toast.success(
        clearedCount > 0
          ? `Recovered queue and cleared ${clearedCount} stuck lead lock${clearedCount === 1 ? "" : "s"}.`
          : "Queue checked — no stuck lead locks were found for your user.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to recover your queue right now.");
    } finally {
      setIsRecoveringQueue(false);
    }
  }, [clearOwnDialerLeadLocks, isRecoveringQueue, queue, resetLeadState, resetSessionTimers, user?.id]);

  const recordOutcome = useCallback((outcome: CallOutcome) => {
    setCallCount((p) => p + 1);
    setSessionOutcomes((p) => ({ ...p, [outcome]: (p[outcome] || 0) + 1 }));
  }, []);

  const incrementSkipped = useCallback(() => {
    setSkippedCount((p) => p + 1);
  }, []);

  return {
    user,
    queue,
    // Lead state
    currentIndex, setCurrentIndex,
    currentContact, nextContact,
    selectedOutcome, setSelectedOutcome,
    notes, setNotes,
    followUpDate, setFollowUpDate,
    followUpTime, setFollowUpTime,
    assignedRepId, setAssignedRepId,
    // Session state
    isDialing, isSessionPaused, isSessionActive,
    isStartingSession, isRecoveringQueue, isBootstrappingSession,
    callCount, skippedCount, sessionOutcomes,
    showSummary, setShowSummary,
    // Timers
    totalDialingMs, totalPausedMs, formatDuration,
    // Refs
    leadAdvanceInFlightRef,
    // Actions
    resetLeadState,
    startDialing, pauseSession, resumeSession, stopSession, recoverQueue,
    recordOutcome, incrementSkipped,
  };
}
