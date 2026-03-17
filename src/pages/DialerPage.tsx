import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, CheckCircle2, Loader2, Phone, PhoneCall, SkipForward, UserRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { DailyTarget } from "@/components/DailyTarget";
import { OutcomeButton } from "@/components/OutcomeButton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateCallLog, prefetchContactCallLogs } from "@/hooks/useCallLogs";
import { useRollingDialerQueue, useUpdateContact } from "@/hooks/useContacts";
import { useAuth } from "@/hooks/useAuth";
import { useDialpadCall, useDialpadCallStatus, useCancelDialpadCall, useLinkDialpadCallLog } from "@/hooks/useDialpad";
import { useMyDialpadSettings } from "@/hooks/useDialpadSettings";
import { useCreatePipelineItem, useSalesReps } from "@/hooks/usePipelineItems";
import { prefetchContactNotes } from "@/hooks/useContactNotes";
import { BOOKED_APPOINTMENT_DEFAULT_TIME } from "@/lib/appointments";
import { cn } from "@/lib/utils";
import { CallOutcome, INDUSTRIES } from "@/data/mockData";
import { toast } from "sonner";

const AUSTRALIAN_STATE_OPTIONS = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const loadDialpadSyncPanel = () =>
  import("@/components/dialer/DialpadSyncPanel").then((module) => ({ default: module.default ?? module.DialpadSyncPanel }));
const loadContactNotesPanel = () =>
  import("@/components/dialer/ContactNotesPanel").then((module) => ({ default: module.default ?? module.ContactNotesPanel }));
const loadSessionSummaryDialog = () =>
  import("@/components/dialer/SessionSummaryDialog").then((module) => ({ default: module.default ?? module.SessionSummaryDialog }));

const DialpadSyncPanel = lazy(loadDialpadSyncPanel);
const ContactNotesPanel = lazy(loadContactNotesPanel);
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

