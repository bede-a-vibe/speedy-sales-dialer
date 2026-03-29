import { forwardRef, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, CheckCircle2, Headphones, Loader2, Pause, Phone, PhoneCall, Play, RotateCcw, SkipForward, UserRound, SlidersHorizontal } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { DailyTarget } from "@/components/DailyTarget";
import { OutcomeButton } from "@/components/OutcomeButton";
import InlineBookingEmbed from "@/components/dialer/InlineBookingEmbed";
import { AdvancedFilters } from "@/components/dialer/AdvancedFilters";
import { DecisionMakerCapture } from "@/components/dialer/DecisionMakerCapture";
import { DialpadCTI } from "@/components/dialer/DialpadCTI";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCreateCallLog } from "@/hooks/useCallLogs";
import { useUpdateContact } from "@/hooks/useContacts";
import { useDialerSession } from "@/hooks/useDialerSession";
import { useDialerDialpad } from "@/hooks/useDialerDialpad";
import { useCreatePipelineItem, useSalesReps, type FollowUpMethod } from "@/hooks/usePipelineItems";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import { useGHLSync } from "@/hooks/useGHLSync";
import { useGHLContactLink } from "@/hooks/useGHLContactLink";
import { useGHLCalendars, useGHLPipelines } from "@/hooks/useGHLConfig";
import { BOOKED_APPOINTMENT_DEFAULT_TIME } from "@/lib/appointments";
import { cn } from "@/lib/utils";
import { CallOutcome, INDUSTRIES } from "@/data/mockData";
import {
  TRADE_TYPES,
  WORK_TYPES,
  BUSINESS_SIZES,
  PROSPECT_TIERS,
  AD_STATUS_OPTIONS,
  BUYING_SIGNAL_OPTIONS,
  GBP_RATING_OPTIONS,
  REVIEW_COUNT_OPTIONS,
  AUSTRALIAN_STATES,
} from "@/data/constants";
import type { DialerFilterOptions } from "@/hooks/useContacts";
import { toast } from "sonner";

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

const PanelSkeleton = forwardRef<HTMLDivElement, { height?: string }>(({ height = "h-40" }, ref) => (
  <div ref={ref} className="rounded-lg border border-border bg-card p-4">
    <div className="space-y-3">
      <Skeleton className="h-3 w-32" />
      <Skeleton className={cn("w-full", height)} />
    </div>
  </div>
));
PanelSkeleton.displayName = "PanelSkeleton";

