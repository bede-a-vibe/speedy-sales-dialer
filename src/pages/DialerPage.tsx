import { forwardRef, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, CheckCircle2, Loader2, Pause, Phone, PhoneCall, Play, RotateCcw, SkipForward, UserRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { DailyTarget } from "@/components/DailyTarget";
import { OutcomeButton } from "@/components/OutcomeButton";
import InlineBookingEmbed from "@/components/dialer/InlineBookingEmbed";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCallLog } from "@/hooks/useCallLogs";
import { useClearOwnDialerLeadLocks, useRollingDialerQueue, useUpdateContact } from "@/hooks/useContacts";
import { useAuth } from "@/hooks/useAuth";
import { useDialpadCall, useDialpadCallStatus, useCancelDialpadCall, useLinkDialpadCallLog, useDialpadCallerIds, useResolveDialpadCall, useForceHangupCall } from "@/hooks/useDialpad";
import { useMyDialpadSettings } from "@/hooks/useDialpadSettings";
import { useCreatePipelineItem, useSalesReps } from "@/hooks/usePipelineItems";
import { BOOKED_APPOINTMENT_DEFAULT_TIME } from "@/lib/appointments";
import { cn } from "@/lib/utils";
import { CallOutcome, INDUSTRIES } from "@/data/mockData";
import { toast } from "sonner";

const AUSTRALIAN_STATE_OPTIONS = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const loadDialpadSyncPanel = () =>
  import("@/components/dialer/DialpadSyncPanel").then((module) => ({ default: module.default ?? module.DialpadSyncPanel }));
const loadSessionSummaryDialog = () =>
  import("@/components/dialer/SessionSummaryDialog").then((module) => ({ default: module.default ?? module.SessionSummaryDialog }));

const DialpadSyncPanel = lazy(loadDialpadSyncPanel);
const SessionSummaryDialog = lazy(loadSessionSummaryDialog);

function combineDateAndTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

function getRepLabel(displayName: string | null, email: string | null) {
  return displayName?.trim() || email || "Unknown rep";
}

function getDialRequestStorageKey(requestKey: string) {
  return `dialpad-request:${requestKey}`;
}

function hasActiveDialRequestLock(requestKey: string, maxAgeMs = 45000) {
  if (typeof window === "undefined") return false;

  const rawValue = window.sessionStorage.getItem(getDialRequestStorageKey(requestKey));
  if (!rawValue) return false;

  const timestamp = Number(rawValue);
  if (!Number.isFinite(timestamp) || Date.now() - timestamp > maxAgeMs) {
    window.sessionStorage.removeItem(getDialRequestStorageKey(requestKey));
    return false;
  }

  return true;
}

function setActiveDialRequestLock(requestKey: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(getDialRequestStorageKey(requestKey), String(Date.now()));
}