function PanelSkeleton({ height = "h-40" }: { height?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="space-y-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className={cn("w-full", height)} />
      </div>
    </div>
  );
}

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
  const [isDialing, setIsDialing] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [sessionOutcomes, setSessionOutcomes] = useState<Partial<Record<CallOutcome, number>>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [activeDialpadCallId, setActiveDialpadCallId] = useState<string | null>(null);
  const [activeDialpadCallState, setActiveDialpadCallState] = useState<string | null>(null);
  const [dialpadPollingBackoffUntil, setDialpadPollingBackoffUntil] = useState<number | null>(null);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [pendingAutoOutcome, setPendingAutoOutcome] = useState<CallOutcome | null>(null);
  const [notesPanelEnabled, setNotesPanelEnabled] = useState(false);
  const activeDialRequestRef = useRef<string | null>(null);
  const leadAdvanceInFlightRef = useRef(false);

  const {
    contacts: visibleUncalledContacts,
    totalCount: totalQueueCount,
    isLoading,
    isPrefetching,
    startSession: startQueueSession,
    stopSession: stopQueueSession,
    ensureBuffer,
    discardContact,
  } = useRollingDialerQueue({ industry, state: stateFilter, userId: user?.id });
  const { data: salesReps = [] } = useSalesReps();
  const updateContact = useUpdateContact();
  const createCallLog = useCreateCallLog();
  const createPipelineItem = useCreatePipelineItem();
  const { data: myDialpadSettings } = useMyDialpadSettings();
  const dialpadCall = useDialpadCall();
  const { mutateAsync: fetchDialpadCallStatus, isPending: isDialpadCallStatusPending } = useDialpadCallStatus();
  const cancelDialpadCall = useCancelDialpadCall();
  const linkDialpadCallLog = useLinkDialpadCallLog();

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
  const isCallTerminal = !activeDialpadCallId || activeDialpadCallState === "hangup";
  const requiresPipelineAssignment = selectedOutcome === "follow_up" || selectedOutcome === "booked";
  const requiresFollowUpSchedule = selectedOutcome === "follow_up";
  const requiresBookedSchedule = selectedOutcome === "booked";
  const requiresAnySchedule = requiresFollowUpSchedule || requiresBookedSchedule;
  const canSubmit = !!selectedOutcome
    && isCallTerminal
    && (!requiresPipelineAssignment || !!assignedRepId)
    && (!requiresAnySchedule || !!followUpDate)
    && (!requiresFollowUpSchedule || !!followUpTime)
    && !isEndingCall
    && !createCallLog.isPending
    && !createPipelineItem.isPending
    && !dialpadCall.isPending
    && !linkDialpadCallLog.isPending;

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
  }, [requiresAnySchedule, requiresPipelineAssignment, user?.id]);

  useEffect(() => {
    setNotesPanelEnabled(false);

    if (!currentContact?.id) return;

    const timeoutId = window.setTimeout(() => {
      setNotesPanelEnabled(true);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [currentContact?.id]);

  useEffect(() => {
    if (!currentContact?.id) return;

    void prefetchContactNotes(queryClient, currentContact.id);
    void prefetchContactCallLogs(queryClient, currentContact.id);
  }, [currentContact?.id, queryClient]);

  useEffect(() => {
    if (!isDialing) return;

    void loadDialpadSyncPanel();
    void loadContactNotesPanel();
    void loadSessionSummaryDialog();
  }, [isDialing]);

  useEffect(() => {
    if (!isDialing || !nextContact?.id) return;

    void prefetchContactNotes(queryClient, nextContact.id);
    void prefetchContactCallLogs(queryClient, nextContact.id);
    void ensureBuffer();
  }, [ensureBuffer, isDialing, nextContact?.id, queryClient]);

  const resetLeadState = useCallback((assignedUserId?: string) => {
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
    setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
    setAssignedRepId(assignedUserId || "");
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    setPendingAutoOutcome(null);
    leadAdvanceInFlightRef.current = false;
    activeDialRequestRef.current = null;
  }, []);

  const startDialing = useCallback(async () => {
    if (!hasDialpadAssignment || isStartingSession) return;

    setIsStartingSession(true);
    setIsBootstrappingSession(true);
    setCallCount(0);
    setSkippedCount(0);
    setSessionOutcomes({});
    setShowSummary(false);
    resetLeadState(user?.id || "");

    try {
      const claimedCount = await startQueueSession();
      if (claimedCount <= 0) {
        setIsDialing(false);
        setCurrentIndex(null);
        setIsBootstrappingSession(false);
        toast.info("No more leads in queue.");
        return;
      }

      setIsDialing(true);
      setCurrentIndex(0);
      void loadDialpadSyncPanel();
      void loadContactNotesPanel();
      void loadSessionSummaryDialog();
      void ensureBuffer();
    } catch (error) {
      setIsDialing(false);
      setCurrentIndex(null);
      setIsBootstrappingSession(false);
      const message = error instanceof Error ? error.message : "Unable to start dialing session.";
      toast.error(message);
    } finally {
      setIsStartingSession(false);
    }
  }, [ensureBuffer, hasDialpadAssignment, isStartingSession, resetLeadState, startQueueSession, user?.id]);

  const stopSession = useCallback(() => {
    if (callCount > 0) {
      setShowSummary(true);
    }
    setIsStartingSession(false);
    setIsDialing(false);
    setCurrentIndex(null);
    resetLeadState(user?.id || "");
    void stopQueueSession();
  }, [callCount, resetLeadState, stopQueueSession, user?.id]);

  const skipLead = useCallback(() => {
    if (currentIndex === null || !currentContact) return;

    const nextLength = visibleUncalledContacts.length - 1;
    void discardContact(currentContact.id);
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
  }, [currentContact, currentIndex, discardContact, ensureBuffer, resetLeadState, stopSession, user?.id, visibleUncalledContacts.length]);

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

    try {
      const scheduledFor = followUpDate
        ? combineDateAndTime(followUpDate, outcomeToLog === "follow_up" ? followUpTime : BOOKED_APPOINTMENT_DEFAULT_TIME).toISOString()
        : null;

      const insertedLog = await createCallLog.mutateAsync({
        contact_id: currentContact.id,
        user_id: user.id,
        outcome: outcomeToLog,
        notes: notes || undefined,
        follow_up_date: scheduledFor,
        dialpad_call_id: activeDialpadCallId,
      });

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
        updateContact.mutateAsync({
          id: currentContact.id,
          status: "called",
          last_outcome: outcomeToLog,
          is_dnc: outcomeToLog === "dnc",
        }),
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
    assignedRepId,
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
    if (!activeDialpadCallId) return;

    setIsEndingCall(true);

    try {
      const result = await cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId });
      setActiveDialpadCallState(result.state ?? "ending");

      if (result.already_ended || result.terminal) {
        setActiveDialpadCallId(null);
        setActiveDialpadCallState("hangup");
        setDialpadPollingBackoffUntil(null);
        toast.info("This call has already ended.");
        return;
      }

      toast.success(result.message || "Call cancellation requested.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to cancel the active call.";
      if (message.toLowerCase().includes("rate limit")) {
        setDialpadPollingBackoffUntil(Date.now() + 30000);
      }
      toast.error(message);
    } finally {
      setIsEndingCall(false);
    }
  }, [activeDialpadCallId, cancelDialpadCall]);

  useEffect(() => {
    if (!isDialing || !currentContact) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
      const outcomes: CallOutcome[] = [
        "no_answer", "voicemail", "not_interested", "dnc",
        "follow_up", "booked", "wrong_number",
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
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canSubmit, currentContact, isDialing, logAndNext, skipLead]);

  const outcomes: CallOutcome[] = [
    "no_answer", "voicemail", "not_interested", "dnc",
    "follow_up", "booked", "wrong_number",
  ];

  useEffect(() => {
    if (!isDialing || currentIndex === null) return;

    if (visibleUncalledContacts.length === 0) {
      stopSession();
    } else if (currentIndex >= visibleUncalledContacts.length) {
      setCurrentIndex(visibleUncalledContacts.length - 1);
    }
  }, [visibleUncalledContacts.length, isDialing, currentIndex, stopSession]);

  useEffect(() => {
    if (!isDialing || !currentContact || !myDialpadSettings?.dialpad_user_id) return;

    const requestKey = `${currentContact.id}:${currentContact.phone}`;
    if (activeDialRequestRef.current === requestKey || dialpadCall.isPending) return;

    activeDialRequestRef.current = requestKey;
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    leadAdvanceInFlightRef.current = false;
    setPendingAutoOutcome(null);

    dialpadCall
      .mutateAsync({
        phone: currentContact.phone,
        dialpad_user_id: myDialpadSettings.dialpad_user_id,
        contact_id: currentContact.id,
      })
      .then((response) => {
        setActiveDialpadCallId(response.dialpad_call_id);
        setActiveDialpadCallState(response.state);
        toast.success(`Calling ${currentContact.phone} through Dialpad`);

        if (response.tracking_warning) {
          toast.warning("Call placed, but transcript tracking needs attention.");
        }
      })
      .catch((error) => {
        setActiveDialpadCallId(null);
        setActiveDialpadCallState(null);
        const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
        toast.error(message);
      });
  }, [isDialing, currentContact, myDialpadSettings?.dialpad_user_id, dialpadCall]);

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
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : "";
        if (message.includes("rate limit")) {
          setDialpadPollingBackoffUntil(Date.now() + 30000);
        }
      } finally {
        isRequestInFlight = false;
      }
    };

    void pollStatus();
    const intervalId = window.setInterval(pollStatus, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeDialpadCallId, dialpadPollingBackoffUntil, fetchDialpadCallStatus]);

  useEffect(() => {
    if (!isDialing || !currentContact || selectedOutcome || pendingAutoOutcome) return;

    const timeoutId = window.setTimeout(() => {
      setPendingAutoOutcome("no_answer");
    }, 30000);

    return () => window.clearTimeout(timeoutId);
  }, [currentContact, isDialing, pendingAutoOutcome, selectedOutcome]);

  useEffect(() => {
    if (!pendingAutoOutcome || !currentContact || leadAdvanceInFlightRef.current) return;

    if (!isCallTerminal && activeDialpadCallId && !isEndingCall) {
      void cancelActiveCall();
      return;
    }

    if (isCallTerminal) {
      void logAndNext(pendingAutoOutcome);
    }
  }, [activeDialpadCallId, cancelActiveCall, currentContact, isCallTerminal, isEndingCall, logAndNext, pendingAutoOutcome]);

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
          <Select value={industry} onValueChange={setIndustry} disabled={isDialing}>
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

          <Select value={stateFilter} onValueChange={setStateFilter} disabled={isDialing}>
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

          <div className="flex flex-1 items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">
              {isLoading ? "..." : queueLeadCount} leads in queue
            </span>
            {myDialpadSettings ? (
              <span className="text-xs font-mono text-primary">
                <Phone className="mr-1 inline h-3 w-3" />
                {myDialpadSettings.dialpad_phone_number || myDialpadSettings.dialpad_user_id}
              </span>
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
            {isDialing && (
              <span className="text-xs font-mono text-primary">
                {callCount} calls · {skippedCount} skipped{isPrefetching ? " · loading next leads" : ""}
              </span>
            )}
          </div>

          {!isDialing ? (
            <Button
              onClick={startDialing}
              disabled={isLoading || isStartingSession || !hasDialpadAssignment}
              className="px-6 font-semibold"
            >
              {isStartingSession ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Phone className="mr-2 h-4 w-4" />
              )}
              {isStartingSession ? "Starting..." : "Start Dialing"}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={stopSession}
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              Stop Session
            </Button>
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

        {isDialing && currentContact ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <ContactCard contact={currentContact} />

              <Suspense fallback={<PanelSkeleton height="h-36" />}>
                <DialpadSyncPanel
                  contactId={currentContact.id}
                  activeDialpadCallId={activeDialpadCallId}
                  activeDialpadCallState={activeDialpadCallState}
                  onCancelCall={cancelActiveCall}
                  isCancelling={cancelDialpadCall.isPending}
                  isStatusPending={isDialpadCallStatusPending}
                  isEndingCall={isEndingCall}
                  enabled
                />
              </Suspense>

              <Suspense fallback={<PanelSkeleton height="h-[320px]" />}>
                <ContactNotesPanel
                  contactId={currentContact.id}
                  notes={notes}
                  onNotesChange={setNotes}
                  enabled={notesPanelEnabled}
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
                      selected={selectedOutcome === outcome}
                      onClick={setSelectedOutcome}
                    />
                  ))}
                </div>
              </div>

              {requiresPipelineAssignment && (
                <div className="rounded-lg border border-border bg-card p-4">
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
              )}

              {requiresAnySchedule && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    {requiresBookedSchedule ? "Appointment Day" : "Follow-up Schedule"}
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
                          {followUpDate ? format(followUpDate, "PPP") : requiresBookedSchedule ? "Pick appointment day" : "Pick a date"}
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
                    {requiresFollowUpSchedule ? (
                      <Input
                        type="time"
                        value={followUpTime}
                        onChange={(e) => setFollowUpTime(e.target.value)}
                        className="border-border bg-background"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">Booked appointments only need a day right now.</p>
                    )}
                  </div>
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
                  {isCallTerminal ? "Log & Next Lead" : "End or wait for call to finish before logging"}
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
              {visibleUncalledContacts.length === 0 && !isLoading ? "No Leads Available" : "Ready to Dial"}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {visibleUncalledContacts.length === 0 && !isLoading
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
