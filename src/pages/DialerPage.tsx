import { lazy, Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Phone, CheckCircle2, Loader2, PhoneCall, SkipForward, UserRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { OutcomeButton } from "@/components/OutcomeButton";
import { DailyTarget } from "@/components/DailyTarget";
import { Skeleton } from "@/components/ui/skeleton";
import { INDUSTRIES, CallOutcome, OUTCOME_CONFIG } from "@/data/mockData";
import { useRollingDialerQueue, useUpdateContact } from "@/hooks/useContacts";
import { prefetchContactCallLogs, useCreateCallLog } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { useMyDialpadSettings } from "@/hooks/useDialpadSettings";
import { useDialpadCall, useDialpadCallStatus, useCancelDialpadCall, useLinkDialpadCallLog } from "@/hooks/useDialpad";
import { useCreatePipelineItem, useSalesReps } from "@/hooks/usePipelineItems";
import { prefetchContactNotes } from "@/hooks/useContactNotes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { BOOKED_APPOINTMENT_DEFAULT_TIME } from "@/lib/appointments";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const AUSTRALIAN_STATE_OPTIONS = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const loadDialpadSyncPanel = () => import("@/components/dialer/DialpadSyncPanel");
const loadContactNotesPanel = () => import("@/components/dialer/ContactNotesPanel");
const loadSessionSummaryDialog = () => import("@/components/dialer/SessionSummaryDialog");

const DialpadSyncPanel = lazy(loadDialpadSyncPanel);
const ContactNotesPanel = lazy(loadContactNotesPanel);
const SessionSummaryDialog = lazy(loadSessionSummaryDialog);

interface SessionStats {
  calls: number;
  outcomes: Partial<Record<CallOutcome, number>>;
}

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

function DialogSkeleton() {
  return <Skeleton className="h-64 w-full rounded-xl" />;
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
  const [callCount, setCallCount] = useState(0);
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
  const [notesFetchEnabled, setNotesFetchEnabled] = useState(false);
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

  useEffect(() => {
    setNotesFetchEnabled(false);

    if (!currentContact?.id) return;

    const timeoutId = window.setTimeout(() => {
      setNotesFetchEnabled(true);
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [currentContact?.id]);

  const latestDialpadSummary = useMemo(
    () => queryClient.getQueryData<Awaited<ReturnType<typeof prefetchContactNotes>>>(["noop"]),
    [queryClient],
  );
  const stateOptions = AUSTRALIAN_STATE_OPTIONS;

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

  const startDialing = useCallback(async () => {
    if (queueLeadCount === 0 || !hasDialpadAssignment) return;

    setCurrentIndex(0);
    setIsDialing(true);
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
    setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
    setAssignedRepId(user?.id || "");
    setCallCount(0);
    setSkippedCount(0);
    setSessionOutcomes({});
    setShowSummary(false);
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    leadAdvanceInFlightRef.current = false;

    const claimedCount = await startQueueSession();
    if (claimedCount <= 0) {
      setIsDialing(false);
      setCurrentIndex(null);
      toast.info("No more leads in queue.");
      return;
    }

    void ensureBuffer();
  }, [hasDialpadAssignment, queueLeadCount, startQueueSession, user?.id]);

  const stopSession = useCallback(() => {
    if (callCount > 0) {
      setShowSummary(true);
    }
    setIsDialing(false);
    setCurrentIndex(null);
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    leadAdvanceInFlightRef.current = false;
    activeDialRequestRef.current = null;
    void stopQueueSession();
  }, [callCount, stopQueueSession]);

  const skipLead = useCallback(() => {
    if (currentIndex === null || !currentContact) return;

    const nextLength = visibleUncalledContacts.length - 1;
    void discardContact(currentContact.id);
    setSkippedCount((prev) => prev + 1);
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
    setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
    setAssignedRepId(user?.id || "");
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    leadAdvanceInFlightRef.current = false;
    activeDialRequestRef.current = null;
    void ensureBuffer();

    if (nextLength <= 0) {
      toast.info("No more leads in queue.");
      stopSession();
      return;
    }

    if (currentIndex >= nextLength) {
      setCurrentIndex(nextLength - 1);
    }
  }, [currentContact, currentIndex, discardContact, ensureBuffer, stopSession, user?.id, visibleUncalledContacts.length]);

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
      void discardContact(currentContact.id, { releaseLock: true });
      void ensureBuffer();

      toast.success(`Logged: ${OUTCOME_CONFIG[outcomeToLog].label}`);
      activeDialRequestRef.current = null;
      setActiveDialpadCallId(null);
      setActiveDialpadCallState(null);
      setDialpadPollingBackoffUntil(null);
      setIsEndingCall(false);
      setPendingAutoOutcome(null);
      setSelectedOutcome(null);
      setNotes("");
      setFollowUpDate(undefined);
      setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
      setAssignedRepId(user.id);

      const nextLength = visibleUncalledContacts.length - 1;
      if (nextLength <= 0) {
        stopSession();
      } else if (currentIndex !== null && currentIndex >= nextLength) {
        setCurrentIndex(nextLength - 1);
      }

      leadAdvanceInFlightRef.current = false;
    } catch {
      leadAdvanceInFlightRef.current = false;
      toast.error("Failed to log call. Try again.");
    }
  }, [
    currentIndex,
    activeDialpadCallId,
    assignedRepId,
    createCallLog,
    createPipelineItem,
    currentContact,
    followUpDate,
    followUpTime,
    linkDialpadCallLog,
    notes,
    selectedOutcome,
    stopSession,
    updateContact,
    user,
    visibleUncalledContacts.length,
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
        logAndNext();
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
    if (isDialing && currentIndex !== null && visibleUncalledContacts.length === 0) {
      stopSession();
    } else if (isDialing && currentIndex !== null && currentIndex >= visibleUncalledContacts.length) {
      setCurrentIndex(visibleUncalledContacts.length > 0 ? visibleUncalledContacts.length - 1 : null);
      if (visibleUncalledContacts.length === 0) stopSession();
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

        <Dialog open={showSummary} onOpenChange={setShowSummary}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Session Summary
              </DialogTitle>
              <DialogDescription>
                Review this calling session before closing the summary.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-secondary p-3 text-center">
                  <p className="font-mono text-2xl font-bold text-foreground">{callCount}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Calls</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary p-3 text-center">
                  <p className="font-mono text-2xl font-bold text-foreground">{sessionOutcomes.booked || 0}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Booked</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary p-3 text-center">
                  <p className="font-mono text-2xl font-bold text-foreground">{skippedCount}</p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Skipped</p>
                </div>
              </div>
              <div className="space-y-2">
                {(Object.entries(sessionOutcomes) as [CallOutcome, number][]).map(([outcome, count]) => {
                  const config = OUTCOME_CONFIG[outcome];
                  return (
                    <div key={outcome} className="flex items-center gap-3 text-sm">
                      <div className={`h-2 w-2 rounded-full ${config?.bgClass || "bg-muted-foreground"}`} />
                      <span className="flex-1 text-foreground">{config?.label || outcome}</span>
                      <span className="font-mono text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
              <Button onClick={() => setShowSummary(false)} className="w-full">
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

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
              {stateOptions.map((state) => (
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
                {callCount} calls · {skippedCount} skipped
              </span>
            )}
          </div>

          {!isDialing ? (
            <Button
              onClick={startDialing}
              disabled={queueLeadCount === 0 || isLoading || !hasDialpadAssignment}
              className="px-6 font-semibold"
            >
              <Phone className="mr-2 h-4 w-4" />
              Start Dialing
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

              <div className="rounded-lg border border-border bg-card p-4">
                <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  Dialpad Sync
                </label>
                <div className="space-y-3 text-sm">
                  {activeDialpadCallId ? (
                    <div className="space-y-3">
                      <div className="rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-muted-foreground">
                        Call linked · transcript and AI summary will sync after Dialpad finishes processing.
                        {activeDialpadCallState ? ` Current state: ${activeDialpadCallState}.` : ""}
                      </div>
                      <Button
                        variant="outline"
                        onClick={cancelActiveCall}
                        disabled={cancelDialpadCall.isPending || isDialpadCallStatusPending || isEndingCall || activeDialpadCallState === "hangup"}
                        className="w-full border-destructive text-destructive hover:bg-destructive/10"
                      >
                        {cancelDialpadCall.isPending || isDialpadCallStatusPending || isEndingCall ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PhoneOff className="mr-2 h-4 w-4" />
                        )}
                        {activeDialpadCallState === "hangup"
                          ? "Call Already Ended"
                          : isEndingCall
                            ? "Ending Call..."
                            : "Cancel Active Call"}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Waiting for a tracked Dialpad call to reach a loggable state.
                    </p>
                  )}

                  {latestDialpadSummary && (
                    <div className="rounded-md border border-border bg-background px-3 py-3">
                      <p className="mb-2 text-[10px] uppercase tracking-widest text-primary">Latest synced summary</p>
                      <p className="whitespace-pre-wrap text-sm text-foreground">{latestDialpadSummary.content}</p>
                    </div>
                  )}

                  {latestDialpadTranscript && (
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                      Transcript synced · {format(new Date(latestDialpadTranscript.created_at), "MMM d, h:mm a")}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  Call Notes
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Type notes during or after the call..."
                  className="min-h-[100px] resize-none border-border bg-background font-mono text-sm"
                />
              </div>
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
                          className="p-3 pointer-events-auto"
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