function clearActiveDialRequestLock(requestKey: string | null) {
  if (typeof window === "undefined" || !requestKey) return;
  window.sessionStorage.removeItem(getDialRequestStorageKey(requestKey));
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

const PanelSkeleton = forwardRef<HTMLDivElement, { height?: string }>(({ height = "h-40" }, ref) => {
  return (
    <div ref={ref} className="rounded-lg border border-border bg-card p-4">
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className={cn("w-full", height)} />
      </div>
    </div>
  );
});

PanelSkeleton.displayName = "PanelSkeleton";

export default function DialerPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [industry, setIndustry] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [followUpTime, setFollowUpTime] = useState("09:00");
  const [assignedRepId, setAssignedRepId] = useState("");
  const [isBookedDateAutoDetected, setIsBookedDateAutoDetected] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [isSessionPaused, setIsSessionPaused] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isRecoveringQueue, setIsRecoveringQueue] = useState(false);
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(false);
  const [callCount, setCallCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [sessionOutcomes, setSessionOutcomes] = useState<Partial<Record<CallOutcome, number>>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [activeDialpadCallId, setActiveDialpadCallId] = useState<string | null>(null);
  const [activeDialpadCallState, setActiveDialpadCallState] = useState<string | null>(null);
  const [dialpadPollingBackoffUntil, setDialpadPollingBackoffUntil] = useState<number | null>(null);
  const [rapidStatusPollingUntil, setRapidStatusPollingUntil] = useState<number | null>(null);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [isCallResolving, setIsCallResolving] = useState(false);
  const [selectedCallerId, setSelectedCallerId] = useState<string>("");
  const [sessionTick, setSessionTick] = useState(() => Date.now());
  const [sessionPhaseStartedAt, setSessionPhaseStartedAt] = useState<number | null>(null);
  const [accumulatedDialingMs, setAccumulatedDialingMs] = useState(0);
  const [accumulatedPausedMs, setAccumulatedPausedMs] = useState(0);
  const activeDialRequestRef = useRef<string | null>(null);
  const leadAdvanceInFlightRef = useRef(false);
  const hasInitializedDialerFiltersRef = useRef(false);

  const {
    contacts: visibleUncalledContacts,
    totalCount: totalQueueCount,
    sessionId,
    isLoading,
    isPrefetching,
    startSession: startQueueSession,
    stopSession: stopQueueSession,
    ensureBuffer,
    discardContact,
    refreshPreviewCount,
  } = useRollingDialerQueue({ industry, state: stateFilter, userId: user?.id });
  const { data: salesReps = [] } = useSalesReps();
  const updateContact = useUpdateContact();
  const clearOwnDialerLeadLocks = useClearOwnDialerLeadLocks();
  const createCallLog = useCreateCallLog();
  const createPipelineItem = useCreatePipelineItem();
  const { data: myDialpadSettings } = useMyDialpadSettings();
  const { data: callerIdOptions = [] } = useDialpadCallerIds(myDialpadSettings?.dialpad_user_id);
  const dialpadCall = useDialpadCall();
  const { mutateAsync: fetchDialpadCallStatus, isPending: isDialpadCallStatusPending } = useDialpadCallStatus();
  const cancelDialpadCall = useCancelDialpadCall();
  const resolveDialpadCall = useResolveDialpadCall();
  const forceHangupCall = useForceHangupCall();
  const linkDialpadCallLog = useLinkDialpadCallLog();

  const isSessionActive = isDialing || isSessionPaused;
  const queueLeadCount = useMemo(
    () => Math.max(totalQueueCount, visibleUncalledContacts.length),
    [totalQueueCount, visibleUncalledContacts.length],
  );

  const currentContact = currentIndex !== null && currentIndex < visibleUncalledContacts.length
    ? visibleUncalledContacts[currentIndex]
    : null;
  const nextContact = currentIndex !== null && currentIndex + 1 < visibleUncalledContacts.length
    ? visibleUncalledContacts[currentIndex + 1]
    : null;

  const hasDialpadAssignment = Boolean(myDialpadSettings?.dialpad_user_id);
  const hasUnresolvedDialpadCall = !activeDialpadCallId
    && (isCallResolving || activeDialpadCallState === "connecting" || activeDialpadCallState === "calling" || activeDialpadCallState === "ringing");
  const isCallTerminal = (!activeDialpadCallId && !hasUnresolvedDialpadCall) || activeDialpadCallState === "hangup";
  const requiresPipelineAssignment = selectedOutcome === "follow_up" || selectedOutcome === "booked";
  const requiresFollowUpSchedule = selectedOutcome === "follow_up";
  const requiresBookedSchedule = selectedOutcome === "booked";
  const requiresAnySchedule = requiresFollowUpSchedule || requiresBookedSchedule;
  const liveDialingMs = isDialing && sessionPhaseStartedAt ? Math.max(0, sessionTick - sessionPhaseStartedAt) : 0;
  const livePausedMs = isSessionPaused && sessionPhaseStartedAt ? Math.max(0, sessionTick - sessionPhaseStartedAt) : 0;
  const totalDialingMs = accumulatedDialingMs + liveDialingMs;
  const totalPausedMs = accumulatedPausedMs + livePausedMs;
  const canSubmit = !!selectedOutcome
    && isCallTerminal
    && !hasUnresolvedDialpadCall
    && (!requiresPipelineAssignment || !!assignedRepId)
    && (!requiresAnySchedule || !!followUpDate)
    && (!requiresFollowUpSchedule || !!followUpTime)
    && !isEndingCall
    && !createCallLog.isPending
    && !createPipelineItem.isPending
    && !dialpadCall.isPending
    && !linkDialpadCallLog.isPending;
  const primaryActionLabel = hasUnresolvedDialpadCall
    ? "Connecting to Dialpad…"
    : requiresBookedSchedule
      ? (isSessionPaused ? "Booked & Hold Session" : "Booked & Next Lead")
      : (isCallTerminal ? (isSessionPaused ? "Log & Hold Session" : "Log & Next Lead") : "End or wait for call to finish before logging");

  useEffect(() => {
    if (user?.id) {
      setAssignedRepId((current) => current || user.id);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!requiresPipelineAssignment && user?.id) {
      setAssignedRepId(user.id);
    }
    if (!requiresAnySchedule) {
      setFollowUpDate(undefined);
      setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
    }
    if (!requiresBookedSchedule) {
      setIsBookedDateAutoDetected(false);
    }
  }, [requiresAnySchedule, requiresBookedSchedule, requiresPipelineAssignment, user?.id]);

  useEffect(() => {
    if (!isSessionActive) return;

    void loadDialpadSyncPanel();
    void loadSessionSummaryDialog();
  }, [isSessionActive]);

  useEffect(() => {
    if (!isSessionActive || !nextContact?.id) return;
    void ensureBuffer();
  }, [ensureBuffer, isSessionActive, nextContact?.id]);

  useEffect(() => {
    if (!isSessionActive) return;

    setSessionTick(Date.now());
    const intervalId = window.setInterval(() => {
      setSessionTick(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isSessionActive]);

  const resetLeadState = useCallback((assignedUserId?: string) => {
    clearActiveDialRequestLock(activeDialRequestRef.current);
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
    setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
    setAssignedRepId(assignedUserId || "");
    setIsBookedDateAutoDetected(false);
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setRapidStatusPollingUntil(null);
    setIsEndingCall(false);
    setIsCallResolving(false);
    leadAdvanceInFlightRef.current = false;
    activeDialRequestRef.current = null;
  }, []);

  const resetSessionTimers = useCallback(() => {
    setSessionTick(Date.now());
    setSessionPhaseStartedAt(null);
    setAccumulatedDialingMs(0);
    setAccumulatedPausedMs(0);
  }, []);

  const handleBookedDateDetected = useCallback((date: Date) => {
    setFollowUpDate((current) => {
      const currentKey = current ? format(current, "yyyy-MM-dd") : null;
      const nextKey = format(date, "yyyy-MM-dd");

      if (currentKey === nextKey && isBookedDateAutoDetected) {
        return current;
      }

      toast.success(`Booked date detected: ${format(date, "PPP")}`);
      return date;
    });
    setIsBookedDateAutoDetected(true);
  }, [isBookedDateAutoDetected]);

  useEffect(() => {
    if (!hasInitializedDialerFiltersRef.current) {
      hasInitializedDialerFiltersRef.current = true;
      return;
    }

    if (isStartingSession || sessionId) return;

    setCurrentIndex(null);
    setIsSessionPaused(false);
    resetLeadState(user?.id || "");
    resetSessionTimers();
  }, [industry, isStartingSession, resetLeadState, resetSessionTimers, sessionId, stateFilter, user?.id]);

  const startDialing = useCallback(async () => {
    if (!hasDialpadAssignment || isStartingSession) return;

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
      console.log("[Dialer] startDialing: industry=", industry, "state=", stateFilter, "user=", user?.id);
      const claimedCount = await startQueueSession();
      console.log("[Dialer] startDialing: claimedCount=", claimedCount);
      if (claimedCount <= 0) {
        setIsDialing(false);
        setCurrentIndex(null);
        setIsBootstrappingSession(false);
        resetSessionTimers();
        await stopQueueSession();
        toast.info("No more leads in queue.");
        console.warn("[Dialer] No leads claimed. Filters: industry=", industry, "state=", stateFilter);
        return;
      }

      setIsDialing(true);
      setCurrentIndex(0);
      void loadDialpadSyncPanel();
      void loadSessionSummaryDialog();
      void ensureBuffer();
    } catch (error) {
      setIsDialing(false);
      setCurrentIndex(null);
      setIsBootstrappingSession(false);
      resetSessionTimers();
      await stopQueueSession();
      const message = error instanceof Error ? error.message : "Unable to start dialing session.";
      toast.error(message);
    } finally {
      setIsStartingSession(false);
    }
  }, [ensureBuffer, hasDialpadAssignment, isStartingSession, resetLeadState, resetSessionTimers, startQueueSession, stopQueueSession, user?.id]);

  const pauseSession = useCallback(async () => {
    if (!isDialing) return;

    // Cancel any active Dialpad call when pausing
    if (activeDialpadCallId && activeDialpadCallState !== "hangup") {
      setIsEndingCall(true);
      try {
        await cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId });
      } catch {
        // Continue pausing even if cancel fails
      } finally {
        setIsEndingCall(false);
      }
    }

    const now = Date.now();
    setAccumulatedDialingMs((current) => current + (sessionPhaseStartedAt ? Math.max(0, now - sessionPhaseStartedAt) : 0));
    setSessionTick(now);
    setSessionPhaseStartedAt(now);
    setIsDialing(false);
    setIsSessionPaused(true);
    toast.info("Dialing paused. Resume when you're ready for the next call.");
  }, [isDialing, sessionPhaseStartedAt, activeDialpadCallId, activeDialpadCallState, cancelDialpadCall]);

  const resumeSession = useCallback(() => {
    if (!isSessionPaused) return;

    const now = Date.now();
    setAccumulatedPausedMs((current) => current + (sessionPhaseStartedAt ? Math.max(0, now - sessionPhaseStartedAt) : 0));
    setSessionTick(now);
    setSessionPhaseStartedAt(now);
    setIsSessionPaused(false);
    setIsDialing(true);
    toast.success("Dialing resumed.");
  }, [isSessionPaused, sessionPhaseStartedAt]);

  const stopSession = useCallback(() => {
    if (callCount > 0) {
      setShowSummary(true);
    }
    setIsStartingSession(false);
    setIsBootstrappingSession(false);
    setIsDialing(false);
    setIsSessionPaused(false);
    setCurrentIndex(null);
    resetLeadState(user?.id || "");
    resetSessionTimers();
    void stopQueueSession();
  }, [callCount, resetLeadState, resetSessionTimers, stopQueueSession, user?.id]);

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
      await stopQueueSession();
      const clearedCount = await clearOwnDialerLeadLocks.mutateAsync(user.id);
      await refreshPreviewCount();
      toast.success(
        clearedCount > 0
          ? `Recovered queue and cleared ${clearedCount} stuck lead lock${clearedCount === 1 ? "" : "s"}.`
          : "Queue checked — no stuck lead locks were found for your user.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to recover your queue right now.";
      toast.error(message);
    } finally {
      setIsRecoveringQueue(false);
    }
  }, [clearOwnDialerLeadLocks, isRecoveringQueue, refreshPreviewCount, resetLeadState, resetSessionTimers, stopQueueSession, user?.id]);


  const logAndNext = useCallback(async (outcomeOverride?: CallOutcome) => {
    const outcomeToLog = outcomeOverride ?? selectedOutcome;
    if (!outcomeToLog || !currentContact || !user || leadAdvanceInFlightRef.current) return;

    if (outcomeToLog === "follow_up" && (!followUpDate || !followUpTime)) {
      toast.error("Choose a follow-up date and time.");
      return;
    }

    if (outcomeToLog === "booked" && !followUpDate) {
      toast.error("Choose an appointment day.");
      return;
    }

    const needsPipelineAssignment = outcomeToLog === "follow_up" || outcomeToLog === "booked";
    if (needsPipelineAssignment && !assignedRepId) {
      toast.error("Choose a sales rep.");
      return;
    }

    leadAdvanceInFlightRef.current = true;

    // Hang up any active Dialpad call before logging
    if (activeDialpadCallId && activeDialpadCallState !== "hangup") {
      try {
        await cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId });
      } catch {
        // Continue logging even if hangup fails
      }
    }

    try {
      const scheduledFor = followUpDate
        ? combineDateAndTime(followUpDate, outcomeToLog === "follow_up" ? followUpTime : BOOKED_APPOINTMENT_DEFAULT_TIME).toISOString()
        : null;

      // CRITICAL: Update contact status BEFORE releasing the lock or claiming
      // new leads, otherwise the contact can be re-claimed while still "uncalled".
      const [insertedLog] = await Promise.all([
        createCallLog.mutateAsync({
          contact_id: currentContact.id,
          user_id: user.id,
          outcome: outcomeToLog,
          notes: notes || undefined,
          follow_up_date: scheduledFor,
          dialpad_call_id: activeDialpadCallId,
        }),
        updateContact.mutateAsync({
          id: currentContact.id,
          // Terminal outcomes remove the lead from the dialer permanently.
          // Recyclable outcomes (no_answer, voicemail, not_interested, wrong_number)
          // keep status as 'uncalled' so the lead re-enters the queue with an
          // incremented call_attempt_count.
          status: ["dnc", "follow_up", "booked"].includes(outcomeToLog) ? outcomeToLog : "uncalled",
          last_outcome: outcomeToLog,
          is_dnc: outcomeToLog === "dnc",
        }),
      ]);

      const nextLength = visibleUncalledContacts.length - 1;
      void discardContact(currentContact.id, { releaseLock: true });
      if (nextLength <= 0) {
        setCurrentIndex(null);
      } else if (currentIndex !== null && currentIndex >= nextLength) {
        setCurrentIndex(nextLength - 1);
      }
      resetLeadState(user.id);
      void ensureBuffer();

      await Promise.all([
        activeDialpadCallId
          ? linkDialpadCallLog.mutateAsync({
              dialpad_call_id: activeDialpadCallId,
              call_log_id: insertedLog.id,
            })
          : Promise.resolve(),
        needsPipelineAssignment
          ? createPipelineItem.mutateAsync({
              contact_id: currentContact.id,
              source_call_log_id: insertedLog.id,
              pipeline_type: outcomeToLog === "follow_up" ? "follow_up" : "booked",
              assigned_user_id: assignedRepId,
              created_by: user.id,
              scheduled_for: scheduledFor,
              notes,
            })
          : Promise.resolve(),
      ]);

      setCallCount((prev) => prev + 1);
      setSessionOutcomes((prev) => ({
        ...prev,
        [outcomeToLog]: (prev[outcomeToLog] || 0) + 1,
      }));

      toast.success(`Logged: ${outcomeToLog.replace(/_/g, " ")}`);

      if (nextLength <= 0) {
        stopSession();
      }
    } catch {
      leadAdvanceInFlightRef.current = false;
      toast.error("Failed to log call. Try again.");
    }
  }, [
    activeDialpadCallId,
    activeDialpadCallState,
    assignedRepId,
    cancelDialpadCall,
    createCallLog,
    createPipelineItem,
    currentContact,
    currentIndex,
    discardContact,
    ensureBuffer,
    followUpDate,
    followUpTime,
    linkDialpadCallLog,
    notes,
    selectedOutcome,
    stopSession,
    updateContact,
    user,
    visibleUncalledContacts.length,
    resetLeadState,
  ]);

  const cancelActiveCall = useCallback(async () => {
    setIsEndingCall(true);
    setActiveDialpadCallState((current) => (current === "hangup" ? current : "ending"));
    setRapidStatusPollingUntil(Date.now() + 10000);

    try {
      // If we have a call ID, use the normal hangup
      if (activeDialpadCallId) {
        const result = await cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId });
        setActiveDialpadCallState(result.state ?? "ending");

        if (result.already_ended || result.terminal) {
          setActiveDialpadCallId(null);
          setActiveDialpadCallState("hangup");
          setDialpadPollingBackoffUntil(null);
          setRapidStatusPollingUntil(null);
          setIsCallResolving(false);
          toast.info("This call has already ended.");
          return;
        }

        toast.success(result.message || "Call cancellation requested.");
      } else if (myDialpadSettings?.dialpad_user_id && currentContact?.phone) {
        // No call ID yet (resolving state) — use force hangup by user+phone
        const result = await forceHangupCall.mutateAsync({
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          phone: currentContact.phone,
        });

        setActiveDialpadCallId(null);
        setActiveDialpadCallState("hangup");
        setDialpadPollingBackoffUntil(null);
        setRapidStatusPollingUntil(null);
        setIsCallResolving(false);
        toast.success(result.message || "Call ended.");
      } else {
        toast.info("No active call to cancel.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to cancel the active call.";
      const normalized = message.toLowerCase();

      if (normalized.includes("rate limit")) {
        setDialpadPollingBackoffUntil(Date.now() + 10000);
      }

      if (normalized.includes("no endpoint found")) {
        toast.info("Ending call… waiting for Dialpad to release it.");
        return;
      }

      toast.error(message);
    } finally {
      setIsEndingCall(false);
    }
  }, [activeDialpadCallId, cancelDialpadCall, forceHangupCall, myDialpadSettings, currentContact]);

  const skipLead = useCallback(async () => {
    if (currentIndex === null || !currentContact) return;

    // End any active or still-linking Dialpad call before skipping.
    if (!isCallTerminal) {
      try {
        await cancelActiveCall();
      } catch {
        // Continue with skip even if cancel fails
      }
    }

    // Bump call_attempt_count so this lead rotates to the back of the queue
    void updateContact.mutateAsync({
      id: currentContact.id,
      call_attempt_count: (currentContact.call_attempt_count ?? 0) + 1,
    }).catch(() => {});

    const nextLength = visibleUncalledContacts.length - 1;
    void discardContact(currentContact.id, { releaseLock: true });
    setSkippedCount((prev) => prev + 1);
    resetLeadState(user?.id || "");
    void ensureBuffer();

    if (nextLength <= 0) {
      toast.info("No more leads in queue.");
      stopSession();
      return;
    }

    if (currentIndex >= nextLength) {
      setCurrentIndex(nextLength - 1);
    }
  }, [cancelActiveCall, currentContact, currentIndex, discardContact, ensureBuffer, isCallTerminal, resetLeadState, stopSession, updateContact, user?.id, visibleUncalledContacts.length]);

  useEffect(() => {
    if (!isSessionActive || !currentContact) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
      const outcomes: CallOutcome[] = [
        "no_answer", "voicemail", "not_interested", "dnc",
        "follow_up", "booked",
      ];
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < outcomes.length) {
        setSelectedOutcome(outcomes[idx]);
      }
      if (e.key === "Enter" && canSubmit) {
        e.preventDefault();
        void logAndNext();
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skipLead();
      }
      if ((e.key === "p" || e.key === "P") && isCallTerminal) {
        e.preventDefault();
        if (isDialing) {
          pauseSession();
        } else if (isSessionPaused) {
          resumeSession();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canSubmit, currentContact, isCallTerminal, isDialing, isSessionActive, isSessionPaused, logAndNext, pauseSession, resumeSession, skipLead]);

  const outcomes: CallOutcome[] = [
    "no_answer", "voicemail", "not_interested", "dnc",
    "follow_up", "booked", "wrong_number",
  ];

  useEffect(() => {
    if (!isSessionActive || currentIndex === null) return;

    if (visibleUncalledContacts.length > 0 && isBootstrappingSession) {
      setIsBootstrappingSession(false);
      return;
    }

    if (visibleUncalledContacts.length === 0) {
      if (isBootstrappingSession || isPrefetching) return;
      stopSession();
    } else if (currentIndex >= visibleUncalledContacts.length) {
      setCurrentIndex(visibleUncalledContacts.length - 1);
    }
  }, [visibleUncalledContacts.length, isBootstrappingSession, isSessionActive, currentIndex, isPrefetching, stopSession]);

  useEffect(() => {
    if (!isDialing || isSessionPaused || !currentContact || !myDialpadSettings?.dialpad_user_id) return;

    const requestKey = `${currentContact.id}:${currentContact.phone}`;
    if (
      activeDialRequestRef.current === requestKey
      || hasActiveDialRequestLock(requestKey)
      || dialpadCall.isPending
    ) {
      return;
    }

    activeDialRequestRef.current = requestKey;
    setActiveDialRequestLock(requestKey);
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    setIsCallResolving(false);
    leadAdvanceInFlightRef.current = false;

    const attemptDial = async (retriesLeft: number, isFirstAttempt: boolean): Promise<void> => {
      if (isFirstAttempt) {
        await new Promise((r) => setTimeout(r, 500));
      }

      try {
        const response = await dialpadCall.mutateAsync({
          phone: currentContact.phone,
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          contact_id: currentContact.id,
          caller_id: selectedCallerId || undefined,
        });

        if (response.dialpad_call_id) {
          setActiveDialpadCallId(response.dialpad_call_id);
          setActiveDialpadCallState(response.state ?? "calling");
          setRapidStatusPollingUntil(Date.now() + 10000);
          setIsCallResolving(false);
        } else {
          setIsCallResolving(true);
          setActiveDialpadCallState(response.state ?? "connecting");
          setRapidStatusPollingUntil(Date.now() + 10000);
          toast.info("Call placed — linking the live Dialpad call in the dialer…");
          return;
        }

        toast.success(
          response.message === "Existing Dialpad call is already active for this lead."
            ? response.message
            : `Calling ${currentContact.phone} through Dialpad`,
        );

        if (response.tracking_warning) {
          toast.warning("Call placed, but transcript tracking needs attention.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
        const normalized = message.toLowerCase();
        const is409 = message.includes("409") || normalized.includes("already being created") || normalized.includes("still active");
        const is429 = message.includes("429") || normalized.includes("rate_limit") || normalized.includes("rate limit");
        const isAlreadyOnCall = normalized.includes("currently on a call");
        const isRetryable = is409 || is429;

        if (isAlreadyOnCall) {
          console.log("[Dialer] User already on a call — entering resolution mode");
          setIsCallResolving(true);
          setActiveDialpadCallState("connecting");
          setRapidStatusPollingUntil(Date.now() + 10000);
          toast.info("Dialpad reports an active call — linking it in the dialer…");
          return;
        }

        if (isRetryable && retriesLeft > 0) {
          const delay = is429 ? 2500 : 1500;
          console.warn(`[Dialer] ${is429 ? "Rate limited" : "409 conflict"}, retrying in ${delay}ms (${retriesLeft} left)`);
          await new Promise((r) => setTimeout(r, delay));
          return attemptDial(retriesLeft - 1, false);
        }

        clearActiveDialRequestLock(requestKey);
        activeDialRequestRef.current = null;
        setActiveDialpadCallId(null);
        setActiveDialpadCallState(null);
        setIsCallResolving(false);
        toast.error(message);
      }
    };

    void attemptDial(2, true);
  }, [isDialing, isSessionPaused, currentContact, myDialpadSettings?.dialpad_user_id, dialpadCall]);

  useEffect(() => {
    if (!isCallResolving || activeDialpadCallId || !currentContact || !myDialpadSettings?.dialpad_user_id) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempt = 0;
    const MAX_ATTEMPTS = 20;
    const pollDelays = [150, 300, 500, 750, 1000, 1250, 1500, 2000, 2000, 2500, 2500, 3000];

    const attemptResolve = async () => {
      try {
        const result = await resolveDialpadCall.mutateAsync({
          phone: currentContact.phone,
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          contact_id: currentContact.id,
        });

        if (cancelled) return;

        if (result.dialpad_call_id) {
          setActiveDialpadCallId(result.dialpad_call_id);
          setActiveDialpadCallState(result.state ?? "calling");
          setRapidStatusPollingUntil(Date.now() + 10000);
          setIsCallResolving(false);
          toast.success("Active call linked to the dialer.");
          return;
        }
      } catch {
        // Keep retrying while Dialpad finishes exposing the live call.
      }

      if (!cancelled) {
        if (attempt >= MAX_ATTEMPTS) {
          // Dialpad never exposed the call — stop linking spinner and show as live (untracked)
          console.warn("[Dialer] Resolution polling exhausted — marking call as live (untracked)");
          setIsCallResolving(false);
          setActiveDialpadCallState("live");
          toast.warning("Call is live but couldn't be linked to Dialpad tracking.");
          return;
        }
        const nextDelay = pollDelays[Math.min(attempt, pollDelays.length - 1)];
        attempt += 1;
        timeoutId = window.setTimeout(attemptResolve, nextDelay);
      }
    };

    timeoutId = window.setTimeout(attemptResolve, pollDelays[0]);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeDialpadCallId, currentContact, isCallResolving, myDialpadSettings?.dialpad_user_id, resolveDialpadCall]);

  useEffect(() => {
    if (!activeDialpadCallId) return;

    let cancelled = false;
    let isRequestInFlight = false;

    const pollStatus = async () => {
      if (cancelled || isRequestInFlight) return;
      if (dialpadPollingBackoffUntil && dialpadPollingBackoffUntil > Date.now()) return;
      isRequestInFlight = true;

      try {
        const status = await fetchDialpadCallStatus(activeDialpadCallId);
        if (cancelled) return;

        setActiveDialpadCallState(status.state);

        if (status.terminal) {
          setActiveDialpadCallId(null);
          setDialpadPollingBackoffUntil(null);
          setRapidStatusPollingUntil(null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("rate limit")) {
          setDialpadPollingBackoffUntil(Date.now() + 10000);
        }
      } finally {
        isRequestInFlight = false;
      }
    };

    void pollStatus();
    const intervalMs = rapidStatusPollingUntil && rapidStatusPollingUntil > Date.now() ? 2000 : 6000;
    const intervalId = window.setInterval(pollStatus, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeDialpadCallId, dialpadPollingBackoffUntil, fetchDialpadCallStatus, rapidStatusPollingUntil]);


  return (
    <AppLayout title="Dialer">
      <div className="mx-auto max-w-6xl space-y-6">
        <DailyTarget />

        <Suspense fallback={<Dialog open={showSummary}><DialogContent className="sm:max-w-md"><PanelSkeleton height="h-56" /></DialogContent></Dialog>}>
          <SessionSummaryDialog
            open={showSummary}
            onOpenChange={setShowSummary}
            callCount={callCount}
            skippedCount={skippedCount}
            sessionOutcomes={sessionOutcomes}
          />
        </Suspense>

        <div className="flex flex-wrap items-center gap-4">
          <Select value={industry} onValueChange={setIndustry} disabled={isSessionActive}>
            <SelectTrigger className="w-[200px] border-border bg-card">
              <SelectValue placeholder="Filter by industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stateFilter} onValueChange={setStateFilter} disabled={isSessionActive}>
            <SelectTrigger className="w-[180px] border-border bg-card">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {AUSTRALIAN_STATE_OPTIONS.map((state) => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex flex-1 flex-wrap items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">
              {isLoading ? "..." : queueLeadCount} leads in queue
            </span>
            {myDialpadSettings ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-primary">
                  <Phone className="mr-1 inline h-3 w-3" />
                  {myDialpadSettings.dialpad_phone_number || myDialpadSettings.dialpad_user_id}
                </span>
                {callerIdOptions.length > 1 && (
                  <Select value={selectedCallerId} onValueChange={setSelectedCallerId}>
                    <SelectTrigger className="h-7 w-auto min-w-[140px] border-border bg-card text-xs">
                      <SelectValue placeholder="Caller ID" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto (default)</SelectItem>
                      {callerIdOptions.map((opt) => (
                        <SelectItem key={opt.number} value={opt.number}>
                          {opt.label} — {opt.number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : (
              <span className="text-xs font-mono text-destructive">
                No active Dialpad assignment — ask an admin to assign your user before starting a session.
              </span>
            )}
            {dialpadPollingBackoffUntil && dialpadPollingBackoffUntil > Date.now() && (
              <span className="text-xs font-mono text-muted-foreground">
                Dialpad status refresh paused briefly after rate limiting.
              </span>
            )}
            {isSessionActive && (
              <>
                <span className="text-xs font-mono text-primary">
                  {callCount} calls · {skippedCount} skipped{isPrefetching ? " · loading next leads" : ""}{isSessionPaused ? " · paused" : ""}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  Active {formatDuration(totalDialingMs)}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  Paused {formatDuration(totalPausedMs)}
                </span>
              </>
            )}
          </div>

          {!isSessionActive ? (
            <>
              <Button
                onClick={startDialing}
                disabled={isLoading || isStartingSession || isRecoveringQueue || !hasDialpadAssignment}
                className="px-6 font-semibold"
              >
                {isStartingSession ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="mr-2 h-4 w-4" />
                )}
                {isStartingSession ? "Starting..." : "Start Dialing"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void recoverQueue()}
                disabled={isLoading || isStartingSession || isRecoveringQueue}
                className="px-6 font-semibold"
              >
                {isRecoveringQueue ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                {isRecoveringQueue ? "Recovering..." : "Recover Queue"}
              </Button>
            </>
          ) : (
            <>
              {isSessionPaused ? (
                <Button onClick={resumeSession} className="px-6 font-semibold">
                  <Play className="mr-2 h-4 w-4" />
                  Resume Dialing
                </Button>
              ) : (
                <Button variant="secondary" onClick={pauseSession} disabled={isEndingCall} className="px-6 font-semibold">
                  <Pause className="mr-2 h-4 w-4" />
                  Pause Dialing
                </Button>
              )}
              <Button
                variant="outline"
                onClick={stopSession}
                className="border-destructive text-destructive hover:bg-destructive/10"
              >
                Stop Session
              </Button>
              <Button
                variant="outline"
                onClick={() => void recoverQueue()}
                disabled={isRecoveringQueue || isStartingSession}
                className="px-6 font-semibold"
              >
                {isRecoveringQueue ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                {isRecoveringQueue ? "Recovering..." : "Recover Queue"}
              </Button>
            </>
          )}

          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-border">
                <PhoneCall className="mr-2 h-4 w-4" />
                Manual Dial
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Manual Dial</DialogTitle>
                <DialogDescription>
                  Place a Dialpad call directly to any phone number.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Input
                  type="tel"
                  placeholder="Enter phone number..."
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="font-mono text-lg tracking-wider"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && manualPhone.trim() && myDialpadSettings?.dialpad_user_id) {
                      try {
                        await dialpadCall.mutateAsync({
                          phone: manualPhone.trim(),
                          dialpad_user_id: myDialpadSettings.dialpad_user_id,
                          caller_id: selectedCallerId || undefined,
                        });
                        toast.success(`Calling ${manualPhone.trim()} through Dialpad`);
                        setManualOpen(false);
                        setManualPhone("");
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
                        toast.error(message);
                      }
                    }
                  }}
                />
                <Button
                  className="w-full font-semibold"
                  disabled={!manualPhone.trim() || !myDialpadSettings?.dialpad_user_id || dialpadCall.isPending}
                  onClick={async () => {
                    try {
                      await dialpadCall.mutateAsync({
                        phone: manualPhone.trim(),
                        dialpad_user_id: myDialpadSettings.dialpad_user_id,
                        caller_id: selectedCallerId || undefined,
                      });
                      toast.success(`Calling ${manualPhone.trim()} through Dialpad`);
                      setManualOpen(false);
                      setManualPhone("");
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
                      toast.error(message);
                    }
                  }}
                >
                  {dialpadCall.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Phone className="mr-2 h-4 w-4" />
                  )}
                  Dial {manualPhone.trim() || "..."}
                </Button>
                {!myDialpadSettings?.dialpad_user_id && (
                  <p className="text-sm text-muted-foreground">
                    Assign a Dialpad number to your user before placing calls.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isSessionActive && currentContact ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              {isSessionPaused && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  Session paused — this lead is held in your queue and no new call will start until you resume.
                </div>
              )}

              <ContactCard contact={currentContact} />

              <Suspense fallback={<PanelSkeleton height="h-36" />}>
                <DialpadSyncPanel
                  contactId={currentContact.id}
                  activeDialpadCallId={activeDialpadCallId}
                  activeDialpadCallState={activeDialpadCallState ?? (isCallResolving ? "connecting" : null)}
                  onCancelCall={cancelActiveCall}
                  isCancelling={cancelDialpadCall.isPending}
                  isStatusPending={isDialpadCallStatusPending}
                  isEndingCall={isEndingCall}
                  isResolving={isCallResolving}
                  enabled
                />
              </Suspense>

            </div>

            <div className="space-y-4 lg:col-span-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <label className="mb-3 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  Call Outcome <span className="text-primary">(required)</span>
                </label>
                <div className="space-y-2">
                  {outcomes.map((outcome) => (
                    <OutcomeButton
                      key={outcome}
                      outcome={outcome}
                      label={outcome === "booked" ? "Book" : undefined}
                      selected={selectedOutcome === outcome}
                      onClick={setSelectedOutcome}
                    />
                  ))}
                </div>
              </div>

              {requiresPipelineAssignment && (
                <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                  <div>
                    <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                      Assigned Sales Rep
                    </label>
                    <Select value={assignedRepId} onValueChange={setAssignedRepId}>
                      <SelectTrigger className="w-full border-border bg-background">
                        <SelectValue placeholder="Choose a sales rep" />
                      </SelectTrigger>
                      <SelectContent>
                        {salesReps.map((rep) => (
                          <SelectItem key={rep.user_id} value={rep.user_id}>
                            {getRepLabel(rep.display_name, rep.email)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <UserRound className="h-3 w-3" />
                      {assignedRepId
                        ? getRepLabel(salesReps.find((rep) => rep.user_id === assignedRepId)?.display_name || null, salesReps.find((rep) => rep.user_id === assignedRepId)?.email || null)
                        : "No rep selected"}
                    </div>
                  </div>

                  {requiresFollowUpSchedule && (
                    <div>
                      <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                        Follow-up Schedule
                      </label>
                      <div className="space-y-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start border-border bg-background text-left font-normal",
                                !followUpDate && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {followUpDate ? format(followUpDate, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={followUpDate}
                              onSelect={setFollowUpDate}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              initialFocus
                              className="pointer-events-auto p-3"
                            />
                          </PopoverContent>
                        </Popover>
                        <Input
                          type="time"
                          value={followUpTime}
                          onChange={(e) => setFollowUpTime(e.target.value)}
                          className="border-border bg-background"
                        />
                      </div>
                    </div>
                  )}

                  {requiresBookedSchedule && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-border bg-background p-3">
                        <p className="text-sm font-medium text-foreground">Book appointment below</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          The calendar opens inline so reps can book fast and stay in the dialer.
                        </p>
                      </div>

                      <InlineBookingEmbed onDetectedDate={handleBookedDateDetected} />

                      <div>
                        <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          Confirm Booked Date
                        </label>
                        <div className="space-y-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start border-border bg-background text-left font-normal",
                                  !followUpDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {followUpDate ? format(followUpDate, "PPP") : "Confirm appointment date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={followUpDate}
                                onSelect={(date) => {
                                  setFollowUpDate(date);
                                  setIsBookedDateAutoDetected(false);
                                }}
                                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                initialFocus
                                className="pointer-events-auto p-3"
                              />
                            </PopoverContent>
                          </Popover>
                          <p className="text-xs text-muted-foreground">
                            {followUpDate
                              ? isBookedDateAutoDetected
                                ? "Date auto-detected from the booking widget — adjust it if needed."
                                : "Date confirmed manually for reporting and pipeline accuracy."
                              : "Choose the booked appointment day before moving to the next call."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedOutcome === "follow_up" && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Follow-up Notes
                  </label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter follow-up details..."
                    className="min-h-[80px] resize-none border-border bg-background text-sm"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Button
                  onClick={() => void logAndNext()}
                  disabled={!canSubmit}
                  className="w-full py-3 font-semibold"
                >
                  {createCallLog.isPending || createPipelineItem.isPending || linkDialpadCallLog.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  {primaryActionLabel}
                  <kbd className="ml-2 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-mono opacity-70">
                    Enter
                  </kbd>
                </Button>
                <Button
                  variant="outline"
                  onClick={skipLead}
                  className="w-full border-border text-muted-foreground hover:text-foreground"
                >
                  <SkipForward className="mr-2 h-4 w-4" />
                  Skip Lead
                  <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono opacity-70">
                    S
                  </kbd>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Phone className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              {isLoading ? "Checking Queue" : queueLeadCount === 0 ? "No Leads Available" : "Ready to Dial"}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {isLoading
                ? "Checking the current queue for available leads."
                : queueLeadCount === 0
                  ? "All contacts in this queue have been called. Try a different industry or state filter, or upload new lists."
                  : "Filter by industry and state, then hit 'Start Dialing' to begin your calling session. Use number keys 1-7 to quickly select outcomes, S to skip, Enter to log."
              }
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
