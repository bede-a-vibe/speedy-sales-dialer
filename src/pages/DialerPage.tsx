import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { CalendarIcon, Phone, PhoneOff, CheckCircle2, Loader2, PhoneCall, SkipForward, BarChart3, UserRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { OutcomeButton } from "@/components/OutcomeButton";
import { DailyTarget } from "@/components/DailyTarget";
import { INDUSTRIES, CallOutcome, OUTCOME_CONFIG } from "@/data/mockData";
import { useUncalledContacts, useUpdateContact } from "@/hooks/useContacts";
import { useCreateCallLog } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { useMyDialpadSettings } from "@/hooks/useDialpadSettings";
import { useDialpadCall, useDialpadCallStatus, useCancelDialpadCall, useLinkDialpadCallLog } from "@/hooks/useDialpad";
import { useCreatePipelineItem, useSalesReps } from "@/hooks/usePipelineItems";
import { useContactNotes } from "@/hooks/useContactNotes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { BOOKED_APPOINTMENT_DEFAULT_TIME } from "@/lib/appointments";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

export default function DialerPage() {
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
  const activeDialRequestRef = useRef<string | null>(null);

  const { data: uncalledContacts = [], isLoading } = useUncalledContacts(industry, stateFilter);
  const { data: queueContacts = [] } = useUncalledContacts();
  const { data: salesReps = [] } = useSalesReps();
  const updateContact = useUpdateContact();
  const createCallLog = useCreateCallLog();
  const createPipelineItem = useCreatePipelineItem();
  const { data: myDialpadSettings } = useMyDialpadSettings();
  const dialpadCall = useDialpadCall();
  const dialpadCallStatus = useDialpadCallStatus();
  const cancelDialpadCall = useCancelDialpadCall();
  const linkDialpadCallLog = useLinkDialpadCallLog();

  const currentContact = currentIndex !== null && currentIndex < uncalledContacts.length
    ? uncalledContacts[currentIndex]
    : null;

  const { data: currentContactNotes = [] } = useContactNotes(currentContact?.id);
  const latestDialpadSummary = currentContactNotes.find((note) => note.source === "dialpad_summary") ?? null;
  const latestDialpadTranscript = currentContactNotes.find((note) => note.source === "dialpad_transcript") ?? null;
  const stateOptions = useMemo(
    () => Array.from(new Set(queueContacts.map((contact) => contact.state?.trim()).filter((state): state is string => !!state))).sort((a, b) => a.localeCompare(b)),
    [queueContacts],
  );

  const requiresPipelineAssignment = selectedOutcome === "follow_up" || selectedOutcome === "booked";
  const requiresFollowUpSchedule = selectedOutcome === "follow_up";
  const requiresBookedSchedule = selectedOutcome === "booked";
  const requiresAnySchedule = requiresFollowUpSchedule || requiresBookedSchedule;
  const canSubmit = !!selectedOutcome
    && (!requiresPipelineAssignment || !!assignedRepId)
    && (!requiresAnySchedule || !!followUpDate)
    && (!requiresFollowUpSchedule || !!followUpTime)
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

  const startDialing = useCallback(() => {
    if (uncalledContacts.length === 0) return;
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
  }, [uncalledContacts.length, user?.id]);

  const stopSession = useCallback(() => {
    if (callCount > 0) {
      setShowSummary(true);
    }
    setIsDialing(false);
    setCurrentIndex(null);
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    activeDialRequestRef.current = null;
  }, [callCount]);

  const skipLead = useCallback(() => {
    if (currentIndex === null) return;
    setSkippedCount((prev) => prev + 1);
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
    setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
    setAssignedRepId(user?.id || "");
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    activeDialRequestRef.current = null;
    const nextIdx = currentIndex + 1;
    if (nextIdx < uncalledContacts.length) {
      setCurrentIndex(nextIdx);
    } else {
      toast.info("No more leads in queue.");
      stopSession();
    }
  }, [currentIndex, stopSession, uncalledContacts.length, user?.id]);

  const logAndNext = useCallback(async () => {
    if (!selectedOutcome || !currentContact || !user) return;

    if (requiresFollowUpSchedule && (!followUpDate || !followUpTime)) {
      toast.error("Choose a follow-up date and time.");
      return;
    }

    if (requiresBookedSchedule && !followUpDate) {
      toast.error("Choose an appointment day.");
      return;
    }

    if (requiresPipelineAssignment && !assignedRepId) {
      toast.error("Choose a sales rep.");
      return;
    }

    try {
      const scheduledFor = followUpDate
        ? combineDateAndTime(followUpDate, requiresFollowUpSchedule ? followUpTime : BOOKED_APPOINTMENT_DEFAULT_TIME).toISOString()
        : null;

      const insertedLog = await createCallLog.mutateAsync({
        contact_id: currentContact.id,
        user_id: user.id,
        outcome: selectedOutcome,
        notes: notes || undefined,
        follow_up_date: scheduledFor,
        dialpad_call_id: activeDialpadCallId,
      });

      if (activeDialpadCallId) {
        await linkDialpadCallLog.mutateAsync({
          dialpad_call_id: activeDialpadCallId,
          call_log_id: insertedLog.id,
        });
      }

      if (requiresPipelineAssignment) {
        await createPipelineItem.mutateAsync({
          contact_id: currentContact.id,
          source_call_log_id: insertedLog.id,
          pipeline_type: selectedOutcome === "follow_up" ? "follow_up" : "booked",
          assigned_user_id: assignedRepId,
          created_by: user.id,
          scheduled_for: scheduledFor,
          notes,
        });
      }

      await updateContact.mutateAsync({
        id: currentContact.id,
        status: "called",
        last_outcome: selectedOutcome,
        is_dnc: selectedOutcome === "dnc",
      });

      setCallCount((prev) => prev + 1);
      setSessionOutcomes((prev) => ({
        ...prev,
        [selectedOutcome]: (prev[selectedOutcome] || 0) + 1,
      }));

      toast.success(`Logged: ${OUTCOME_CONFIG[selectedOutcome].label}`);
      activeDialRequestRef.current = null;
      setActiveDialpadCallId(null);
      setActiveDialpadCallState(null);
      setSelectedOutcome(null);
      setNotes("");
      setFollowUpDate(undefined);
      setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
      setAssignedRepId(user.id);
    } catch {
      toast.error("Failed to log call. Try again.");
    }
  }, [
    activeDialpadCallId,
    assignedRepId,
    createCallLog,
    createPipelineItem,
    currentContact,
    followUpDate,
    followUpTime,
    linkDialpadCallLog,
    notes,
    requiresBookedSchedule,
    requiresFollowUpSchedule,
    requiresPipelineAssignment,
    selectedOutcome,
    updateContact,
    user,
  ]);

  const cancelActiveCall = useCallback(async () => {
    if (!activeDialpadCallId) return;

    try {
      const status = await dialpadCallStatus.mutateAsync(activeDialpadCallId);
      const currentState = typeof status?.state === "string" ? status.state.toLowerCase() : null;
      setActiveDialpadCallState(currentState);

      if (currentState === "hangup") {
        setActiveDialpadCallId(null);
        toast.info("This call has already ended.");
        return;
      }

      const result = await cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId });
      if (result?.already_ended) {
        setActiveDialpadCallId(null);
        setActiveDialpadCallState("hangup");
        toast.info("This call has already ended.");
        return;
      }

      toast.success("Call cancellation requested.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to cancel the active call.";
      toast.error(message);
    }
  }, [activeDialpadCallId, cancelDialpadCall, dialpadCallStatus]);

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
    if (isDialing && currentIndex !== null && uncalledContacts.length === 0) {
      stopSession();
    } else if (isDialing && currentIndex !== null && currentIndex >= uncalledContacts.length) {
      setCurrentIndex(uncalledContacts.length > 0 ? uncalledContacts.length - 1 : null);
      if (uncalledContacts.length === 0) stopSession();
    }
  }, [uncalledContacts.length, isDialing, currentIndex, stopSession]);

  useEffect(() => {
    if (!isDialing || !currentContact || !myDialpadSettings?.dialpad_user_id) return;

    const requestKey = `${currentContact.id}:${currentContact.phone}`;
    if (activeDialRequestRef.current === requestKey || dialpadCall.isPending) return;

    activeDialRequestRef.current = requestKey;
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);

    dialpadCall
      .mutateAsync({
        phone: currentContact.phone,
        dialpad_user_id: myDialpadSettings.dialpad_user_id,
        contact_id: currentContact.id,
      })
      .then((response) => {
        const dialpadCallId = typeof response?.dialpad_call_id === "string"
          ? response.dialpad_call_id
          : null;

        setActiveDialpadCallId(dialpadCallId);
        setActiveDialpadCallState(typeof response?.state === "string" ? response.state.toLowerCase() : null);
        toast.success(`Calling ${currentContact.phone} through Dialpad`);

        if (response?.tracking_warning) {
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
          <Select value={industry} onValueChange={setIndustry}>
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

          <Select value={stateFilter} onValueChange={setStateFilter}>
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
              {isLoading ? "..." : uncalledContacts.length} leads in queue
            </span>
            {myDialpadSettings ? (
              <span className="text-xs font-mono text-primary">
                <Phone className="mr-1 inline h-3 w-3" />
                {myDialpadSettings.dialpad_phone_number || myDialpadSettings.dialpad_user_id}
              </span>
            ) : (
              <span className="text-xs font-mono text-muted-foreground/60">
                No Dialpad number assigned
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
              disabled={uncalledContacts.length === 0 || isLoading}
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
                      </div>
                      <Button
                        variant="outline"
                        onClick={cancelActiveCall}
                        disabled={cancelDialpadCall.isPending}
                        className="w-full border-destructive text-destructive hover:bg-destructive/10"
                      >
                        {cancelDialpadCall.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <PhoneOff className="mr-2 h-4 w-4" />
                        )}
                        Cancel Active Call
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      Waiting for a tracked Dialpad call to start.
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
                  onClick={logAndNext}
                  disabled={!canSubmit}
                  className="w-full py-3 font-semibold"
                >
                  {createCallLog.isPending || createPipelineItem.isPending || linkDialpadCallLog.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Log & Next Lead
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
              {uncalledContacts.length === 0 && !isLoading ? "No Leads Available" : "Ready to Dial"}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {uncalledContacts.length === 0 && !isLoading
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
