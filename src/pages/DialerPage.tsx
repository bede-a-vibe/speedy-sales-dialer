import { forwardRef, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Brain, CalendarIcon, CheckCircle2, Globe, Headphones, Loader2, Mail, MapPin, NotebookPen, Pause, Phone, PhoneCall, Play, Radio, RotateCcw, SkipForward, SlidersHorizontal, TimerReset, UserCheck, UserRound, Wifi, WifiOff } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { DailyTarget } from "@/components/DailyTarget";
import { QuickBookRecoveryButton } from "@/components/dialer/QuickBookRecoveryButton";

import { AdvancedFilters, type DialerFilterPreset } from "@/components/dialer/AdvancedFilters";
import { DecisionMakerCapture } from "@/components/dialer/DecisionMakerCapture";
import { DialpadCTI } from "@/components/dialer/DialpadCTI";
import { ContactNotesPanel } from "@/components/dialer/ContactNotesPanel";
import { PowerHourTimer } from "@/components/dialer/PowerHourTimer";
import { SalesToolkit } from "@/components/dialer/SalesToolkit";
import { ContactIntelligencePanel } from "@/components/dialer/ContactIntelligencePanel";
import { EMPTY_CONVERSATION_PROGRESS, type ConversationProgressState } from "@/components/dialer/ConversationProgressPanel";
import { LogCallPanel } from "@/components/dialer/LogCallPanel";
import { CollapsiblePanel } from "@/components/dialer/CollapsiblePanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useCreatePipelineItem, useSalesReps, type FollowUpMethod } from "@/hooks/usePipelineItems";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import { useGHLContactSync } from "@/hooks/ghl/useGHLContactSync";
import { useGHLBookingSync } from "@/hooks/ghl/useGHLBookingSync";
import { useGHLFollowUpSync } from "@/hooks/ghl/useGHLFollowUpSync";
import { useGHLOpportunityMirror } from "@/hooks/ghl/useGHLOpportunityMirror";
import { useMyGhlUserId } from "@/hooks/useMyGhlUserId";
import { useGHLFreeSlots } from "@/hooks/useGHLFreeSlots";
import { useGHLContactLink } from "@/hooks/useGHLContactLink";
import { findDefaultBookedPipeline, findDefaultBookedStage, findDefaultFollowUpPipeline, findDefaultFollowUpStage, useGHLCalendars, useGHLPipelines } from "@/hooks/useGHLConfig";
import { supabase } from "@/integrations/supabase/client";
import { BOOKED_APPOINTMENT_DEFAULT_TIME } from "@/lib/appointments";
import { getContactStatusForOutcome, getPipelineTypeForOutcome, shouldCreatePipelineItemForOutcome } from "@/lib/pipelineMappings";
import { cn } from "@/lib/utils";
import { fetchGhlLocationId } from "@/lib/ghlUrls";
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
import { useEnrichmentCoverage } from "@/hooks/useEnrichmentCoverage";
import { toast } from "sonner";
import { useIsCoach } from "@/hooks/useUserRole";
import { CoachTour, type CoachStep } from "@/components/coach/CoachTour";
import { GraduationCap } from "lucide-react";

const COACH_TOUR_STORAGE_KEY = "dialer:coach-tour:v1";

const DIALER_COACH_STEPS: CoachStep[] = [
  {
    target: "filters-button",
    title: "1. Pick who you're calling",
    body: "Filters narrow the queue by industry, state, trade, prospect tier, and more. Reps usually start a session with a filter preset that matches today's focus list.",
    placement: "bottom",
  },
  {
    target: "queue-counter",
    title: "2. Check the queue depth",
    body: "This shows how many leads match the current filters and are ready to dial. The system locks each lead to one rep so two people never call the same business.",
    placement: "bottom",
  },
  {
    target: "start-session",
    title: "3. Start dialing",
    body: "Hitting Start Dialing claims the next prioritized lead, opens the contact card, and (for real reps) auto-places a Dialpad call. In coach mode no call is placed.",
    placement: "bottom",
  },
  {
    target: "contact-card",
    title: "4. Read the contact card",
    body: "Business details, phone, prior outcomes and decision-maker intel show up here. Reps glance at this before the prospect picks up so they're context-ready.",
    placement: "right",
  },
  {
    target: "log-call-panel",
    title: "5. Log the call outcome",
    body: "Every call must be dispositioned. Quick outcomes (No Answer, Voicemail) are at the top; conversation outcomes (Not Interested, DNC, Follow-up, Booked) are below. Click an outcome to select it — click again to fast-log.",
    placement: "left",
  },
  {
    target: "log-call-panel",
    title: "6. Tag the conversation depth",
    body: "When you reach a person, mark how far the conversation got: Connection, Problem Awareness, Solution Awareness, Commitment. This drives the call-funnel metrics on the Reports page.",
    placement: "left",
  },
  {
    target: "notes-panel",
    title: "7. Write the call note",
    body: "Notes sync to the contact and to GHL. Keep it short: what happened, the next step, and any useful info for the next rep who picks this lead up.",
    placement: "left",
  },
  {
    target: "log-and-skip",
    title: "8. Save and move on — or skip",
    body: "Press Enter (or click the green button) to save the outcome and load the next lead. Use Skip Lead (or hit S) if the contact is uncallable right now without burning an attempt.",
    placement: "left",
  },
  {
    target: "decision-maker-capture",
    title: "9. Capture decision-maker intel",
    body: "When you get past the gatekeeper or learn who the DM is, drop their name, role and best time-to-call here. Future reps inherit it.",
    placement: "right",
  },
];

const PHONE_TYPE_SUMMARY_LABELS: Record<string, string> = {
  mobile: "Mobile",
  landline: "Landline",
  business_line: "Business Line",
  unknown: "Unknown",
};

const DM_PHONE_FILTER_LABELS: Record<string, string> = {
  yes: "DM reachable",
  no: "Need DM capture",
};
import { TwoPipelineGuide } from "@/components/ghl/TwoPipelineGuide";

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

function getNextBusinessDay(base = new Date()) {
  const next = new Date(base);
  do {
    next.setDate(next.getDate() + 1);
  } while (next.getDay() === 0 || next.getDay() === 6);
  return next;
}

function roundUpToNextQuarterHour(base = new Date()) {
  const next = new Date(base);
  next.setSeconds(0, 0);
  const minutes = next.getMinutes();
  const roundedMinutes = Math.ceil((minutes + 1) / 15) * 15;
  next.setMinutes(roundedMinutes, 0, 0);
  return next;
}

function formatTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getRepLabel(displayName: string | null, email: string | null) {
  return displayName?.trim() || email || "Unknown rep";
}

function formatFilterSummary(label: string, values: string[]) {
  if (values.length === 0) return null;
  if (values.length === 1) return `${label}: ${values[0]}`;
  return `${label}: ${values[0]} +${values.length - 1}`;
}

