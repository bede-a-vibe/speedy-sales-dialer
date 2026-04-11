import { forwardRef, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, CheckCircle2, Globe, Headphones, Loader2, Mail, MapPin, NotebookPen, Pause, Phone, PhoneCall, Play, RotateCcw, SkipForward, SlidersHorizontal, TimerReset, UserCheck, UserRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { DailyTarget } from "@/components/DailyTarget";
import { OutcomeButton } from "@/components/OutcomeButton";

import { AdvancedFilters } from "@/components/dialer/AdvancedFilters";
import { DecisionMakerCapture } from "@/components/dialer/DecisionMakerCapture";
import { DialpadCTI } from "@/components/dialer/DialpadCTI";
import { PowerHourTimer } from "@/components/dialer/PowerHourTimer";
import { SalesToolkit } from "@/components/dialer/SalesToolkit";
import { Badge } from "@/components/ui/badge";
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
import { supabase } from "@/integrations/supabase/client";
import { BOOKED_APPOINTMENT_DEFAULT_TIME } from "@/lib/appointments";
import { getContactStatusForOutcome, getPipelineTypeForOutcome, shouldCreatePipelineItemForOutcome } from "@/lib/pipelineMappings";
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

function formatFilterSummary(label: string, values: string[]) {
  if (values.length === 0) return null;
  if (values.length === 1) return `${label}: ${values[0]}`;
  return `${label}: ${values[0]} +${values.length - 1}`;
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
  const [industries, setIndustries] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [contactOwner, setContactOwner] = useState<string>("all");
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
  const [tradeTypes, setTradeTypes] = useState<string[]>([]);
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
    industries,
    states,
    tradeTypes,
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
    contactOwner,
  }), [industries, states, tradeTypes, workType, businessSize, prospectTier, minGbpRating, minReviewCount, hasGoogleAds, hasFacebookAds, buyingSignalStrength, phoneType, hasDmPhone, contactOwner]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (industries.length > 0) count++;
    if (states.length > 0) count++;
    if (contactOwner !== "all") count++;
    if (tradeTypes.length > 0) count++;
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
  }, [industries, states, contactOwner, tradeTypes, workType, businessSize, prospectTier, minGbpRating, minReviewCount, hasGoogleAds, hasFacebookAds, buyingSignalStrength, phoneType, hasDmPhone]);

  const resetAdvancedFilters = useCallback(() => {
    setIndustries([]);
    setStates([]);
    setContactOwner("all");
    setTradeTypes([]);
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

  const session = useDialerSession({ filters: advancedFilters });
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

  const activeFilterSummary = useMemo(
    () => [
      formatFilterSummary("Industry", industries),
      formatFilterSummary("State", states),
      formatFilterSummary("Trade", tradeTypes),
      contactOwner !== "all" ? `Owner: ${getRepLabel(salesReps.find((rep) => rep.user_id === contactOwner)?.display_name ?? null, salesReps.find((rep) => rep.user_id === contactOwner)?.email ?? contactOwner)}` : null,
      workType !== "all" ? `Work: ${WORK_TYPES.find((item) => item.value === workType)?.label ?? workType}` : null,
      businessSize !== "all" ? `Business: ${BUSINESS_SIZES.find((item) => item.value === businessSize)?.label ?? businessSize}` : null,
      prospectTier !== "all" ? `Tier: ${PROSPECT_TIERS.find((item) => item.value === prospectTier)?.label ?? prospectTier}` : null,
      hasGoogleAds !== "all" ? `Google Ads: ${AD_STATUS_OPTIONS.find((item) => item.value === hasGoogleAds)?.label ?? hasGoogleAds}` : null,
      hasFacebookAds !== "all" ? `Facebook Ads: ${AD_STATUS_OPTIONS.find((item) => item.value === hasFacebookAds)?.label ?? hasFacebookAds}` : null,
      buyingSignalStrength !== "all" ? `Buying signal: ${BUYING_SIGNAL_OPTIONS.find((item) => item.value === buyingSignalStrength)?.label ?? buyingSignalStrength}` : null,
      phoneType !== "all" ? `Phone: ${phoneType}` : null,
      hasDmPhone !== "all" ? `DM phone: ${hasDmPhone}` : null,
      minGbpRating ? `Min GBP: ${GBP_RATING_OPTIONS.find((item) => item.value === minGbpRating)?.label ?? `${minGbpRating}+`}` : null,
      minReviewCount ? `Min reviews: ${REVIEW_COUNT_OPTIONS.find((item) => item.value === minReviewCount)?.label ?? `${minReviewCount}+`}` : null,
    ].filter(Boolean) as string[],
    [industries, states, tradeTypes, contactOwner, salesReps, workType, businessSize, prospectTier, hasGoogleAds, hasFacebookAds, buyingSignalStrength, phoneType, hasDmPhone, minGbpRating, minReviewCount],
  );

  const requiresPipelineAssignment = session.selectedOutcome === "follow_up" || session.selectedOutcome === "booked";
  const requiresFollowUpSchedule = session.selectedOutcome === "follow_up";
  const requiresBookedSchedule = session.selectedOutcome === "booked";
  const requiresAnySchedule = requiresFollowUpSchedule || requiresBookedSchedule;

  // Auto-select first GHL calendar and pipeline when available
  useEffect(() => {
    if (!ghlCalendarId && ghlCalendars.length > 0) {
      setGhlCalendarId(ghlCalendars[0].id);
    }
  }, [ghlCalendars, ghlCalendarId]);

  useEffect(() => {
    if (!ghlPipelineId && ghlPipelines.length > 0) {
      setGhlPipelineId(ghlPipelines[0].id);
      const firstStage = ghlPipelines[0].stages?.[0];
      if (firstStage && !ghlStageId) {
        setGhlStageId(firstStage.id);
      }
    }
  }, [ghlPipelines, ghlPipelineId, ghlStageId]);

  const canSubmit = !!session.selectedOutcome
    && (!requiresPipelineAssignment || !!session.assignedRepId)
    && (!requiresAnySchedule || !!session.followUpDate)
    && (!requiresFollowUpSchedule || !!session.followUpTime)
    && (!requiresBookedSchedule || (!!session.followUpTime && !!ghlCalendarId))
    && !dialpad.isEndingCall
    && !createCallLog.isPending
    && !createPipelineItem.isPending
    && !dialpad.linkDialpadCallLog.isPending;

  const primaryActionLabel = requiresBookedSchedule
    ? (session.isSessionPaused ? "Booked & Hold Session" : "Booked & Next Lead")
    : (session.isSessionPaused ? "Log & Hold Session" : "Log & Next Lead");

  const submitReadinessItems = useMemo(() => {
    const items: string[] = [];

    if (!session.selectedOutcome) items.push("Select a call outcome");
    if (requiresPipelineAssignment && !session.assignedRepId) items.push("Assign a sales rep");
    if (requiresAnySchedule && !session.followUpDate) items.push(requiresBookedSchedule ? "Choose an appointment date" : "Choose a follow-up date");
    if (requiresFollowUpSchedule && !session.followUpTime) items.push("Choose a follow-up time");
    if (requiresBookedSchedule && !session.followUpTime) items.push("Choose an appointment time");
    if (requiresBookedSchedule && !ghlCalendarId) items.push("Select a GHL calendar");
    if (dialpad.isEndingCall) items.push("Wait for the active call to finish ending");
    if (createCallLog.isPending || createPipelineItem.isPending || dialpad.linkDialpadCallLog.isPending) items.push("Saving the previous action");

    return items;
  }, [
    session.selectedOutcome,
    session.assignedRepId,
    session.followUpDate,
    session.followUpTime,
    requiresPipelineAssignment,
    requiresAnySchedule,
    requiresFollowUpSchedule,
    requiresBookedSchedule,
    ghlCalendarId,
    dialpad.isEndingCall,
    createCallLog.isPending,
    createPipelineItem.isPending,
    dialpad.linkDialpadCallLog.isPending,
  ]);

  // Reset pipeline fields when outcome changes
  useEffect(() => {
    if (!requiresPipelineAssignment && session.user?.id) {
      session.setAssignedRepId(session.user.id);
    }
    if (!requiresAnySchedule) {
      session.setFollowUpDate(undefined);
      session.setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
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
    if (outcomeToLog === "booked" && !session.followUpTime) {
      toast.error("Choose an appointment time.");
      return;
    }
    const needsPipelineAssignment = shouldCreatePipelineItemForOutcome(outcomeToLog);
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
      ? combineDateAndTime(session.followUpDate, session.followUpTime || BOOKED_APPOINTMENT_DEFAULT_TIME).toISOString()
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
            status: getContactStatusForOutcome(outcomeToLog),
            last_outcome: outcomeToLog,
            is_dnc: outcomeToLog === "dnc",
            follow_up_note: null,
            ...(outcomeToLog === "voicemail" ? { voicemail_count: ((session.currentContact as any)?.voicemail_count ?? 0) + 1 } : {}),
          }),
        ]);

        const pipelineType = getPipelineTypeForOutcome(outcomeToLog);
        if (pipelineType) {
          await createPipelineItem.mutateAsync({
            contact_id: contactId,
            source_call_log_id: insertedLog.id,
            pipeline_type: pipelineType,
            assigned_user_id: repId,
            created_by: userId,
            scheduled_for: scheduledFor,
            notes: pipelineNotes,
            ...(pipelineType === "follow_up" ? { follow_up_method: method } : {}),
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
            contactName,
            repName,
          }).catch(() => {});

          // If follow-up method is email, generate and push a draft email to GHL
          if (method === "email") {
            // Fetch latest AI summary note for context
            const latestSummary = await (async () => {
              try {
                const { data: notes } = await supabase
                  .from("contact_notes")
                  .select("content")
                  .eq("contact_id", contactId)
                  .eq("source", "dialpad_summary")
                  .order("created_at", { ascending: false })
                  .limit(1);
                return notes?.[0]?.content ?? null;
              } catch { return null; }
            })();

            ghlSync.pushFollowUpEmailDraft({
              ghlContactId: contactGhlId,
              contactName: contactName ?? "there",
              businessName: (session.currentContact as any)?.business_name ?? contactName ?? "",
              industry: (session.currentContact as any)?.industry ?? undefined,
              repName: repName ?? "The Odin Team",
              callNotes: pipelineNotes || undefined,
              callTranscriptSummary: latestSummary ?? undefined,
              scheduledFor: scheduledFor ?? undefined,
            }).catch(() => {});
          }
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
  const currentLeadMeta = session.currentContact ? (session.currentContact as Record<string, unknown>) : null;
  const quickFacts = session.currentContact ? [
    session.currentContact.industry,
    [session.currentContact.city, session.currentContact.state].filter(Boolean).join(", "),
    currentLeadMeta?.dm_name ? `DM: ${String(currentLeadMeta.dm_name)}` : null,
    typeof currentLeadMeta?.gatekeeper_name === "string" ? `Gatekeeper: ${String(currentLeadMeta.gatekeeper_name)}` : null,
  ].filter(Boolean) as string[] : [];

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
                  {session.totalDialingMs > 60000 && (
                    <> · {Math.round((session.callCount / (session.totalDialingMs / 3600000)) * 10) / 10} calls/hr</>
                  )}
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
            industries={industries}
            setIndustries={setIndustries}
            states={states}
            setStates={setStates}
            contactOwner={contactOwner}
            setContactOwner={setContactOwner}
            salesReps={salesReps}
            tradeTypes={tradeTypes}
            setTradeTypes={setTradeTypes}
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

        {activeFilterSummary.length > 0 && !session.isSessionActive && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Queue targeting</p>
                <p className="text-sm text-foreground">Current lead filters that will shape the next dial session.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={resetAdvancedFilters} className="text-muted-foreground">
                Clear all
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFilterSummary.map((item) => (
                <Badge key={item} variant="secondary" className="px-2.5 py-1 text-xs font-medium">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* ── Active Session ── */}
        {session.isSessionActive && session.currentContact ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Current lead</p>
                    <h2 className="text-lg font-semibold text-foreground">{session.currentContact.business_name}</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickFacts.map((fact) => (
                        <Badge key={fact} variant="outline" className="text-xs">
                          {fact}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-[250px]">
                    <div className="rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-muted-foreground">Queue position</div>
                      <div className="font-mono text-foreground">{session.currentIndex !== null ? `${session.currentIndex + 1} / ${Math.max(session.queue.contacts.length, session.currentIndex + 1)}` : "-"}</div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2">
                      <div className="text-muted-foreground">Session pace</div>
                      <div className="font-mono text-foreground">{session.totalDialingMs > 60000 ? `${Math.round((session.callCount / (session.totalDialingMs / 3600000)) * 10) / 10}/hr` : "Warming up"}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <a href={`tel:${session.currentContact.phone}`} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">
                    <Phone className="h-4 w-4 text-primary" />
                    <span className="truncate font-mono">{session.currentContact.phone}</span>
                  </a>
                  <a href={session.currentContact.website || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="truncate">{session.currentContact.website ? "Open website" : "No website"}</span>
                  </a>
                  <a href={session.currentContact.email ? `mailto:${session.currentContact.email}` : "#"} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent">
                    <Mail className="h-4 w-4 text-primary" />
                    <span className="truncate">{session.currentContact.email || "No email"}</span>
                  </a>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span className="truncate">{[session.currentContact.city, session.currentContact.state].filter(Boolean).join(", ") || "Location unknown"}</span>
                  </div>
                </div>
              </div>

              {session.isSessionPaused && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  Session paused — this lead is held in your queue and no new call will start until you resume.
                </div>
              )}

              <ContactCard
                contact={session.currentContact}
                onMarkPhoneQuality={(quality) => {
                  updateContact.mutateAsync({
                    id: session.currentContact!.id,
                    phone_number_quality: quality as "confirmed" | "dead" | "suspect" | "unconfirmed",
                  }).catch(() => {});
                }}
              />

              <DecisionMakerCapture
                contactId={session.currentContact.id}
                businessName={session.currentContact.business_name || ""}
                ghlContactId={(session.currentContact as any).ghl_contact_id || ghlLink.getCachedGHLId(session.currentContact.id)}
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
                  isRetryingUntrackedLiveCall={dialpad.isRetryingUntrackedLiveCall}
                  callStartedAt={dialpad.callStartedAt}
                  enabled
                />
              </Suspense>

              {/* Power Hour Timer — Fanatical Prospecting */}
              <PowerHourTimer
                sessionCallCount={session.callCount}
                isSessionActive={session.isSessionActive}
              />

              {/* Sales Toolkit — Scripts, Objections, Voicemails */}
              <SalesToolkit
                contactIndustry={session.currentContact?.industry ?? null}
              />

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

            <div className="space-y-4 lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <label className="block text-[10px] uppercase tracking-widest text-muted-foreground">Rep cheat sheet</label>
                  <Badge variant="outline" className="text-[10px]">Fast keys</Badge>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-muted-foreground"><CheckCircle2 className="h-3 w-3" /> Outcomes</div>
                    <div className="font-mono text-foreground">1-6 select outcome</div>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-muted-foreground"><NotebookPen className="h-3 w-3" /> Log lead</div>
                    <div className="font-mono text-foreground">Enter saves + advances</div>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-muted-foreground"><SkipForward className="h-3 w-3" /> Skip</div>
                    <div className="font-mono text-foreground">S holds nothing, moves on</div>
                  </div>
                  <div className="rounded-md border border-border bg-background px-3 py-2">
                    <div className="mb-1 flex items-center gap-2 text-muted-foreground"><TimerReset className="h-3 w-3" /> Pause</div>
                    <div className="font-mono text-foreground">P toggles when call ends</div>
                  </div>
                </div>
                {currentLeadMeta && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Attempts</div>
                      <div className="font-mono text-foreground">{String(session.currentContact.call_attempt_count ?? 0)}</div>
                    </div>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                      <div className="text-muted-foreground">Decision maker</div>
                      <div className="font-mono text-foreground">{currentLeadMeta.dm_name ? <span className="inline-flex items-center gap-1"><UserCheck className="h-3 w-3 text-primary" /> Captured</span> : "Not captured"}</div>
                    </div>
                  </div>
                )}
              </div>

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
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => session.setFollowUpDate(new Date())}>Today</Button>
                          <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); session.setFollowUpDate(tomorrow); }}>Tomorrow</Button>
                        </div>
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
                      <div>
                        <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          Appointment Date & Time <span className="text-primary">(required)</span>
                        </label>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => session.setFollowUpDate(new Date())}>Today</Button>
                            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); session.setFollowUpDate(tomorrow); }}>Tomorrow</Button>
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className={cn("w-full justify-start border-border bg-background text-left font-normal", !session.followUpDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {session.followUpDate ? format(session.followUpDate, "PPP") : "Pick appointment date"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={session.followUpDate}
                                onSelect={session.setFollowUpDate}
                                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                initialFocus
                                className="pointer-events-auto p-3"
                              />
                            </PopoverContent>
                          </Popover>
                          <Input type="time" value={session.followUpTime} onChange={(e) => session.setFollowUpTime(e.target.value)} className="border-border bg-background" />
                          {session.followUpDate && session.followUpTime && (
                            <p className="text-xs text-muted-foreground">
                              Appointment will be logged for {format(combineDateAndTime(session.followUpDate, session.followUpTime), "PPP p")}.
                            </p>
                          )}
                        </div>
                      </div>

                      {/* GHL Calendar selector */}
                      <div>
                        <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          GHL Calendar <span className="text-primary">(required)</span>
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
                          GHL Pipeline <span className="text-primary">(required)</span>
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
                {!canSubmit && submitReadinessItems.length > 0 && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                    <p className="font-medium">Before you can continue:</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {submitReadinessItems.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {canSubmit && session.selectedOutcome && (
                  <p className="text-xs text-muted-foreground">
                    Ready to save <span className="font-medium text-foreground">{primaryActionLabel}</span> for this lead.
                  </p>
                )}
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
            {activeFilterSummary.length > 0 && !session.queue.isLoading && (
              <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
                {activeFilterSummary.slice(0, 6).map((item) => (
                  <Badge key={item} variant="outline" className="text-xs">{item}</Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