export default function DialerPage() {
  const [industry, setIndustry] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [manualPhone, setManualPhone] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedCallerId, setSelectedCallerId] = useState<string>("");
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>("call");
  const [ghlCalendarId, setGhlCalendarId] = useState<string>("");
  const [ghlPipelineId, setGhlPipelineId] = useState<string>("");
  const [ghlStageId, setGhlStageId] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDialpadCTI, setShowDialpadCTI] = useState(true);

  // Dialpad CTI Client ID from environment variable
  const dialpadCTIClientId = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_DIALPAD_CTI_CLIENT_ID ?? null;

  // Advanced dialer filters
  const [tradeType, setTradeType] = useState<string>("all");
  const [workType, setWorkType] = useState<string>("all");
  const [businessSize, setBusinessSize] = useState<string>("all");
  const [prospectTier, setProspectTier] = useState<string>("all");
  const [minGbpRating, setMinGbpRating] = useState<number | null>(null);
  const [minReviewCount, setMinReviewCount] = useState<number | null>(null);
  const [hasGoogleAds, setHasGoogleAds] = useState<string>("all");
  const [hasFacebookAds, setHasFacebookAds] = useState<string>("all");
  const [buyingSignalStrength, setBuyingSignalStrength] = useState<string>("all");
  const [phoneType, setPhoneType] = useState<string>("all");
  const [hasDmPhone, setHasDmPhone] = useState<string>("all");

  const advancedFilters = useMemo<DialerFilterOptions>(() => ({
    tradeType,
    workType,
    businessSize,
    prospectTier,
    minGbpRating,
    minReviewCount,
    hasGoogleAds,
    hasFacebookAds,
    buyingSignalStrength,
    phoneType,
    hasDmPhone,
  }), [tradeType, workType, businessSize, prospectTier, minGbpRating, minReviewCount, hasGoogleAds, hasFacebookAds, buyingSignalStrength, phoneType, hasDmPhone]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (tradeType !== "all") count++;
    if (workType !== "all") count++;
    if (businessSize !== "all") count++;
    if (prospectTier !== "all") count++;
    if (minGbpRating && minGbpRating > 0) count++;
    if (minReviewCount && minReviewCount > 0) count++;
    if (hasGoogleAds !== "all") count++;
    if (hasFacebookAds !== "all") count++;
    if (buyingSignalStrength !== "all") count++;
    if (phoneType !== "all") count++;
    if (hasDmPhone !== "all") count++;
    return count;
  }, [tradeType, workType, businessSize, prospectTier, minGbpRating, minReviewCount, hasGoogleAds, hasFacebookAds, buyingSignalStrength, phoneType, hasDmPhone]);

  const resetAdvancedFilters = useCallback(() => {
    setTradeType("all");
    setWorkType("all");
    setBusinessSize("all");
    setProspectTier("all");
    setMinGbpRating(null);
    setMinReviewCount(null);
    setHasGoogleAds("all");
    setHasFacebookAds("all");
    setBuyingSignalStrength("all");
    setPhoneType("all");
    setHasDmPhone("all");
  }, []);

  const session = useDialerSession({ industry, stateFilter, filters: advancedFilters });
  const dialpad = useDialerDialpad({
    isDialing: session.isDialing,
    isSessionPaused: session.isSessionPaused,
    currentContact: session.currentContact,
    selectedCallerId,
  });

  const { data: salesReps = [] } = useSalesReps();
  const updateContact = useUpdateContact();
  const createCallLog = useCreateCallLog();
  const createPipelineItem = useCreatePipelineItem();
  const ghlSync = useGHLSync();
  const ghlLink = useGHLContactLink();
  const { data: ghlCalendars = [] } = useGHLCalendars();
  const { data: ghlPipelines = [] } = useGHLPipelines();

  const ghlSelectedPipelineStages = useMemo(
    () => ghlPipelines.find((p) => p.id === ghlPipelineId)?.stages ?? [],
    [ghlPipelines, ghlPipelineId],
  );

  const queueLeadCount = useMemo(
    () => Math.max(session.queue.totalCount, session.queue.contacts.length),
    [session.queue.totalCount, session.queue.contacts.length],
  );

  const requiresPipelineAssignment = session.selectedOutcome === "follow_up" || session.selectedOutcome === "booked";
  const requiresFollowUpSchedule = session.selectedOutcome === "follow_up";
  const requiresBookedSchedule = session.selectedOutcome === "booked";
  const requiresAnySchedule = requiresFollowUpSchedule || requiresBookedSchedule;

  const canSubmit = !!session.selectedOutcome
    && (!requiresPipelineAssignment || !!session.assignedRepId)
    && (!requiresAnySchedule || !!session.followUpDate)
    && (!requiresFollowUpSchedule || !!session.followUpTime)
    && !dialpad.isEndingCall
    && !createCallLog.isPending
    && !createPipelineItem.isPending
    && !dialpad.linkDialpadCallLog.isPending;

  const primaryActionLabel = requiresBookedSchedule
    ? (session.isSessionPaused ? "Booked & Hold Session" : "Booked & Next Lead")
    : (session.isSessionPaused ? "Log & Hold Session" : "Log & Next Lead");

  // Reset pipeline fields when outcome changes
  useEffect(() => {
    if (!requiresPipelineAssignment && session.user?.id) {
      session.setAssignedRepId(session.user.id);
    }
    if (!requiresAnySchedule) {
      session.setFollowUpDate(undefined);
      session.setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
    }
    if (!requiresBookedSchedule) {
      session.setIsBookedDateAutoDetected(false);
    }
  }, [requiresAnySchedule, requiresBookedSchedule, requiresPipelineAssignment, session.user?.id]);

  // Preload lazy panels when session starts
  useEffect(() => {
    if (!session.isSessionActive) return;
    void loadDialpadSyncPanel();
    void loadSessionSummaryDialog();
  }, [session.isSessionActive]);

  // Auto-link current contact to GHL when presented in the dialer
  // This ensures ghl_contact_id is available before any GHL sync happens
  useEffect(() => {
    if (!session.currentContact || !session.isSessionActive) return;
    const c = session.currentContact;
    const raw = c as Record<string, unknown>;
    ghlLink.ensureGHLLink({
      id: c.id,
      phone: c.phone,
      business_name: c.business_name,
      contact_person: (raw.contact_person as string) ?? null,
      email: (raw.email as string) ?? null,
      website: (raw.website as string) ?? null,
      city: (raw.city as string) ?? null,
      state: (raw.state as string) ?? null,
      industry: (raw.industry as string) ?? null,
      ghl_contact_id: (raw.ghl_contact_id as string) ?? null,
    }).catch(() => {});
  }, [session.currentContact?.id, session.isSessionActive]);

  const handleBookedDateDetected = useCallback((date: Date) => {
    session.setFollowUpDate((current) => {
      const currentKey = current ? format(current, "yyyy-MM-dd") : null;
      const nextKey = format(date, "yyyy-MM-dd");
      if (currentKey === nextKey && session.isBookedDateAutoDetected) return current;
      toast.success(`Booked date detected: ${format(date, "PPP")}`);
      return date;
    });
    session.setIsBookedDateAutoDetected(true);
  }, [session.isBookedDateAutoDetected]);

  const logAndNext = useCallback(async (outcomeOverride?: CallOutcome) => {
    const outcomeToLog = outcomeOverride ?? session.selectedOutcome;
    if (!outcomeToLog || !session.currentContact || !session.user || session.leadAdvanceInFlightRef.current) return;

    if (outcomeToLog === "follow_up" && (!session.followUpDate || !session.followUpTime)) {
      toast.error("Choose a follow-up date and time.");
      return;
    }
    if (outcomeToLog === "booked" && !session.followUpDate) {
      toast.error("Choose an appointment day.");
      return;
    }
    const needsPipelineAssignment = outcomeToLog === "follow_up" || outcomeToLog === "booked";
    if (needsPipelineAssignment && !session.assignedRepId) {
      toast.error("Choose a sales rep.");
      return;
    }

    session.leadAdvanceInFlightRef.current = true;

    // Fire-and-forget hangup
    dialpad.fireAndForgetHangup();

    // Capture values before advancing
    const contactId = session.currentContact.id;
    const userId = session.user.id;
    const contactFollowUpNote = session.currentContact.follow_up_note;
    const contactGhlId = (session.currentContact as Record<string, unknown>).ghl_contact_id as string | null
      ?? ghlLink.getCachedGHLId(session.currentContact.id);
    const contactName = session.currentContact.business_name;
    const dialpadCallId = dialpad.getDialpadCallIdForLog();
    const scheduledFor = session.followUpDate
      ? combineDateAndTime(session.followUpDate, outcomeToLog === "follow_up" ? session.followUpTime : BOOKED_APPOINTMENT_DEFAULT_TIME).toISOString()
      : null;
    const pipelineNotes = session.notes;
    const repId = session.assignedRepId;
    const method = followUpMethod;
    const calendarId = ghlCalendarId;
    const pipelineId = ghlPipelineId;
    const stageId = ghlStageId;
    const repName = salesReps.find((r) => r.user_id === repId)?.display_name ?? undefined;

    // Advance immediately
    const nextLength = session.queue.contacts.length - 1;
    void session.queue.discardContact(contactId, { releaseLock: true });
    if (nextLength <= 0) {
      session.setCurrentIndex(null);
    } else if (session.currentIndex !== null && session.currentIndex >= nextLength) {
      session.setCurrentIndex(nextLength - 1);
    }
    session.resetLeadState(userId);
    dialpad.resetDialpadState();
    setFollowUpMethod("call");
    setGhlCalendarId("");
    setGhlPipelineId("");
    setGhlStageId("");
    void session.queue.ensureBuffer();

    session.recordOutcome(outcomeToLog);
    session.leadAdvanceInFlightRef.current = false;

    if (nextLength <= 0) {
      session.stopSession();
    }

    // Background DB writes
    (async () => {
      try {
        const [insertedLog] = await Promise.all([
          createCallLog.mutateAsync({
            contact_id: contactId,
            user_id: userId,
            outcome: outcomeToLog,
            notes: pipelineNotes || undefined,
            follow_up_date: scheduledFor,
            dialpad_call_id: dialpadCallId,
          }),
          updateContact.mutateAsync({
            id: contactId,
            status: ["dnc", "follow_up", "booked"].includes(outcomeToLog) ? outcomeToLog : "uncalled",
            last_outcome: outcomeToLog,
            is_dnc: outcomeToLog === "dnc",
            follow_up_note: null,
          }),
        ]);

        if (needsPipelineAssignment) {
          await createPipelineItem.mutateAsync({
            contact_id: contactId,
            source_call_log_id: insertedLog.id,
            pipeline_type: outcomeToLog === "follow_up" ? "follow_up" : "booked",
            assigned_user_id: repId,
            created_by: userId,
            scheduled_for: scheduledFor,
            notes: pipelineNotes,
            ...(outcomeToLog === "follow_up" ? { follow_up_method: method } : {}),
          });
        }

        // If this was a requeued follow-up and got no_answer, schedule again for same time tomorrow
        if (outcomeToLog === "no_answer" && contactFollowUpNote) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          // Preserve the original scheduled hour by using current time as fallback
          const nextScheduled = tomorrow.toISOString();
          await createPipelineItem.mutateAsync({
            contact_id: contactId,
            source_call_log_id: insertedLog.id,
            pipeline_type: "follow_up",
            assigned_user_id: userId,
            created_by: userId,
            scheduled_for: nextScheduled,
            notes: contactFollowUpNote,
          });
          // Set status back to follow_up so the cron job will requeue it tomorrow
          await updateContact.mutateAsync({
            id: contactId,
            status: "follow_up",
          });
        }

        if (dialpadCallId) {
          dialpad.linkDialpadCallLog.mutateAsync({
            dialpad_call_id: dialpadCallId,
            call_log_id: insertedLog.id,
          }).catch(() => {});
        }
      } catch {
        toast.error("Failed to save call log — please check your records.");
      }

      // ── GHL Sync (fire-and-forget) ──
      if (contactGhlId) {
        ghlSync.pushCallNote({
          ghlContactId: contactGhlId,
          outcome: outcomeToLog,
          notes: pipelineNotes || undefined,
          repName,
        }).catch(() => {});

        if (outcomeToLog === "booked" && scheduledFor && calendarId) {
          ghlSync.pushBooking({
            ghlContactId: contactGhlId,
            calendarId,
            scheduledFor,
            contactName,
            repName,
            notes: pipelineNotes || undefined,
            pipelineId: pipelineId || undefined,
            pipelineStageId: stageId || undefined,
          }).catch(() => {});
        }

        if (outcomeToLog === "follow_up" && scheduledFor) {
          ghlSync.pushFollowUp({
            ghlContactId: contactGhlId,
            scheduledFor,
            method,
          }).catch(() => {});
        }

        if (outcomeToLog === "dnc") {
          ghlSync.pushDNC({ ghlContactId: contactGhlId }).catch(() => {});
        }
      }
    })();
  }, [session, dialpad, createCallLog, createPipelineItem, updateContact, ghlSync, ghlLink, salesReps, ghlCalendarId, ghlPipelineId, ghlStageId]);

  const skipLead = useCallback(async () => {
    if (session.currentIndex === null || !session.currentContact) return;

    if (!dialpad.isCallTerminal) {
      void dialpad.cancelActiveCall();
    }

    void updateContact.mutateAsync({
      id: session.currentContact.id,
      call_attempt_count: (session.currentContact.call_attempt_count ?? 0) + 1,
    }).catch(() => {});

    const nextLength = session.queue.contacts.length - 1;
    void session.queue.discardContact(session.currentContact.id, { releaseLock: true });
    session.incrementSkipped();
    session.resetLeadState(session.user?.id || "");
    dialpad.resetDialpadState();
    void session.queue.ensureBuffer();

    if (nextLength <= 0) {
      toast.info("No more leads in queue.");
      session.stopSession();
      return;
    }

    if (session.currentIndex >= nextLength) {
      session.setCurrentIndex(nextLength - 1);
    }
  }, [session, dialpad, updateContact]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!session.isSessionActive || !session.currentContact) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
      const outcomes: CallOutcome[] = ["no_answer", "voicemail", "not_interested", "dnc", "follow_up", "booked"];
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < outcomes.length) session.setSelectedOutcome(outcomes[idx]);
      if (e.key === "Enter" && canSubmit) { e.preventDefault(); void logAndNext(); }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); skipLead(); }
      if ((e.key === "p" || e.key === "P") && dialpad.isCallTerminal) {
        e.preventDefault();
        if (session.isDialing) {
          session.pauseSession(async () => {
            if (dialpad.activeDialpadCallId && dialpad.activeDialpadCallState !== "hangup") {
              try { await dialpad.cancelDialpadCall.mutateAsync({ call_id: dialpad.activeDialpadCallId }); } catch {}
            }
          });
        } else if (session.isSessionPaused) {
          session.resumeSession();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canSubmit, session.currentContact, dialpad.isCallTerminal, session.isDialing, session.isSessionActive, session.isSessionPaused, logAndNext, skipLead]);

  const outcomes: CallOutcome[] = ["no_answer", "voicemail", "not_interested", "dnc", "follow_up", "booked"];

  return (
    <AppLayout title="Dialer">
      <div className="mx-auto max-w-6xl space-y-6">
        <DailyTarget />

        <Suspense fallback={<Dialog open={session.showSummary}><DialogContent className="sm:max-w-md"><PanelSkeleton height="h-56" /></DialogContent></Dialog>}>
          <SessionSummaryDialog
            open={session.showSummary}
            onOpenChange={session.setShowSummary}
            callCount={session.callCount}
            skippedCount={session.skippedCount}
            sessionOutcomes={session.sessionOutcomes}
          />
        </Suspense>

        {/* ── Filters & Controls ── */}
        <div className="flex flex-wrap items-center gap-4">
          <Select value={industry} onValueChange={setIndustry} disabled={session.isSessionActive}>
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

          <Select value={stateFilter} onValueChange={setStateFilter} disabled={session.isSessionActive}>
            <SelectTrigger className="w-[180px] border-border bg-card">
              <SelectValue placeholder="Filter by state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {AUSTRALIAN_STATES.map((state) => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={showAdvancedFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            disabled={session.isSessionActive}
            className="relative gap-1.5"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>

          {dialpadCTIClientId && (
            <Button
              variant={showDialpadCTI ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowDialpadCTI(!showDialpadCTI)}
              className="gap-1.5"
            >
              <Headphones className="h-3.5 w-3.5" />
              {showDialpadCTI ? "Hide Dialpad" : "Show Dialpad"}
            </Button>
          )}

          <div className="flex flex-1 flex-wrap items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">
              {session.queue.isLoading ? "..." : queueLeadCount} leads in queue
            </span>
            {dialpad.myDialpadSettings ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-primary">
                  <Phone className="mr-1 inline h-3 w-3" />
                  {dialpad.myDialpadSettings.dialpad_phone_number || dialpad.myDialpadSettings.dialpad_user_id}
                </span>
                {dialpad.callerIdOptions.length > 1 && (
                  <Select value={selectedCallerId} onValueChange={setSelectedCallerId}>
                    <SelectTrigger className="h-7 w-auto min-w-[140px] border-border bg-card text-xs">
                      <SelectValue placeholder="Caller ID" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Auto (default)</SelectItem>
                      {dialpad.callerIdOptions.map((opt) => (
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
            {dialpad.dialpadPollingBackoffUntil && dialpad.dialpadPollingBackoffUntil > Date.now() && (
              <span className="text-xs font-mono text-muted-foreground">
                Dialpad status refresh paused briefly after rate limiting.
              </span>
            )}
            {session.isSessionActive && (
              <>
                <span className="text-xs font-mono text-primary">
                  {session.callCount} calls · {session.skippedCount} skipped{session.queue.isPrefetching ? " · loading next leads" : ""}{session.isSessionPaused ? " · paused" : ""}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  Active {session.formatDuration(session.totalDialingMs)}
                </span>
                <span className="text-xs font-mono text-muted-foreground">
                  Paused {session.formatDuration(session.totalPausedMs)}
                </span>
              </>
            )}
          </div>

          {!session.isSessionActive ? (
            <>
              <Button
                onClick={session.startDialing}
                disabled={session.queue.isLoading || session.isStartingSession || session.isRecoveringQueue || !dialpad.hasDialpadAssignment}
                className="px-6 font-semibold"
              >
                {session.isStartingSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                {session.isStartingSession ? "Starting..." : "Start Dialing"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void session.recoverQueue()}
                disabled={session.queue.isLoading || session.isStartingSession || session.isRecoveringQueue}
                className="px-6 font-semibold"
              >
                {session.isRecoveringQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                {session.isRecoveringQueue ? "Recovering..." : "Recover Queue"}
              </Button>
            </>
          ) : (
            <>
              {session.isSessionPaused ? (
                <Button onClick={session.resumeSession} className="px-6 font-semibold">
                  <Play className="mr-2 h-4 w-4" />
                  Resume Dialing
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => session.pauseSession(async () => {
                    if (dialpad.activeDialpadCallId && dialpad.activeDialpadCallState !== "hangup") {
                      try { await dialpad.cancelDialpadCall.mutateAsync({ call_id: dialpad.activeDialpadCallId }); } catch {}
                    }
                  })}
                  disabled={dialpad.isEndingCall}
                  className="px-6 font-semibold"
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause Dialing
                </Button>
              )}
              <Button variant="outline" onClick={session.stopSession} className="border-destructive text-destructive hover:bg-destructive/10">
                Stop Session
              </Button>
              <Button
                variant="outline"
                onClick={() => void session.recoverQueue()}
                disabled={session.isRecoveringQueue || session.isStartingSession}
                className="px-6 font-semibold"
              >
                {session.isRecoveringQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                {session.isRecoveringQueue ? "Recovering..." : "Recover Queue"}
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
                <DialogDescription>Place a Dialpad call directly to any phone number.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Input
                  type="tel"
                  placeholder="Enter phone number..."
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="font-mono text-lg tracking-wider"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && manualPhone.trim() && dialpad.myDialpadSettings?.dialpad_user_id) {
                      try {
                        await dialpad.dialpadCall.mutateAsync({
                          phone: manualPhone.trim(),
                          dialpad_user_id: dialpad.myDialpadSettings.dialpad_user_id,
                          caller_id: selectedCallerId || undefined,
                        });
                        toast.success(`Calling ${manualPhone.trim()} through Dialpad`);
                        setManualOpen(false);
                        setManualPhone("");
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Unable to place Dialpad call.");
                      }
                    }
                  }}
                />
                <Button
                  className="w-full font-semibold"
                  disabled={!manualPhone.trim() || !dialpad.myDialpadSettings?.dialpad_user_id || dialpad.dialpadCall.isPending}
                  onClick={async () => {
                    try {
                      await dialpad.dialpadCall.mutateAsync({
                        phone: manualPhone.trim(),
                        dialpad_user_id: dialpad.myDialpadSettings!.dialpad_user_id,
                        caller_id: selectedCallerId || undefined,
                      });
                      toast.success(`Calling ${manualPhone.trim()} through Dialpad`);
                      setManualOpen(false);
                      setManualPhone("");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Unable to place Dialpad call.");
                    }
                  }}
                >
                  {dialpad.dialpadCall.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                  Dial {manualPhone.trim() || "..."}
                </Button>
                {!dialpad.myDialpadSettings?.dialpad_user_id && (
                  <p className="text-sm text-muted-foreground">
                    Assign a Dialpad number to your user before placing calls.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {showAdvancedFilters && (
          <AdvancedFilters
            tradeType={tradeType}
            setTradeType={setTradeType}
            workType={workType}
            setWorkType={setWorkType}
            businessSize={businessSize}
            setBusinessSize={setBusinessSize}
            prospectTier={prospectTier}
            setProspectTier={setProspectTier}
            minGbpRating={minGbpRating}
            setMinGbpRating={setMinGbpRating}
            minReviewCount={minReviewCount}
            setMinReviewCount={setMinReviewCount}
            hasGoogleAds={hasGoogleAds}
            setHasGoogleAds={setHasGoogleAds}
            hasFacebookAds={hasFacebookAds}
            setHasFacebookAds={setHasFacebookAds}
            buyingSignalStrength={buyingSignalStrength}
            setBuyingSignalStrength={setBuyingSignalStrength}
            phoneType={phoneType}
            setPhoneType={setPhoneType}
            hasDmPhone={hasDmPhone}
            setHasDmPhone={setHasDmPhone}
            onReset={resetAdvancedFilters}
            disabled={session.isSessionActive}
          />
        )}

        {/* ── Active Session ── */}
        {session.isSessionActive && session.currentContact ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              {session.isSessionPaused && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  Session paused — this lead is held in your queue and no new call will start until you resume.
                </div>
              )}

              <ContactCard contact={session.currentContact} />

              <DecisionMakerCapture
                contactId={session.currentContact.id}
                businessName={session.currentContact.business_name || ""}
                ghlContactId={(session.currentContact as any).ghl_contact_id || ghlLink.ghlContactId}
                existingDmName={(session.currentContact as any).dm_name}
                existingDmTitle={(session.currentContact as any).dm_title}
                existingDmPhone={(session.currentContact as any).dm_phone}
                existingDmEmail={(session.currentContact as any).dm_email}
                existingDmLinkedin={(session.currentContact as any).dm_linkedin}
                existingGatekeeperName={(session.currentContact as any).gatekeeper_name}
                existingGatekeeperNotes={(session.currentContact as any).gatekeeper_notes}
                existingBestRouteToDecisionMaker={(session.currentContact as any).best_route_to_dm}
              />

              <Suspense fallback={<PanelSkeleton height="h-36" />}>
                <DialpadSyncPanel
                  contactId={session.currentContact.id}
                  activeDialpadCallId={dialpad.activeDialpadCallId}
                  activeDialpadCallState={dialpad.activeDialpadCallState}
                  onCancelCall={dialpad.cancelActiveCall}
                  isCancelling={dialpad.cancelDialpadCall.isPending}
                  isStatusPending={dialpad.isDialpadCallStatusPending}
                  isEndingCall={dialpad.isEndingCall}
                  isResolving={dialpad.isCallResolving}
                  callStartedAt={dialpad.callStartedAt}
                  enabled
                />
              </Suspense>

              {/* Embedded Dialpad CTI — no need to open Dialpad separately */}
              <DialpadCTI
                clientId={dialpadCTIClientId}
                visible={showDialpadCTI}
                onToggleVisible={() => setShowDialpadCTI((v) => !v)}
                phoneNumber={session.currentContact?.phone ?? null}
                autoInitiateCall={session.isDialing && !session.isSessionPaused}
                outboundCallerId={selectedCallerId || null}
                customData={session.currentContact ? JSON.stringify({
                  contact_id: session.currentContact.id,
                  business_name: session.currentContact.business_name,
                }) : null}
              />
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
                      selected={session.selectedOutcome === outcome}
                      onClick={session.setSelectedOutcome}
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
                    <Select value={session.assignedRepId} onValueChange={session.setAssignedRepId}>
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
                      {session.assignedRepId
                        ? getRepLabel(salesReps.find((r) => r.user_id === session.assignedRepId)?.display_name || null, salesReps.find((r) => r.user_id === session.assignedRepId)?.email || null)
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
                            <Button variant="outline" className={cn("w-full justify-start border-border bg-background text-left font-normal", !session.followUpDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {session.followUpDate ? format(session.followUpDate, "PPP") : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={session.followUpDate} onSelect={session.setFollowUpDate} disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))} initialFocus className="pointer-events-auto p-3" />
                          </PopoverContent>
                        </Popover>
                        <Input type="time" value={session.followUpTime} onChange={(e) => session.setFollowUpTime(e.target.value)} className="border-border bg-background" />
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
                              <Button variant="outline" className={cn("w-full justify-start border-border bg-background text-left font-normal", !session.followUpDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {session.followUpDate ? format(session.followUpDate, "PPP") : "Confirm appointment date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={session.followUpDate}
                                onSelect={(date) => {
                                  session.setFollowUpDate(date);
                                  session.setIsBookedDateAutoDetected(false);
                                }}
                                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                initialFocus
                                className="pointer-events-auto p-3"
                              />
                            </PopoverContent>
                          </Popover>
                          <p className="text-xs text-muted-foreground">
                            {session.followUpDate
                              ? session.isBookedDateAutoDetected
                                ? "Date auto-detected from the booking widget — adjust it if needed."
                                : "Date confirmed manually for reporting and pipeline accuracy."
                              : "Choose the booked appointment day before moving to the next call."}
                          </p>
                        </div>
                      </div>

                      {/* GHL Calendar selector */}
                      <div>
                        <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          GHL Calendar
                        </label>
                        <Select value={ghlCalendarId} onValueChange={setGhlCalendarId}>
                          <SelectTrigger className="w-full border-border bg-background">
                            <SelectValue placeholder="Select GHL calendar" />
                          </SelectTrigger>
                          <SelectContent>
                            {ghlCalendars.map((cal) => (
                              <SelectItem key={cal.id} value={cal.id}>{cal.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* GHL Pipeline selector */}
                      <div>
                        <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          GHL Pipeline (optional)
                        </label>
                        <Select value={ghlPipelineId} onValueChange={(v) => { setGhlPipelineId(v); setGhlStageId(""); }}>
                          <SelectTrigger className="w-full border-border bg-background">
                            <SelectValue placeholder="Select pipeline" />
                          </SelectTrigger>
                          <SelectContent>
                            {ghlPipelines.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* GHL Stage selector */}
                      {ghlPipelineId && ghlSelectedPipelineStages.length > 0 && (
                        <div>
                          <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                            Pipeline Stage
                          </label>
                          <Select value={ghlStageId} onValueChange={setGhlStageId}>
                            <SelectTrigger className="w-full border-border bg-background">
                              <SelectValue placeholder="Select stage" />
                            </SelectTrigger>
                            <SelectContent>
                              {ghlSelectedPipelineStages.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {session.selectedOutcome === "follow_up" && (
                <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                  <div>
                    <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                      Follow-up Type
                    </label>
                    <FollowUpMethodSelector value={followUpMethod} onChange={setFollowUpMethod} />
                  </div>
                  <div>
                    <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                      Follow-up Notes
                    </label>
                    <Textarea
                      value={session.notes}
                      onChange={(e) => session.setNotes(e.target.value)}
                      placeholder="Enter follow-up details..."
                      className="min-h-[80px] resize-none border-border bg-background text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Button onClick={() => void logAndNext()} disabled={!canSubmit} className="w-full py-3 font-semibold">
                  {createCallLog.isPending || createPipelineItem.isPending || dialpad.linkDialpadCallLog.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {primaryActionLabel}
                  <kbd className="ml-2 rounded bg-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-mono opacity-70">Enter</kbd>
                </Button>
                <Button variant="outline" onClick={skipLead} className="w-full border-border text-muted-foreground hover:text-foreground">
                  <SkipForward className="mr-2 h-4 w-4" />
                  Skip Lead
                  <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono opacity-70">S</kbd>
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
              {session.queue.isLoading ? "Checking Queue" : queueLeadCount === 0 ? "No Leads Available" : "Ready to Dial"}
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {session.queue.isLoading
                ? "Checking the current queue for available leads."
                : queueLeadCount === 0
                  ? "All contacts in this queue have been called. Try a different industry or state filter, or upload new lists."
                  : "Filter by industry and state, then hit 'Start Dialing' to begin your calling session. Use number keys 1-7 to quickly select outcomes, S to skip, Enter to log."}
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