function getNextFollowUpRescheduleIso(currentScheduledFor?: string | null, fallbackBase = new Date()) {
  const source = currentScheduledFor ? new Date(currentScheduledFor) : new Date(fallbackBase);
  if (Number.isNaN(source.getTime())) return null;

  const next = new Date(source);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function readContactText(contact: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = contact[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function buildFollowUpNoteDraft(contact: Record<string, unknown> | null | undefined) {
  if (!contact) return "";

  const intel: string[] = [];
  const dmName = readContactText(contact, "dm_name");
  const dmPhone = readContactText(contact, "dm_phone");
  const bestTimeToCall = readContactText(contact, "best_time_to_call");
  const bestRoute = readContactText(contact, "best_route_to_decision_maker", "best_route_to_dm");
  const gatekeeperName = readContactText(contact, "gatekeeper_name");
  const gatekeeperNotes = readContactText(contact, "gatekeeper_notes");
  const priorFollowUpNote = readContactText(contact, "follow_up_note");

  if (bestTimeToCall) intel.push(`Best callback window: ${bestTimeToCall}`);
  if (bestRoute) intel.push(`Best route: ${bestRoute}`);
  if (dmName || dmPhone) intel.push(`Decision maker: ${[dmName, dmPhone].filter(Boolean).join(" · ")}`);
  if (gatekeeperName || gatekeeperNotes) intel.push(`Gatekeeper: ${[gatekeeperName, gatekeeperNotes].filter(Boolean).join(" · ")}`);
  if (priorFollowUpNote) intel.push(`Previous note: ${priorFollowUpNote}`);

  if (intel.length === 0) return "";

  return [
    "Next step:",
    "Reason for follow-up:",
    ...intel,
  ].join("\n");
}

function mergeFollowUpNotes(existingNotes: string, draft: string) {
  const existing = existingNotes.trim();
  const nextDraftLines = draft
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!existing) return draft;

  const existingLines = existing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const missingLines = nextDraftLines.filter((line) => !existingLines.includes(line));
  if (missingLines.length === 0) return existingNotes;

  return `${existing}\n${existing.endsWith("\n") ? "" : "\n"}${missingLines.join("\n")}`;
}

const DIALER_FILTERS_STORAGE_KEY = "dialer:advanced-filters:v1";

type StoredDialerFilters = {
  industries?: string[];
  states?: string[];
  contactOwner?: string;
  tradeTypes?: string[];
  workType?: string;
  businessSize?: string;
  prospectTier?: string;
  minGbpRating?: number | null;
  minReviewCount?: number | null;
  hasGoogleAds?: string;
  hasFacebookAds?: string;
  buyingSignalStrength?: string;
  phoneType?: string;
  hasDmPhone?: string;
  showAdvancedFilters?: boolean;
  selectedPreset?: DialerFilterPreset;
};

function readStoredDialerFilters(): StoredDialerFilters | null {
  try {
    const raw = window.localStorage.getItem(DIALER_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as StoredDialerFilters : null;
  } catch {
    return null;
  }
}

// --- Active-call sessionStorage persistence -------------------------------
// Persists the in-flight call state (current contact id + outcome + progress
// + follow-up date/time/notes) so reps don't lose work when they tab away to
// GHL to manually book an appointment. Cleared once the lead is logged.
const DIALER_ACTIVE_CALL_STORAGE_KEY = "dialer:active-call:v1";

type StoredActiveCall = {
  contactId?: string;
  selectedOutcome?: string | null;
  notes?: string;
  followUpDateIso?: string | null;
  followUpTime?: string;
  conversationProgress?: ConversationProgressState;
  appointmentTitle?: string;
  ghlCalendarId?: string;
  ghlPipelineId?: string;
  ghlStageId?: string;
  followUpMethod?: FollowUpMethod;
  savedAt?: number;
};

function readStoredActiveCall(): StoredActiveCall | null {
  try {
    const raw = window.sessionStorage.getItem(DIALER_ACTIVE_CALL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    // Discard if older than 4 hours (rep likely moved on)
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > 4 * 60 * 60 * 1000) {
      window.sessionStorage.removeItem(DIALER_ACTIVE_CALL_STORAGE_KEY);
      return null;
    }
    return parsed as StoredActiveCall;
  } catch {
    return null;
  }
}

function writeStoredActiveCall(data: StoredActiveCall | null) {
  try {
    if (!data || !data.contactId) {
      window.sessionStorage.removeItem(DIALER_ACTIVE_CALL_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      DIALER_ACTIVE_CALL_STORAGE_KEY,
      JSON.stringify({ ...data, savedAt: Date.now() }),
    );
  } catch {
    // ignore quota / privacy mode
  }
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
  const storedFilters = useMemo(() => readStoredDialerFilters(), []);
  const isOnline = useNetworkStatus();
  const isCoach = useIsCoach();
  const [coachTourOpen, setCoachTourOpen] = useState(false);

  // Auto-launch the tour the first time a coach lands on the dialer.
  useEffect(() => {
    if (!isCoach) return;
    try {
      const seen = window.localStorage.getItem(COACH_TOUR_STORAGE_KEY);
      if (!seen) setCoachTourOpen(true);
    } catch {
      /* ignore */
    }
  }, [isCoach]);
  const [industries, setIndustries] = useState<string[]>(() => storedFilters?.industries ?? []);
  const [states, setStates] = useState<string[]>(() => storedFilters?.states ?? []);
  const [contactOwner, setContactOwner] = useState<string>(() => storedFilters?.contactOwner ?? "all");
  const [manualPhone, setManualPhone] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedCallerId, setSelectedCallerId] = useState<string>("");
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>("call");
  const [ghlCalendarId, setGhlCalendarId] = useState<string>("");
  const [ghlPipelineId, setGhlPipelineId] = useState<string>("");
  const [ghlStageId, setGhlStageId] = useState<string>("");
  const [appointmentTitle, setAppointmentTitle] = useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => storedFilters?.showAdvancedFilters ?? false);
  const [showDialpadCTI, setShowDialpadCTI] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState<DialerFilterPreset>(() => storedFilters?.selectedPreset ?? "all");

  // One-shot coverage stats so the filter UI can warn about empty enrichment columns.
  const enrichmentCoverage = useEnrichmentCoverage();

  // Conversation funnel tracking (manual capture per call)
  const [conversationProgress, setConversationProgress] = useState<ConversationProgressState>(EMPTY_CONVERSATION_PROGRESS);

  // Dialpad CTI Client ID from environment variable
  const dialpadCTIClientId = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_DIALPAD_CTI_CLIENT_ID ?? null;

  // Advanced dialer filters
  const [tradeTypes, setTradeTypes] = useState<string[]>(() => storedFilters?.tradeTypes ?? []);
  const [workType, setWorkType] = useState<string>(() => storedFilters?.workType ?? "all");
  const [businessSize, setBusinessSize] = useState<string>(() => storedFilters?.businessSize ?? "all");
  const [prospectTier, setProspectTier] = useState<string>(() => storedFilters?.prospectTier ?? "all");
  const [minGbpRating, setMinGbpRating] = useState<number | null>(() => storedFilters?.minGbpRating ?? null);
  const [minReviewCount, setMinReviewCount] = useState<number | null>(() => storedFilters?.minReviewCount ?? null);
  const [hasGoogleAds, setHasGoogleAds] = useState<string>(() => storedFilters?.hasGoogleAds ?? "all");
  const [hasFacebookAds, setHasFacebookAds] = useState<string>(() => storedFilters?.hasFacebookAds ?? "all");
  const [buyingSignalStrength, setBuyingSignalStrength] = useState<string>(() => storedFilters?.buyingSignalStrength ?? "all");
  const [phoneType, setPhoneType] = useState<string>(() => storedFilters?.phoneType ?? "all");
  const [hasDmPhone, setHasDmPhone] = useState<string>(() => storedFilters?.hasDmPhone ?? "all");

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
    setSelectedPreset("all");
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        DIALER_FILTERS_STORAGE_KEY,
        JSON.stringify({
          industries,
          states,
          contactOwner,
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
          showAdvancedFilters,
          selectedPreset,
        } satisfies StoredDialerFilters),
      );
    } catch {
      // localStorage unavailable
    }
  }, [
    industries,
    states,
    contactOwner,
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
    showAdvancedFilters,
    selectedPreset,
  ]);

  const session = useDialerSession({ filters: advancedFilters });
  const dialpad = useDialerDialpad({
    isDialing: session.isDialing,
    isSessionPaused: session.isSessionPaused,
    currentContact: session.currentContact,
    selectedCallerId,
  });

  // --- Active-call rehydration (run once when contact becomes available) ---
  // If the rep tabbed away (e.g. to GHL to manually book), rehydrate any in-flight
  // outcome / progress / follow-up state for the SAME contact when they return.
  const hasRehydratedRef = useRef(false);
  useEffect(() => {
    if (hasRehydratedRef.current) return;
    if (!session.currentContact) return;
    const stored = readStoredActiveCall();
    if (!stored || stored.contactId !== session.currentContact.id) return;

    hasRehydratedRef.current = true;

    if (stored.selectedOutcome) {
      session.setSelectedOutcome(stored.selectedOutcome as CallOutcome);
    }
    if (typeof stored.notes === "string" && stored.notes.length > 0) {
      session.setNotes(stored.notes);
    }
    if (stored.followUpDateIso) {
      const d = new Date(stored.followUpDateIso);
      if (!Number.isNaN(d.getTime())) session.setFollowUpDate(d);
    }
    if (stored.followUpTime) session.setFollowUpTime(stored.followUpTime);
    if (stored.conversationProgress) setConversationProgress(stored.conversationProgress);
    if (stored.appointmentTitle) setAppointmentTitle(stored.appointmentTitle);
    if (stored.ghlCalendarId) setGhlCalendarId(stored.ghlCalendarId);
    if (stored.ghlPipelineId) setGhlPipelineId(stored.ghlPipelineId);
    if (stored.ghlStageId) setGhlStageId(stored.ghlStageId);
    if (stored.followUpMethod) setFollowUpMethod(stored.followUpMethod);

    toast.info("Restored your in-progress call", {
      description: "Your outcome, conversation progress, and follow-up details were saved while you were away.",
    });
  }, [session.currentContact?.id]);

  // Reset rehydration guard when the active contact changes so the next lead is fresh.
  useEffect(() => {
    hasRehydratedRef.current = false;
  }, [session.currentContact?.id]);

  // --- Active-call persistence — every change is saved immediately ---------
  useEffect(() => {
    if (!session.currentContact?.id) {
      writeStoredActiveCall(null);
      return;
    }
    writeStoredActiveCall({
      contactId: session.currentContact.id,
      selectedOutcome: session.selectedOutcome,
      notes: session.notes,
      followUpDateIso: session.followUpDate ? session.followUpDate.toISOString() : null,
      followUpTime: session.followUpTime,
      conversationProgress,
      appointmentTitle,
      ghlCalendarId,
      ghlPipelineId,
      ghlStageId,
      followUpMethod,
    });
  }, [
    session.currentContact?.id,
    session.selectedOutcome,
    session.notes,
    session.followUpDate,
    session.followUpTime,
    conversationProgress,
    appointmentTitle,
    ghlCalendarId,
    ghlPipelineId,
    ghlStageId,
    followUpMethod,
  ]);

  const { data: salesReps = [] } = useSalesReps();
  const updateContact = useUpdateContact();
  const createCallLog = useCreateCallLog();
  const createPipelineItem = useCreatePipelineItem();
  const { pushCallNote, pushDNC } = useGHLContactSync();
  const { pushBooking } = useGHLBookingSync();
  const { pushFollowUp, pushFollowUpEmailDraft } = useGHLFollowUpSync();
  const { updateOpportunityStage } = useGHLOpportunityMirror();
  const { data: myGhlUserId } = useMyGhlUserId();
  const ghlLink = useGHLContactLink();
  const { data: ghlCalendars = [] } = useGHLCalendars();
  const { data: ghlPipelines = [] } = useGHLPipelines();
  const { data: freeSlots = [], isLoading: isLoadingSlots } = useGHLFreeSlots(
    ghlCalendarId || undefined,
    session.followUpDate,
  );

  const followUpNoteDraft = useMemo(
    () => buildFollowUpNoteDraft(session.currentContact as Record<string, unknown> | null | undefined),
    [session.currentContact],
  );

  useEffect(() => {
    if (session.selectedOutcome !== "follow_up") return;
    if (session.notes.trim()) return;
    if (!followUpNoteDraft) return;
    session.setNotes(followUpNoteDraft);
  }, [followUpNoteDraft, session]);

  const selectedGhlPipeline = useMemo(
    () => ghlPipelines.find((p) => p.id === ghlPipelineId) ?? null,
    [ghlPipelines, ghlPipelineId],
  );

  const ghlSelectedPipelineStages = useMemo(
    () => selectedGhlPipeline?.stages ?? [],
    [selectedGhlPipeline],
  );

  const selectedGhlStage = useMemo(
    () => ghlSelectedPipelineStages.find((stage) => stage.id === ghlStageId) ?? null,
    [ghlSelectedPipelineStages, ghlStageId],
  );

  const selectedGhlCalendar = useMemo(
    () => ghlCalendars.find((calendar) => calendar.id === ghlCalendarId) ?? null,
    [ghlCalendars, ghlCalendarId],
  );

  const defaultFollowUpPipeline = useMemo(
    () => findDefaultFollowUpPipeline(ghlPipelines),
    [ghlPipelines],
  );

  const defaultBookedPipeline = useMemo(
    () => findDefaultBookedPipeline(ghlPipelines),
    [ghlPipelines],
  );

  const defaultBookedStage = useMemo(
    () => findDefaultBookedStage(defaultBookedPipeline),
    [defaultBookedPipeline],
  );

  const defaultFollowUpStage = useMemo(
    () => findDefaultFollowUpStage(defaultFollowUpPipeline),
    [defaultFollowUpPipeline],
  );

  const selectedOpportunityPipeline = useMemo(() => {
    if (session.selectedOutcome === "follow_up") return defaultFollowUpPipeline;
    if (session.selectedOutcome === "booked") return selectedGhlPipeline;
    return null;
  }, [defaultFollowUpPipeline, selectedGhlPipeline, session.selectedOutcome]);

  const selectedOpportunityStage = useMemo(() => {
    if (session.selectedOutcome === "follow_up") return defaultFollowUpStage;
    if (session.selectedOutcome === "booked") return selectedGhlStage;
    return null;
  }, [defaultFollowUpStage, selectedGhlStage, session.selectedOutcome]);

  const queueLeadCount = useMemo(
    () => Math.max(session.queue.totalCount, session.queue.contacts.length),
    [session.queue.totalCount, session.queue.contacts.length],
  );
  const queueSupervisorSummary = useMemo(() => {
    const { queueSupervisor, contacts, isLoading, isPrefetching } = session.queue;
    const availableCount = queueSupervisor.lastKnownAvailableCount ?? queueLeadCount;
    const bufferCount = contacts.length;
    const isHealthy = queueSupervisor.health === "healthy";
    const isAttention = queueSupervisor.health === "degraded" || queueSupervisor.health === "exhausted";
    const badgeClassName = isHealthy
      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
      : isAttention
        ? "border-destructive/30 text-destructive"
        : "border-amber-500/30 text-amber-700 dark:text-amber-300";
    const bannerClassName = isHealthy
      ? "border-emerald-500/30 bg-emerald-500/10"
      : isAttention
        ? "border-destructive/30 bg-destructive/10"
        : "border-amber-500/30 bg-amber-500/10";

    let label = "Idle";
    let detail = "Queue preview is standing by.";

    if (isLoading && !session.isSessionActive) {
      label = "Checking queue";
      detail = "Loading the next available lead count for this filter set.";
    } else if (queueSupervisor.health === "bootstrapping") {
      label = "Starting buffer";
      detail = "Claiming the first batch of leads for this session.";
    } else if (queueSupervisor.health === "refilling") {
      label = "Refilling";
      detail = bufferCount > 0
        ? `Low buffer, pulling more leads now. ${bufferCount} still in hand.`
        : "The live buffer is empty, checking for more claimable leads now.";
    } else if (queueSupervisor.health === "healthy") {
      label = "Healthy";
      detail = bufferCount > 0
        ? `${bufferCount} lead${bufferCount === 1 ? "" : "s"} in the live buffer, with ${availableCount} visible in queue scope.`
        : `${availableCount} lead${availableCount === 1 ? "" : "s"} available in queue scope.`;
    } else if (queueSupervisor.health === "degraded") {
      label = "Needs attention";
      detail = availableCount > 0
        ? `Queue still shows ${availableCount} lead${availableCount === 1 ? "" : "s"}, but this session is not claiming them cleanly yet.`
        : "The queue is thin right now, and the dialer is retrying before it marks the session exhausted.";
    } else if (queueSupervisor.health === "exhausted") {
      label = "Exhausted";
      detail = "No more claimable leads were confirmed for this filter set.";
    }

    const checkpoints = [
      {
        label: "Visible in scope",
        value: isLoading ? "Loading..." : `${availableCount}`,
      },
      {
        label: "Live buffer",
        value: isPrefetching && bufferCount > 0 ? `${bufferCount} · refilling` : `${bufferCount}`,
      },
      {
        label: "Last good claim",
        value: queueSupervisor.lastSuccessfulClaimAt
          ? format(new Date(queueSupervisor.lastSuccessfulClaimAt), "h:mm a")
          : "None yet",
      },
      {
        label: "Empty refill streak",
        value: `${queueSupervisor.consecutiveEmptyRefills}`,
      },
    ];

    return {
      label,
      detail,
      badgeClassName,
      bannerClassName,
      checkpoints,
    };
  }, [queueLeadCount, session.isSessionActive, session.queue]);

  const applySchedulePreset = useCallback((preset: "in_2_hours" | "tomorrow_9" | "tomorrow_2" | "next_business_day_9" | "in_1_month" | "in_3_months") => {
    const now = new Date();

    if (preset === "in_2_hours") {
      const next = roundUpToNextQuarterHour(new Date(now.getTime() + (2 * 60 * 60 * 1000)));
      session.setFollowUpDate(next);
      session.setFollowUpTime(formatTimeInputValue(next));
      return;
    }

    if (preset === "tomorrow_9") {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      session.setFollowUpDate(next);
      session.setFollowUpTime("09:00");
      return;
    }

    if (preset === "tomorrow_2") {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      session.setFollowUpDate(next);
      session.setFollowUpTime("14:00");
      return;
    }

    if (preset === "in_1_month") {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 1);
      session.setFollowUpDate(next);
      session.setFollowUpTime("09:00");
      return;
    }

    if (preset === "in_3_months") {
      const next = new Date(now);
      next.setMonth(next.getMonth() + 3);
      session.setFollowUpDate(next);
      session.setFollowUpTime("09:00");
      return;
    }

    const next = getNextBusinessDay(now);
    session.setFollowUpDate(next);
    session.setFollowUpTime("09:00");
  }, [session]);

  const activeFilterSummary = useMemo(
    () => [
      industries.length > 0 ? { key: "industries", label: formatFilterSummary("Industry", industries)!, clear: () => setIndustries([]) } : null,
      states.length > 0 ? { key: "states", label: formatFilterSummary("State", states)!, clear: () => setStates([]) } : null,
      tradeTypes.length > 0 ? { key: "tradeTypes", label: formatFilterSummary("Trade", tradeTypes)!, clear: () => setTradeTypes([]) } : null,
      contactOwner !== "all"
        ? {
            key: "contactOwner",
            label: `Owner: ${getRepLabel(salesReps.find((rep) => rep.user_id === contactOwner)?.display_name ?? null, salesReps.find((rep) => rep.user_id === contactOwner)?.email ?? contactOwner)}`,
            clear: () => setContactOwner("all"),
          }
        : null,
      workType !== "all" ? { key: "workType", label: `Work: ${workType}`, clear: () => setWorkType("all") } : null,
      businessSize !== "all" ? { key: "businessSize", label: `Business: ${businessSize}`, clear: () => setBusinessSize("all") } : null,
      prospectTier !== "all" ? { key: "prospectTier", label: `Tier: ${prospectTier}`, clear: () => setProspectTier("all") } : null,
      hasGoogleAds !== "all" ? { key: "hasGoogleAds", label: `Google Ads: ${hasGoogleAds}`, clear: () => setHasGoogleAds("all") } : null,
      hasFacebookAds !== "all" ? { key: "hasFacebookAds", label: `Facebook Ads: ${hasFacebookAds}`, clear: () => setHasFacebookAds("all") } : null,
      buyingSignalStrength !== "all" ? { key: "buyingSignalStrength", label: `Buying signal: ${buyingSignalStrength}`, clear: () => setBuyingSignalStrength("all") } : null,
      phoneType !== "all" ? { key: "phoneType", label: `Phone: ${PHONE_TYPE_SUMMARY_LABELS[phoneType] ?? phoneType}`, clear: () => setPhoneType("all") } : null,
      hasDmPhone !== "all" ? { key: "hasDmPhone", label: `DM reachability: ${DM_PHONE_FILTER_LABELS[hasDmPhone] ?? hasDmPhone}`, clear: () => setHasDmPhone("all") } : null,
      minGbpRating ? { key: "minGbpRating", label: `Min GBP: ${GBP_RATING_OPTIONS.find((item) => item.value === minGbpRating)?.label ?? `${minGbpRating}+`}`, clear: () => setMinGbpRating(null) } : null,
      minReviewCount ? { key: "minReviewCount", label: `Min reviews: ${REVIEW_COUNT_OPTIONS.find((item) => item.value === minReviewCount)?.label ?? `${minReviewCount}+`}`, clear: () => setMinReviewCount(null) } : null,
    ].filter(Boolean) as { key: string; label: string; clear: () => void }[],
    [industries, states, tradeTypes, contactOwner, salesReps, workType, businessSize, prospectTier, hasGoogleAds, hasFacebookAds, buyingSignalStrength, phoneType, hasDmPhone, minGbpRating, minReviewCount],
  );

  const startReadinessItems = useMemo(() => {
    const items = [
      {
        label: "Network",
        ready: isOnline,
        detail: isOnline ? "Connected. Changes can sync normally." : "Offline. Reconnect before starting so calls and notes can sync.",
      },
      {
        label: "Dialpad assignment",
        ready: dialpad.hasDialpadAssignment,
        detail: dialpad.hasDialpadAssignment
          ? `Ready on ${dialpad.myDialpadSettings?.dialpad_phone_number || dialpad.myDialpadSettings?.dialpad_user_id}`
          : "No active Dialpad number is assigned to this user.",
      },
      {
        label: "Lead buffer",
        ready: !session.queue.isLoading && queueLeadCount > 0,
        detail: session.queue.isLoading
          ? "Loading queue preview..."
          : queueLeadCount > 0
            ? `${queueLeadCount} lead${queueLeadCount === 1 ? "" : "s"} ready in the current queue.`
            : "No leads available in the current queue.",
      },
      {
        label: "Targeting",
        ready: activeFilterSummary.length > 0 || queueLeadCount > 0,
        detail: activeFilterSummary.length > 0
          ? `${activeFilterSummary.length} active filter${activeFilterSummary.length === 1 ? "" : "s"} shaping this session.`
          : "No filters applied. You can still start, but this session will use the full available queue.",
      },
    ];

    return items;
  }, [activeFilterSummary.length, dialpad.hasDialpadAssignment, dialpad.myDialpadSettings?.dialpad_phone_number, dialpad.myDialpadSettings?.dialpad_user_id, isOnline, queueLeadCount, session.queue.isLoading]);

  const startReadinessOpenItems = useMemo(
    () => startReadinessItems.filter((item) => !item.ready),
    [startReadinessItems],
  );

  const startReadinessSummary = useMemo(() => {
    if (startReadinessOpenItems.length === 0) return "Ready to start dialing.";
    if (startReadinessOpenItems.length === 1) return "1 item to fix before starting.";
    return `${startReadinessOpenItems.length} items to fix before starting.`;
  }, [startReadinessOpenItems.length]);

  const applyDialerPreset = useCallback((preset: DialerFilterPreset) => {
    setSelectedPreset(preset);

    if (preset === "all") {
      resetAdvancedFilters();
      return;
    }

    resetAdvancedFilters();

    if (preset === "hot_today") {
      // Tier / buying-signal data isn't populated yet — those filters would
      // zero the queue. Fall back to mobiles, which are the highest-yield
      // contacts we can actually filter on today.
      setPhoneType("mobile");
      toast.info("Hot today: showing mobile contacts (lead scoring data not populated yet).");
      return;
    }

    if (preset === "dm_direct") {
      setPhoneType("mobile");
      toast.info("DM direct dials: showing mobile contacts (DM phone capture pending).");
      return;
    }

    if (preset === "dm_capture") {
      // Landlines are where you typically need to navigate a gatekeeper.
      setPhoneType("landline");
      toast.info("DM capture: showing landline contacts to focus gatekeeper navigation.");
      return;
    }

    if (preset === "google_ads") {
      // Ad-status enrichment isn't populated — hint without zeroing the queue.
      toast.info("Google Ads enrichment data not available yet — showing all contacts.");
      return;
    }

    if (preset === "high_review") {
      toast.info("Review data not populated yet — showing all contacts.");
      return;
    }

    if (preset === "landline_enrichment") {
      setPhoneType("landline");
    }
  }, [resetAdvancedFilters]);

  const queueFocusLabel = useMemo(() => {
    if (phoneType === "landline") return "Landline queue";
    if (phoneType === "business_line") return "Business line queue";
    if (phoneType === "mobile" && hasDmPhone === "yes") return "Direct DM mobile queue";
    if (phoneType === "mobile") return "Mobile queue";
    if (hasDmPhone === "yes") return "Decision-maker direct queue";
    if (hasDmPhone === "no") return "Decision-maker capture queue";
    return null;
  }, [phoneType, hasDmPhone]);

  const queueGuidance = useMemo(() => {
    if (phoneType === "landline" || phoneType === "business_line") {
      if (hasDmPhone === "yes") {
        return "Prioritise the direct decision-maker number first, then use the main line only for routing or fallback.";
      }
      return "Use each call to capture the fastest route to the decision maker, including a direct mobile, extension, or gatekeeper notes before requeueing.";
    }

    if (hasDmPhone === "no") {
      return "This queue is best for contact enrichment. Confirm the right decision maker and capture a direct number before moving on.";
    }

    if (hasDmPhone === "yes") {
      return "This queue is already enriched. Move fast on direct outreach and use the main line only when the direct path fails.";
    }

    return null;
  }, [phoneType, hasDmPhone]);

  const requiresPipelineAssignment = session.selectedOutcome === "follow_up" || session.selectedOutcome === "booked";
  const requiresFollowUpSchedule = session.selectedOutcome === "follow_up";
  const requiresBookedSchedule = session.selectedOutcome === "booked";
  const requiresAnySchedule = requiresFollowUpSchedule || requiresBookedSchedule;

  // Conversation Progress is required for outcomes that need coaching context:
  // not_interested, follow_up, booked. Rep must tag at least one stage reached,
  // OR pick an exit reason, OR mark "hung up immediately".
  const requiresConversationProgress =
    session.selectedOutcome === "not_interested"
    || session.selectedOutcome === "follow_up"
    || session.selectedOutcome === "booked";

  const conversationProgressFilled = (
    conversationProgress.reachedConnection
    || conversationProgress.reachedProblem
    || conversationProgress.reachedSolution
    || conversationProgress.reachedCommitment
    || !!conversationProgress.exitReasonConnection
    || !!conversationProgress.exitReasonProblem
    || !!conversationProgress.exitReasonSolution
    || !!conversationProgress.exitReasonCommitment
    || !!conversationProgress.exitReasonBooking
  );

  // Auto-select the explicit booked pipeline contract when available
  useEffect(() => {
    if (!ghlCalendarId && ghlCalendars.length > 0) {
      setGhlCalendarId(ghlCalendars[0].id);
    }
  }, [ghlCalendars, ghlCalendarId]);

  useEffect(() => {
    if (!ghlPipelineId && defaultBookedPipeline) {
      setGhlPipelineId(defaultBookedPipeline.id);
    }
  }, [defaultBookedPipeline, ghlPipelineId]);

  useEffect(() => {
    if (!ghlPipelineId || ghlSelectedPipelineStages.length === 0) {
      if (ghlStageId) setGhlStageId("");
      return;
    }

    if (!ghlStageId && defaultBookedPipeline?.id === ghlPipelineId && defaultBookedStage) {
      setGhlStageId(defaultBookedStage.id);
      return;
    }

    if (ghlStageId && !ghlSelectedPipelineStages.some((stage) => stage.id === ghlStageId)) {
      setGhlStageId("");
    }
  }, [defaultBookedPipeline?.id, defaultBookedStage, ghlPipelineId, ghlSelectedPipelineStages, ghlStageId]);

  const canSubmit = isOnline
    && !!session.selectedOutcome
    && (!requiresPipelineAssignment || !!session.assignedRepId)
    && (!requiresAnySchedule || !!session.followUpDate)
    && (!requiresFollowUpSchedule || !!session.followUpTime)
    && (!requiresBookedSchedule || !!session.followUpTime)
    && (!requiresConversationProgress || conversationProgressFilled)
    && !dialpad.isEndingCall
    && !createCallLog.isPending
    && !createPipelineItem.isPending
    && !dialpad.linkDialpadCallLog.isPending;

  const isFastLogOutcome = (outcome: CallOutcome) => (
    outcome === "no_answer"
    || outcome === "voicemail"
    || outcome === "not_interested"
    || outcome === "dnc"
  );

  const primaryActionLabel = requiresBookedSchedule
    ? (session.isSessionPaused ? "Booked & Hold Session" : "Booked & Next Lead")
    : (session.isSessionPaused ? "Log & Hold Session" : "Log & Next Lead");

  const submitReadinessItems = useMemo(() => {
    const items: string[] = [];

    if (!isOnline) items.push("Reconnect to the internet before saving this lead");
    if (!session.selectedOutcome) items.push("Select a call outcome");
    if (requiresPipelineAssignment && !session.assignedRepId) items.push("Assign a sales rep");
    if (requiresAnySchedule && !session.followUpDate) items.push(requiresBookedSchedule ? "Choose an appointment date" : "Choose a follow-up date");
    if (requiresFollowUpSchedule && !session.followUpTime) items.push("Choose a follow-up time");
    if (requiresBookedSchedule && !session.followUpTime) items.push("Choose an appointment time");
    if (requiresConversationProgress && !conversationProgressFilled) {
      items.push("Fill out Conversation Progress (stages reached or exit reason)");
    }
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
    requiresConversationProgress,
    conversationProgressFilled,
    ghlCalendarId,
    dialpad.isEndingCall,
    createCallLog.isPending,
    createPipelineItem.isPending,
    dialpad.linkDialpadCallLog.isPending,
    isOnline,
  ]);

  // Reset or prime fields when outcome changes
  useEffect(() => {
    if (!requiresPipelineAssignment && session.user?.id) {
      session.setAssignedRepId(session.user.id);
    }

    if (!requiresAnySchedule) {
      session.setFollowUpDate(undefined);
      session.setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
      return;
    }

    if (session.followUpDate) return;

    if (session.selectedOutcome === "follow_up") {
      const next = roundUpToNextQuarterHour(new Date(Date.now() + (2 * 60 * 60 * 1000)));
      session.setFollowUpDate(next);
      session.setFollowUpTime(formatTimeInputValue(next));
      return;
    }

    if (session.selectedOutcome === "booked") {
      const next = getNextBusinessDay(new Date());
      session.setFollowUpDate(next);
      session.setFollowUpTime(BOOKED_APPOINTMENT_DEFAULT_TIME);
      // Auto-populate appointment title with contact name
      const cName = session.currentContact?.business_name || session.currentContact?.contact_person;
      if (cName && !appointmentTitle) {
        setAppointmentTitle(`Appointment with ${cName}`);
      }
    }
  }, [
    requiresAnySchedule,
    requiresPipelineAssignment,
    session.user?.id,
    session.followUpDate,
    session.selectedOutcome,
    session.setAssignedRepId,
    session.setFollowUpDate,
    session.setFollowUpTime,
  ]);

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

  // Prefetch the GHL location ID once so the "View in GHL" link can render
  useEffect(() => {
    void fetchGhlLocationId();
  }, []);


  const logAndNext = useCallback(async (outcomeOverride?: CallOutcome) => {
    const outcomeToLog = outcomeOverride ?? session.selectedOutcome;
    if (!outcomeToLog || !session.currentContact || !session.user || session.leadAdvanceInFlightRef.current) return;
    if (!isOnline) {
      toast.error("You're offline. Reconnect before logging this lead.");
      return;
    }

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
    const currentContactSnapshot = session.currentContact;
    const contactId = currentContactSnapshot.id;
    const userId = session.user.id;
    const contactFollowUpNote = currentContactSnapshot.follow_up_note;
    const contactNextFollowUpDate = currentContactSnapshot.next_followup_date;
    const contactAssignedUserId = (currentContactSnapshot as Record<string, unknown>).assigned_user_id as string | null;
    const existingPipelineItemId = (currentContactSnapshot as Record<string, unknown>).pipeline_item_id as string | null;
    const contactGhlId = (currentContactSnapshot as Record<string, unknown>).ghl_contact_id as string | null
      ?? ghlLink.getCachedGHLId(currentContactSnapshot.id);
    const contactName = currentContactSnapshot.business_name;
    const contactIndustry = (currentContactSnapshot as Record<string, unknown>).industry as string | undefined;
    const currentVoicemailCount = Number((currentContactSnapshot as Record<string, unknown>).voicemail_count ?? 0);
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
    const bookingTitle = appointmentTitle;
    const followUpPipelineId = defaultFollowUpPipeline?.id;
    const followUpStageId = defaultFollowUpStage?.id;
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
    setAppointmentTitle("");
    setGhlCalendarId("");
    setGhlPipelineId("");
    setGhlStageId("");
    const cp = conversationProgress;
    setConversationProgress(EMPTY_CONVERSATION_PROGRESS);
    void session.queue.ensureBuffer();

    session.recordOutcome(outcomeToLog);
    session.leadAdvanceInFlightRef.current = false;

    // Do not stop from a transient local empty buffer.
    // Let the queue reconciler decide whether the session is truly exhausted.

    // Background DB writes
    (async () => {
      let createdPipelineItem: { id: string } | null = null;

      try {
        const [insertedLog] = await Promise.all([
          createCallLog.mutateAsync({
            contact_id: contactId,
            user_id: userId,
            outcome: outcomeToLog,
            notes: pipelineNotes || undefined,
            follow_up_date: scheduledFor,
            dialpad_call_id: dialpadCallId,
            reached_connection: cp.reachedConnection,
            reached_problem_awareness: cp.reachedProblem,
            reached_solution_awareness: cp.reachedSolution,
            reached_commitment: cp.reachedCommitment,
            opener_used_id: cp.openerId,
            exit_reason_connection: cp.exitReasonConnection,
            exit_reason_problem: cp.exitReasonProblem,
            exit_reason_solution: cp.exitReasonSolution,
            exit_reason_commitment: cp.exitReasonCommitment,
            exit_reason_booking: cp.exitReasonBooking,
            exit_reason_notes: cp.exitReasonNotes,
          }),
          updateContact.mutateAsync({
            id: contactId,
            status: getContactStatusForOutcome(outcomeToLog),
            last_outcome: outcomeToLog,
            is_dnc: outcomeToLog === "dnc",
            meeting_booked_date: outcomeToLog === "booked" ? scheduledFor : null,
            next_followup_date: outcomeToLog === "follow_up" ? scheduledFor : null,
            follow_up_note: outcomeToLog === "follow_up"
              ? (pipelineNotes || contactFollowUpNote || null)
              : null,
            ...(outcomeToLog === "voicemail" ? { voicemail_count: currentVoicemailCount + 1 } : {}),
          }),
        ]);

        const pipelineType = getPipelineTypeForOutcome(outcomeToLog);
        const shouldReuseOpenFollowUp = pipelineType === "follow_up" && !!existingPipelineItemId;

        if (pipelineType && !shouldReuseOpenFollowUp) {
          createdPipelineItem = await createPipelineItem.mutateAsync({
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

        // If this was an active follow-up and got no_answer, roll it forward automatically.
        if (outcomeToLog === "no_answer" && existingPipelineItemId && (contactFollowUpNote || contactNextFollowUpDate)) {
          const nextScheduled = getNextFollowUpRescheduleIso(contactNextFollowUpDate, new Date());

          if (nextScheduled) {
            await createPipelineItem.mutateAsync({
              contact_id: contactId,
              source_call_log_id: insertedLog.id,
              pipeline_type: "follow_up",
              assigned_user_id: contactAssignedUserId || repId || userId,
              created_by: userId,
              scheduled_for: nextScheduled,
              notes: contactFollowUpNote || pipelineNotes || "Auto-rescheduled after no answer",
              follow_up_method: method,
            });
            await updateContact.mutateAsync({
              id: contactId,
              status: "follow_up",
              next_followup_date: nextScheduled,
              follow_up_note: contactFollowUpNote || pipelineNotes || "Auto-rescheduled after no answer",
              meeting_booked_date: null,
              
            });
          }
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
        pushCallNote({
          ghlContactId: contactGhlId,
          outcome: outcomeToLog,
          notes: pipelineNotes || undefined,
          repName,
        }).catch(() => {});

        // Update opportunity stage in Outbound Prospecting pipeline for every outcome
        updateOpportunityStage({
          ghlContactId: contactGhlId,
          outcome: outcomeToLog,
          contactName,
        }).catch(() => {});

        if (outcomeToLog === "booked" && scheduledFor && calendarId) {
          pushBooking({
            ghlContactId: contactGhlId,
            contactId,
            calendarId,
            scheduledFor,
            title: bookingTitle || undefined,
            contactName,
            repName,
            notes: pipelineNotes || undefined,
            pipelineItemId: createdPipelineItem?.id,
            pipelineId: pipelineId || undefined,
            pipelineStageId: stageId || undefined,
            ghlUserId: myGhlUserId ?? undefined,
          }).catch(() => {});
        }

        if (outcomeToLog === "follow_up" && scheduledFor) {
          pushFollowUp({
            ghlContactId: contactGhlId,
            contactId,
            scheduledFor,
            method,
            contactName,
            repName,
            pipelineItemId: createdPipelineItem?.id,
            pipelineId: followUpPipelineId,
            pipelineStageId: followUpStageId,
            ghlUserId: myGhlUserId ?? undefined,
          }).catch(() => {});

          // Generate and push a draft email to GHL for all follow-ups
          {
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

            pushFollowUpEmailDraft({
              ghlContactId: contactGhlId,
              contactName: contactName ?? "there",
              businessName: contactName ?? "",
              industry: contactIndustry,
              repName: repName ?? "The Odin Team",
              callNotes: pipelineNotes || undefined,
              callTranscriptSummary: latestSummary ?? undefined,
              scheduledFor: scheduledFor ?? undefined,
            }).catch(() => {});
          }
        }

        if (outcomeToLog === "dnc") {
          pushDNC({ ghlContactId: contactGhlId, contactId }).catch(() => {});
        }
      }
    })();
  }, [
    session,
    dialpad,
    createCallLog,
    createPipelineItem,
    updateContact,
    pushCallNote,
    pushDNC,
    pushBooking,
    pushFollowUp,
    pushFollowUpEmailDraft,
    updateOpportunityStage,
    ghlLink,
    salesReps,
    ghlCalendarId,
    ghlPipelineId,
    ghlStageId,
    defaultFollowUpPipeline?.id,
    defaultFollowUpStage?.id,
    isOnline,
  ]);

  const skipLead = useCallback(async () => {
    if (session.currentIndex === null || !session.currentContact) return;
    if (!isOnline) {
      toast.error("You're offline. Reconnect before skipping this lead.");
      return;
    }

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
      toast.info("Checking for more leads...");
      return;
    }

    if (session.currentIndex >= nextLength) {
      session.setCurrentIndex(nextLength - 1);
    }
  }, [session, dialpad, isOnline, updateContact]);

  const stopSessionSafely = useCallback(async () => {
    if (!isOnline) {
      toast.error("You're offline. Reconnect before stopping the session so locks release cleanly.");
      return;
    }
    if (!dialpad.isCallTerminal) {
      toast.info("Ending the live call before stopping your session.");
      try {
        await dialpad.cancelActiveCall();
      } catch {
        toast.error("Couldn't confirm the call ended. Finish the call in Dialpad, then stop the session again.");
        return;
      }
    }

    session.stopSession();
  }, [dialpad, isOnline, session]);

  const recoverQueueSafely = useCallback(async () => {
    if (!isOnline) {
      toast.error("You're offline. Reconnect before recovering the queue.");
      return;
    }
    if (!dialpad.isCallTerminal) {
      toast.info("Ending the live call before recovering your queue.");
      try {
        await dialpad.cancelActiveCall();
      } catch {
        toast.error("Couldn't confirm the call ended. Finish the call in Dialpad, then recover the queue again.");
        return;
      }
    }

    await session.recoverQueue();
  }, [dialpad, isOnline, session]);

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
        if (!isOnline) {
          toast.error("You're offline. Reconnect before pausing or resuming the session.");
          return;
        }
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
  }, [canSubmit, isOnline, session.currentContact, dialpad.isCallTerminal, session.isDialing, session.isSessionActive, session.isSessionPaused, logAndNext, skipLead]);

  const outcomes: CallOutcome[] = ["no_answer", "voicemail", "not_interested", "dnc", "follow_up", "booked"];
  const currentLeadMeta = session.currentContact ? (session.currentContact as Record<string, unknown>) : null;
  const quickFacts = session.currentContact ? [
    session.currentContact.industry,
    [session.currentContact.city, session.currentContact.state].filter(Boolean).join(", "),
    currentLeadMeta?.dm_name ? `DM: ${String(currentLeadMeta.dm_name)}` : null,
    typeof currentLeadMeta?.gatekeeper_name === "string" ? `Gatekeeper: ${String(currentLeadMeta.gatekeeper_name)}` : null,
  ].filter(Boolean) as string[] : [];
  const currentLeadActionPlan = useMemo(() => {
    if (!session.currentContact) return null;

    const meta = session.currentContact as Record<string, unknown>;
    const isRoutedLine = session.currentContact.phone_type === "landline" || session.currentContact.phone_type === "business_line";
    const hasDmName = Boolean(meta.dm_name);
    const hasDmPhone = Boolean(meta.dm_phone);
    const hasRoutingIntel = Boolean(
      meta.gatekeeper_name || meta.gatekeeper_notes || meta.best_route_to_decision_maker || meta.best_route_to_dm,
    );
    const hasBestTimeToCall = Boolean(meta.best_time_to_call);
    const checklist = [
      { label: "Decision-maker name confirmed", done: hasDmName },
      { label: "Direct mobile or extension captured", done: hasDmPhone },
      { label: isRoutedLine ? "Gatekeeper or routing notes saved" : "Best route to the decision maker saved", done: hasRoutingIntel },
      { label: "Best callback window logged", done: hasBestTimeToCall },
    ];

    const outstanding = checklist.filter((item) => !item.done);
    const coachingSteps = [] as Array<{ title: string; prompt: string }>;

    if (!hasDmName) {
      coachingSteps.push({
        title: "Lock the right contact",
        prompt: "Ask: 'Who handles marketing or lead generation there now?' Save the name before you move on.",
      });
    }

    if (!hasDmPhone) {
      coachingSteps.push({
        title: "Get the direct path",
        prompt: isRoutedLine
          ? "Ask for the fastest way back to them, ideally a direct mobile, extension, or best transfer path, then save it before requeueing."
          : "Ask for the best direct number or extension so the next touch can skip the main line.",
      });
    }

    if (!hasRoutingIntel) {
      coachingSteps.push({
        title: isRoutedLine ? "Capture routing intel" : "Capture approach intel",
        prompt: isRoutedLine
          ? "Note the gatekeeper name, wording that worked, and whether to ask for a transfer, extension, or callback window next time."
          : "Save how to reach the decision maker fastest, including referral wording or internal handoff notes.",
      });
    }

    if (!hasBestTimeToCall) {
      coachingSteps.push({
        title: "Log callback timing",
        prompt: "Finish by asking when they are easiest to catch, then store that time window for the next rep.",
      });
    }

    let headline = "Lead is ready for direct outreach.";
    let detail = "Use the direct path first and only fall back to the main line if the decision maker is unavailable.";

    if (outstanding.length > 0 && isRoutedLine) {
      headline = "This routed line still needs enrichment.";
      detail = hasDmPhone
        ? "You already have a direct number. Use this call to tighten the route with gatekeeper context or callback timing."
        : "Use this call to find the fastest route to the decision maker, then capture a direct number or extension before requeueing.";
    } else if (outstanding.length > 0) {
      headline = "Capture the missing direct-outreach details on this lead.";
      detail = hasDmName
        ? "You know who to ask for. Try to leave this call with a direct number, extension, or cleaner callback window."
        : "Confirm the right decision maker first, then capture the cleanest direct path for the next attempt.";
    }

    return {
      headline,
      detail,
      outstandingCount: outstanding.length,
      checklist,
      coachingSteps: coachingSteps.slice(0, 3),
    };
  }, [session.currentContact]);
  const remainingQueueContacts = useMemo(() => {
    if (session.currentIndex === null) return session.queue.contacts;
    return session.queue.contacts.slice(session.currentIndex + 1);
  }, [session.currentIndex, session.queue.contacts]);
  const queueMix = useMemo(() => {
    return remainingQueueContacts.reduce((summary, contact) => {
      const meta = contact as Record<string, unknown>;
      if (contact.phone_type === "landline" || contact.phone_type === "business_line") summary.routedLines += 1;
      if (contact.phone_type === "mobile") summary.mobiles += 1;
      if (meta.dm_phone || meta.dm_name) summary.withDm += 1;
      if (meta.gatekeeper_name || meta.gatekeeper_notes) summary.withGatekeeperNotes += 1;
      return summary;
    }, {
      routedLines: 0,
      mobiles: 0,
      withDm: 0,
      withGatekeeperNotes: 0,
    });
  }, [remainingQueueContacts]);
  const enrichmentQueueStats = useMemo(() => {
    const total = remainingQueueContacts.length;
    const needsDmPhone = remainingQueueContacts.filter((contact) => !(contact as Record<string, unknown>).dm_phone).length;
    const routedWithoutNotes = remainingQueueContacts.filter((contact) => {
      const meta = contact as Record<string, unknown>;
      const isRoutedLine = contact.phone_type === "landline" || contact.phone_type === "business_line";
      return isRoutedLine && !meta.gatekeeper_name && !meta.gatekeeper_notes;
    }).length;
    const readyForDirectOutreach = remainingQueueContacts.filter((contact) => !!(contact as Record<string, unknown>).dm_phone).length;
    const enrichedShare = total > 0 ? Math.round((readyForDirectOutreach / total) * 100) : 0;

    let nextAction = "Queue is empty right now.";
    if (needsDmPhone > 0) {
      nextAction = `Capture direct mobile or extension details on the next ${needsDmPhone} enrichment lead${needsDmPhone === 1 ? "" : "s"}.`;
    } else if (routedWithoutNotes > 0) {
      nextAction = `Add gatekeeper or routing notes on ${routedWithoutNotes} routed line${routedWithoutNotes === 1 ? "" : "s"} so the next rep lands faster.`;
    } else if (readyForDirectOutreach > 0) {
      nextAction = "Most of the live buffer is enriched, so prioritise direct decision-maker outreach.";
    }

    return {
      total,
      needsDmPhone,
      routedWithoutNotes,
      readyForDirectOutreach,
      enrichedShare,
      nextAction,
    };
  }, [remainingQueueContacts]);
  const enrichmentLaneStats = useMemo(() => {
    return remainingQueueContacts.reduce((summary, contact) => {
      const meta = contact as Record<string, unknown>;
      const hasRoutingNotes = Boolean(
        meta.gatekeeper_name || meta.gatekeeper_notes || meta.best_route_to_decision_maker || meta.best_route_to_dm,
      );
      const hasDirectDmPhone = Boolean(meta.dm_phone);
      const isRoutedLine = contact.phone_type === "landline" || contact.phone_type === "business_line";

      if (isRoutedLine) {
        summary.routed.total += 1;
        if (hasRoutingNotes) summary.routed.ready += 1;
        else summary.routed.needsNotes += 1;
      }

      if (hasDirectDmPhone) summary.direct.ready += 1;
      else summary.direct.needsPhone += 1;

      return summary;
    }, {
      routed: { total: 0, ready: 0, needsNotes: 0 },
      direct: { ready: 0, needsPhone: 0 },
    });
  }, [remainingQueueContacts]);
  const liveBufferPosition = useMemo(() => {
    if (session.currentIndex === null || !session.currentContact) return null;

    return {
      position: session.currentIndex + 1,
      total: Math.max(session.queue.contacts.length, session.currentIndex + 1),
      visibleInScope: session.queue.queueSupervisor.lastKnownAvailableCount ?? queueLeadCount,
    };
  }, [queueLeadCount, session.currentContact, session.currentIndex, session.queue.contacts.length, session.queue.queueSupervisor.lastKnownAvailableCount]);
  const nextLeadFacts = session.nextContact ? [
    session.nextContact.phone_type ? String(session.nextContact.phone_type).replace(/_/g, " ") : null,
    session.nextContact.industry,
    [session.nextContact.city, session.nextContact.state].filter(Boolean).join(", "),
    (session.nextContact as Record<string, unknown>).dm_phone ? "Direct DM phone captured" : null,
  ].filter(Boolean) as string[] : [];

  return (
    <AppLayout title="Dialer">
      <div className="mx-auto max-w-6xl space-y-6">
        {isCoach && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            🎓 <span className="font-semibold">Coaching session</span> — every screen is fully interactive, but calls aren't placed and outcomes aren't recorded. Use this to walk through the rep workflow.
          </div>
        )}
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
            {queueFocusLabel && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-widest font-mono">
                {queueFocusLabel}
              </Badge>
            )}
            {queueGuidance && !session.isSessionActive && (
              <span className="text-xs text-muted-foreground">
                {queueGuidance}
              </span>
            )}
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
            {!isOnline && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Offline mode: do not skip, stop, recover, or log this lead until the connection returns, or the dialer and queue can drift.
              </div>
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
                disabled={!isOnline || session.queue.isLoading || session.isStartingSession || session.isRecoveringQueue || !dialpad.hasDialpadAssignment}
                className="px-6 font-semibold"
              >
                {session.isStartingSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                {session.isStartingSession ? "Starting..." : "Start Dialing"}
              </Button>
              <Button
                variant="outline"
                onClick={() => void recoverQueueSafely()}
                disabled={!isOnline || session.queue.isLoading || session.isStartingSession || session.isRecoveringQueue}
                className="px-6 font-semibold"
              >
                {session.isRecoveringQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                {session.isRecoveringQueue ? "Recovering..." : "Recover Queue"}
              </Button>
            </>
          ) : (
            <>
              {session.isSessionPaused ? (
                <Button onClick={session.resumeSession} disabled={!isOnline} className="px-6 font-semibold">
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
                  disabled={!isOnline || dialpad.isEndingCall}
                  className="px-6 font-semibold"
                >
                  <Pause className="mr-2 h-4 w-4" />
                  Pause Dialing
                </Button>
              )}
              <Button variant="outline" onClick={() => void stopSessionSafely()} disabled={!isOnline} className="border-destructive text-destructive hover:bg-destructive/10">
                Stop Session
              </Button>
              <Button
                variant="outline"
                onClick={() => void recoverQueueSafely()}
                disabled={!isOnline || session.isRecoveringQueue || session.isStartingSession}
                className="px-6 font-semibold"
              >
                {session.isRecoveringQueue ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                {session.isRecoveringQueue ? "Recovering..." : "Recover Queue"}
              </Button>
            </>
          )}

          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-border" disabled={!isOnline}>
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
                      if (!isOnline) {
                        toast.error("You're offline. Reconnect before placing a manual call.");
                        return;
                      }
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
                  disabled={!isOnline || !manualPhone.trim() || !dialpad.myDialpadSettings?.dialpad_user_id || dialpad.dialpadCall.isPending}
                  onClick={async () => {
                    if (!isOnline) {
                      toast.error("You're offline. Reconnect before placing a manual call.");
                      return;
                    }
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
            selectedPreset={selectedPreset}
            onPresetChange={applyDialerPreset}
            onReset={resetAdvancedFilters}
            disabled={session.isSessionActive}
            matchingContactCount={session.isSessionActive ? null : queueLeadCount}
            enrichmentCoverage={enrichmentCoverage.data}
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
                <Button
                  key={item.key}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={item.clear}
                  className="h-auto gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                >
                  <span>{item.label}</span>
                  <span className="text-[10px] text-muted-foreground">×</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {!session.isSessionActive && (
          <div className="space-y-3">
            {/* Compact pre-session status strip — one line, expandable */}
            <CollapsiblePanel
              title="Pre-flight"
              subtitle={`${startReadinessSummary} · Queue ${queueSupervisorSummary.label.toLowerCase()}`}
              badge={startReadinessOpenItems.length === 0 ? "Ready" : `${startReadinessOpenItems.length} to fix`}
              badgeVariant={startReadinessOpenItems.length === 0 ? "secondary" : "outline"}
              icon={startReadinessOpenItems.length === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              defaultOpen={startReadinessOpenItems.length > 0}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Start readiness</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {startReadinessItems.map((item) => (
                      <div
                        key={item.label}
                        className={cn(
                          "rounded-md border px-3 py-2 text-xs",
                          item.ready ? "border-emerald-500/20 bg-emerald-500/10" : "border-amber-500/20 bg-amber-500/10",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {item.label === "Network" ? (
                            item.ready ? <Wifi className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" /> : <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
                          ) : item.ready ? (
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                          ) : (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-300" />
                          )}
                          <div>
                            <p className="font-semibold text-foreground">{item.label}</p>
                            <p className="mt-0.5 text-muted-foreground">{item.detail}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Queue health</p>
                    <Badge variant="outline" className={cn("font-mono text-[10px] uppercase tracking-widest", queueSupervisorSummary.badgeClassName)}>
                      {queueSupervisorSummary.label}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{queueSupervisorSummary.detail}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {queueSupervisorSummary.checkpoints.map((item) => (
                      <div key={item.label} className="rounded-md border border-border bg-background px-3 py-2">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                        <p className="mt-1 font-mono text-sm text-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {startReadinessOpenItems.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-950 dark:text-amber-100">
                  <p className="font-medium">Recommended before you start</p>
                  <ul className="mt-2 space-y-1.5">
                    {startReadinessOpenItems.map((item) => (
                      <li key={item.label} className="flex items-start gap-2">
                        <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
                        <span>{item.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CollapsiblePanel>

          </div>
        )}

        {!session.isSessionActive && (
          <CollapsiblePanel title="Pipeline routing" subtitle="Where booked & follow-up outcomes will land in GHL">
            <TwoPipelineGuide
              currentView="dialer"
              calendarName={selectedGhlCalendar?.name ?? null}
              bookedPipelineName={selectedGhlPipeline?.name ?? null}
              bookedStageName={selectedGhlStage?.name ?? null}
              followUpPipelineName={defaultFollowUpPipeline?.name ?? "Default follow-up pipeline"}
              followUpStageName={defaultFollowUpStage?.name ?? "Default follow-up stage"}
            />
          </CollapsiblePanel>
        )}

        {/* ── Active Session ── */}
        {session.isSessionActive && session.currentContact ? (
          <>
            <PowerHourTimer
              sessionCallCount={session.callCount}
              isSessionActive={session.isSessionActive}
              autoStart
              compact
            />
            {dialpad.dialpadHealth && (
              <div
                className={cn(
                  "rounded-lg border px-4 py-3",
                  dialpad.dialpadHealth.level === "healthy"
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : dialpad.dialpadHealth.level === "degraded"
                      ? "border-destructive/30 bg-destructive/10"
                      : "border-amber-500/30 bg-amber-500/10",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {dialpad.dialpadHealth.level === "healthy" ? (
                      <Radio className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className={cn("h-4 w-4", dialpad.dialpadHealth.level === "degraded" ? "text-destructive" : "text-amber-600")} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{dialpad.dialpadHealth.title}</p>
                    <p className="text-xs text-muted-foreground">{dialpad.dialpadHealth.detail}</p>
                  </div>
                </div>
              </div>
            )}
            {session.isSessionActive && session.queue.queueSupervisor.health !== "idle" && (
              <div className={cn("rounded-lg border px-4 py-3", queueSupervisorSummary.bannerClassName)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">Queue {queueSupervisorSummary.label}</p>
                    <p className="text-xs text-muted-foreground">{queueSupervisorSummary.detail}</p>
                  </div>
                  <Badge variant="outline" className={cn("font-mono text-[10px] uppercase tracking-widest", queueSupervisorSummary.badgeClassName)}>
                    {queueSupervisorSummary.checkpoints[1]?.value ?? "0"} live
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {queueSupervisorSummary.checkpoints.slice(0, 3).map((item) => (
                    <div key={item.label} className="rounded-md border border-background/60 bg-background/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                      <p className="mt-1 font-mono text-xs text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <ContactCard
                contact={{
                  ...session.currentContact,
                  ghl_contact_id:
                    (session.currentContact as any).ghl_contact_id
                    || ghlLink.getCachedGHLId(session.currentContact.id),
                }}
                onMarkPhoneQuality={(quality) => {
                  updateContact.mutateAsync({
                    id: session.currentContact!.id,
                    phone_number_quality: quality as "confirmed" | "dead" | "suspect" | "unconfirmed",
                  }).catch(() => {});
                }}
                headerActions={
                  <QuickBookRecoveryButton
                    contactId={session.currentContact.id}
                    contactName={session.currentContact.business_name || session.currentContact.contact_person || "Contact"}
                    onRecovered={() => {
                      void session.queue.discardContact(session.currentContact!.id, { releaseLock: true });
                    }}
                  />
                }
              />

              {session.isSessionPaused && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  Session paused — this lead is held in your queue and no new call will start until you resume.
                </div>
              )}

              <CollapsiblePanel
                title="Decision Maker"
                subtitle="Capture DM name, route, and gatekeeper notes"
                badge={(session.currentContact as any).dm_name ? "Captured" : "Capture"}
                badgeVariant={(session.currentContact as any).dm_name ? "secondary" : "outline"}
                icon={<UserCheck className="h-4 w-4" />}
              >
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
                  existingBestRouteToDecisionMaker={
                    (session.currentContact as any).best_route_to_decision_maker
                    ?? (session.currentContact as any).best_route_to_dm
                  }
                  existingBestTimeToCall={(session.currentContact as any).best_time_to_call}
                />
              </CollapsiblePanel>

              {/* GHL Custom Fields — full intelligence capture during the call */}
              <CollapsiblePanel
                title="Contact Intelligence"
                subtitle="GHL custom fields · auto-saves as you type"
                icon={<Brain className="h-4 w-4" />}
                badge={(session.currentContact as Record<string, unknown>).ghl_contact_id ? "GHL synced" : "Local only"}
                badgeVariant={(session.currentContact as Record<string, unknown>).ghl_contact_id ? "secondary" : "outline"}
              >
                <ContactIntelligencePanel
                  contactId={session.currentContact.id}
                  ghlContactId={
                    ((session.currentContact as Record<string, unknown>).ghl_contact_id as string | null | undefined)
                    ?? ghlLink.getCachedGHLId(session.currentContact.id)
                  }
                  contact={session.currentContact as unknown as Record<string, unknown>}
                />
              </CollapsiblePanel>

              {/* Sales Toolkit — Scripts, Objections, Voicemails */}
              <CollapsiblePanel
                title="Sales Toolkit"
                subtitle="Scripts · Objections · Voicemails"
                icon={<NotebookPen className="h-4 w-4" />}
              >
                <SalesToolkit
                  contactIndustry={session.currentContact?.industry ?? null}
                  businessName={session.currentContact?.business_name ?? null}
                  city={session.currentContact?.city ?? null}
                  state={session.currentContact?.state ?? null}
                  attemptCount={session.currentContact?.call_attempt_count ?? 0}
                />
              </CollapsiblePanel>

              {/* Embedded Dialpad CTI — no need to open Dialpad separately */}
              <DialpadCTI
                clientId={dialpadCTIClientId}
                visible={showDialpadCTI}
                onToggleVisible={() => setShowDialpadCTI((v) => !v)}
                phoneNumber={session.currentContact?.phone ?? null}
                autoInitiateCall={!isCoach && session.isDialing && !session.isSessionPaused}
                outboundCallerId={selectedCallerId || null}
                customData={session.currentContact ? JSON.stringify({
                  contact_id: session.currentContact.id,
                  business_name: session.currentContact.business_name,
                }) : null}
              />
            </div>

            <div className="space-y-4 lg:col-span-2 lg:sticky lg:top-6 lg:self-start">
              {/* Log This Call — outcomes + conversation tagging in one card */}
              <LogCallPanel
                selectedOutcome={session.selectedOutcome}
                canSubmit={canSubmit}
                isFastLogOutcome={isFastLogOutcome}
                onOutcomeClick={(nextOutcome) => {
                  if (session.selectedOutcome === nextOutcome && canSubmit && isFastLogOutcome(nextOutcome)) {
                    void logAndNext(nextOutcome);
                    return;
                  }
                  session.setSelectedOutcome(nextOutcome);
                }}
                conversationProgress={conversationProgress}
                onConversationProgressChange={setConversationProgress}
              />

              {/* Notes — directly under Log This Call so reps don't have to scan */}
              <ContactNotesPanel
                contactId={session.currentContact.id}
                notes={session.notes}
                onNotesChange={session.setNotes}
                enabled={session.isSessionActive}
              />

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
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("in_2_hours")}>In 2 hours</Button>
                          <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("tomorrow_9")}>Tomorrow 9:00</Button>
                          <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("tomorrow_2")}>Tomorrow 2:00</Button>
                          <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("next_business_day_9")}>Next business day 9:00</Button>
                          <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("in_1_month")}>In 1 month</Button>
                          <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("in_3_months")}>In 3 months</Button>
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
                      {/* Manual booking workflow callout */}
                      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs">
                        <p className="font-semibold text-foreground">📅 Manual GHL booking workflow</p>
                        <p className="mt-1 text-muted-foreground">
                          Book the appointment directly in GHL first, then fill in the date/time below to log it here. The GHL calendar/pipeline/stage fields are optional — leave them empty if you've already booked manually.
                        </p>
                      </div>
                      {/* Appointment Title */}
                      <div>
                        <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          Appointment Title
                        </label>
                        <Input
                          value={appointmentTitle}
                          onChange={(e) => setAppointmentTitle(e.target.value)}
                          placeholder="(eg) Appointment with Contact Name"
                          className="border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                          Appointment Date & Time <span className="text-primary">(required)</span>
                        </label>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => session.setFollowUpDate(new Date())}>Today</Button>
                            <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); session.setFollowUpDate(tomorrow); }}>Tomorrow</Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("tomorrow_9")}>Tomorrow 9:00</Button>
                            <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("tomorrow_2")}>Tomorrow 2:00</Button>
                            <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("next_business_day_9")}>Next business day 9:00</Button>
                            <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("in_1_month")}>In 1 month</Button>
                            <Button type="button" variant="secondary" size="sm" className="h-8" onClick={() => applySchedulePreset("in_3_months")}>In 3 months</Button>
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

                          {/* Slot picker — fetches available GHL calendar slots */}
                          {ghlCalendarId && session.followUpDate ? (
                            isLoadingSlots ? (
                              <Skeleton className="h-10 w-full" />
                            ) : freeSlots.length > 0 ? (
                              <Select
                                value={session.followUpTime}
                                onValueChange={(slotStartIso) => {
                                  // The value is the ISO start time — extract HH:mm for followUpTime
                                  const d = new Date(slotStartIso);
                                  if (!Number.isNaN(d.getTime())) {
                                    session.setFollowUpTime(formatTimeInputValue(d));
                                  } else {
                                    session.setFollowUpTime(slotStartIso);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-full border-border bg-background">
                                  <SelectValue placeholder="Select an available slot" />
                                </SelectTrigger>
                                <SelectContent>
                                  {freeSlots.map((slot) => (
                                    <SelectItem key={slot.startTime} value={slot.startTime}>
                                      {slot.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                                No GHL slots returned for this date. You can still pick a manual time below — the appointment will be logged.
                              </div>
                            )
                          ) : null}

                          {/* Fallback manual time input — always available */}
                          <Input
                            type="time"
                            value={session.followUpTime}
                            onChange={(e) => session.setFollowUpTime(e.target.value)}
                            className="border-border bg-background"
                          />

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
                          GHL Calendar <span className="text-muted-foreground">(optional — book manually in GHL)</span>
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
                          GHL Pipeline <span className="text-muted-foreground">(optional)</span>
                        </label>
                        <Select value={ghlPipelineId} onValueChange={setGhlPipelineId}>
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
                            Pipeline Stage <span className="text-muted-foreground">(optional)</span>
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
                      {ghlPipelineId && ghlSelectedPipelineStages.length === 0 && (
                        <p className="text-xs text-destructive">
                          No stages were found for the selected GHL pipeline. Pick a different pipeline before logging a booked outcome.
                        </p>
                      )}

                    </div>
                  )}

                  <div className="rounded-md border border-border/70 bg-background/80 px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">
                      {session.selectedOutcome === "booked" ? "GHL booked pipeline destination" : "GHL follow-up pipeline destination"}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {session.selectedOutcome === "booked"
                        ? `Calendar: ${selectedGhlCalendar?.name ?? "Not selected yet"}`
                        : `Follow-up task: ${followUpMethod} for ${session.assignedRepId
                            ? getRepLabel(
                                salesReps.find((rep) => rep.user_id === session.assignedRepId)?.display_name ?? null,
                                salesReps.find((rep) => rep.user_id === session.assignedRepId)?.email ?? null,
                              )
                            : "assigned rep"}`}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Opportunity: {selectedOpportunityPipeline?.name ?? (session.selectedOutcome === "follow_up" ? "Default follow-up pipeline" : "No pipeline selected")}
                      {selectedOpportunityStage
                        ? ` → ${selectedOpportunityStage.name}`
                        : session.selectedOutcome === "follow_up"
                          ? " → Default follow-up stage"
                          : ghlPipelineId
                            ? " → No stage selected"
                            : ""}
                    </p>
                    {session.selectedOutcome === "follow_up" && !selectedOpportunityPipeline && (
                      <p className="mt-1 text-amber-700 dark:text-amber-300">
                        The app will still use the configured default GHL follow-up pipeline IDs even if the names have not loaded yet.
                      </p>
                    )}
                    {requiresBookedSchedule && ghlPipelineId && ghlSelectedPipelineStages.length === 0 && (
                      <p className="mt-1 text-amber-700 dark:text-amber-300">
                        This pipeline has no stages. Pick a different pipeline before logging a booked outcome.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {session.selectedOutcome === "follow_up" && (
                <div className="space-y-4 rounded-lg border border-border bg-card p-4">
                  <div>
                    <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                      Follow-up Type
                    </label>
                    <FollowUpMethodSelector value={followUpMethod} onChange={setFollowUpMethod} allowedMethods={["call", "email"]} />
                  </div>
                  <div className="rounded-md border border-border/70 bg-background/80 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Follow-up note prep</p>
                        <p className="text-sm text-foreground">Use the shared notes panel above to capture the exact callback brief.</p>
                      </div>
                      {followUpNoteDraft && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => session.setNotes(mergeFollowUpNotes(session.notes, followUpNoteDraft))}
                        >
                          Top up from callback intel
                        </Button>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reps can now see prior synced notes and recent call outcomes while writing the next-step brief, so follow-ups stay grounded in the latest contact history.
                    </p>
                  </div>
                </div>
              )}

              {/* Log & Skip actions */}
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
                <Button variant="outline" onClick={skipLead} disabled={!isOnline} className="w-full border-border text-muted-foreground hover:text-foreground">
                  <SkipForward className="mr-2 h-4 w-4" />
                  Skip Lead
                  <kbd className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono opacity-70">S</kbd>
                </Button>
              </div>

              {/* Dialpad Sync — auto-opens only when there's an issue */}
              <CollapsiblePanel
                title="Dialpad Sync"
                subtitle={dialpad.hasTrackingRecoveryFailed ? "Tracking issue — needs attention" : "Live call tracking & transcript"}
                badge={dialpad.hasTrackingRecoveryFailed ? "Issue" : undefined}
                badgeVariant={dialpad.hasTrackingRecoveryFailed ? "destructive" : "secondary"}
                icon={<Headphones className="h-4 w-4" />}
                defaultOpen={dialpad.hasTrackingRecoveryFailed}
              >
                <Suspense fallback={<PanelSkeleton height="h-36" />}>
                  <DialpadSyncPanel
                    contactId={session.currentContact.id}
                    activeDialpadCallId={dialpad.syncTrackedDialpadCallId}
                    activeDialpadCallState={dialpad.activeDialpadCallState}
                    onCancelCall={dialpad.cancelActiveCall}
                    onRetryLink={dialpad.retryDialpadCallLink}
                    isCancelling={dialpad.cancelDialpadCall.isPending}
                    isStatusPending={dialpad.isDialpadCallStatusPending}
                    isEndingCall={dialpad.isEndingCall}
                    isResolving={dialpad.isCallResolving}
                    isRetryingUntrackedLiveCall={dialpad.isRetryingUntrackedLiveCall}
                    hasTrackingRecoveryFailed={dialpad.hasTrackingRecoveryFailed}
                    callStartedAt={dialpad.callStartedAt}
                    lastLinkAttemptAt={dialpad.lastLinkAttemptAt}
                    nextAutoRetryAt={dialpad.nextAutoRetryAt}
                    enabled
                  />
                </Suspense>
              </CollapsiblePanel>

              {/* Queue intel panels */}
              <CollapsiblePanel
                title="Queue intel"
                subtitle={`${remainingQueueContacts.length} ahead · ${session.nextContact?.business_name ?? "no next lead"}`}
                badge={`${remainingQueueContacts.length}`}
              >
                <div className="rounded-lg p-0">
                <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-1">
                  <div className="rounded-md border border-border bg-background px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Queue mix ahead</p>
                        <p className="text-sm text-foreground">What is still coming in your live buffer.</p>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">{remainingQueueContacts.length} remaining</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="text-xs">{queueMix.routedLines} routed lines</Badge>
                      <Badge variant="secondary" className="text-xs">{queueMix.mobiles} mobiles</Badge>
                      <Badge variant="secondary" className="text-xs">{queueMix.withDm} with DM captured</Badge>
                      <Badge variant="secondary" className="text-xs">{queueMix.withGatekeeperNotes} with gatekeeper notes</Badge>
                    </div>
                  </div>

                  <div className="rounded-md border border-border bg-background px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Up next</p>
                        <p className="text-sm text-foreground">Next claimed lead in your buffer.</p>
                      </div>
                    </div>
                    {session.nextContact ? (
                      <>
                        <div className="mt-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{session.nextContact.business_name}</p>
                            <p className="text-xs font-mono text-muted-foreground">{session.nextContact.phone}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] uppercase tracking-widest font-mono">
                            {session.nextContact.phone_type ? String(session.nextContact.phone_type).replace(/_/g, " ") : "phone"}
                          </Badge>
                        </div>
                        {nextLeadFacts.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {nextLeadFacts.map((fact) => (
                              <Badge key={fact} variant="secondary" className="text-xs">{fact}</Badge>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No next lead loaded yet.</p>
                    )}
                  </div>

                  <div className="rounded-md border border-border bg-background px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Enrichment queue</p>
                        <p className="text-sm text-foreground">Capture what is missing before requeue.</p>
                      </div>
                      <Badge variant="outline" className="font-mono text-xs">
                        {enrichmentQueueStats.enrichedShare}% ready direct
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span>Direct DM phone captured</span>
                        <span>{enrichmentQueueStats.readyForDirectOutreach}/{Math.max(enrichmentQueueStats.total, 1)}</span>
                      </div>
                      <Progress value={enrichmentQueueStats.enrichedShare} className="h-2" />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Badge variant="secondary" className="text-xs">{enrichmentQueueStats.needsDmPhone} need DM phone</Badge>
                        <Badge variant="secondary" className="text-xs">{enrichmentQueueStats.routedWithoutNotes} missing notes</Badge>
                      </div>
                    </div>
                  </div>
                </div>
                </div>
              </CollapsiblePanel>
            </div>
          </div>
          </>
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
            {queueGuidance && !session.queue.isLoading && (
              <div className="mt-4 max-w-2xl rounded-md border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-left">
                <p className="text-[10px] uppercase tracking-widest font-mono text-sky-300">
                  {queueFocusLabel ?? "Queue guidance"}
                </p>
                <p className="mt-1 text-sm text-sky-50/90">{queueGuidance}</p>
              </div>
            )}
            {activeFilterSummary.length > 0 && !session.queue.isLoading && (
              <div className="mt-4 flex max-w-2xl flex-wrap justify-center gap-2">
                {activeFilterSummary.slice(0, 6).map((item) => (
                  <Badge key={item.key} variant="outline" className="text-xs">{item.label}</Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
