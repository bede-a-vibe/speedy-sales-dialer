import { forwardRef, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon, CheckCircle2, Globe, Headphones, Loader2, Mail, MapPin, NotebookPen, Pause, Phone, PhoneCall, Play, Radio, RotateCcw, SkipForward, SlidersHorizontal, TimerReset, UserCheck, UserRound, Wifi, WifiOff } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { DailyTarget } from "@/components/DailyTarget";
import { OutcomeButton } from "@/components/OutcomeButton";

import { AdvancedFilters, type DialerFilterPreset } from "@/components/dialer/AdvancedFilters";
import { DecisionMakerCapture } from "@/components/dialer/DecisionMakerCapture";
import { DialpadCTI } from "@/components/dialer/DialpadCTI";
import { ContactNotesPanel } from "@/components/dialer/ContactNotesPanel";
import { PowerHourTimer } from "@/components/dialer/PowerHourTimer";
import { SalesToolkit } from "@/components/dialer/SalesToolkit";
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
import { useGHLSync } from "@/hooks/useGHLSync";
import { useMyGhlUserId } from "@/hooks/useMyGhlUserId";
import { useGHLFreeSlots } from "@/hooks/useGHLFreeSlots";
import { useGHLContactLink } from "@/hooks/useGHLContactLink";
import { findDefaultBookedPipeline, findDefaultBookedStage, findDefaultFollowUpPipeline, findDefaultFollowUpStage, useGHLCalendars, useGHLPipelines } from "@/hooks/useGHLConfig";
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

  const { data: salesReps = [] } = useSalesReps();
  const updateContact = useUpdateContact();
  const createCallLog = useCreateCallLog();
  const createPipelineItem = useCreatePipelineItem();
  const ghlSync = useGHLSync();
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
      setProspectTier("Tier 1 - Hot");
      setBuyingSignalStrength("Strong");
      return;
    }

    if (preset === "dm_direct") {
      setHasDmPhone("yes");
      setPhoneType("mobile");
      return;
    }

    if (preset === "dm_capture") {
      setHasDmPhone("no");
      return;
    }

    if (preset === "google_ads") {
      setHasGoogleAds("Yes - Active");
      return;
    }

    if (preset === "high_review") {
      setMinReviewCount(100);
      setMinGbpRating(4);
      return;
    }

    if (preset === "landline_enrichment") {
      setPhoneType("landline");
      setHasDmPhone("no");
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
    && (!requiresBookedSchedule || (!!session.followUpTime && !!ghlCalendarId && !!ghlPipelineId && !!ghlStageId))
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
        ghlSync.pushCallNote({
          ghlContactId: contactGhlId,
          outcome: outcomeToLog,
          notes: pipelineNotes || undefined,
          repName,
        }).catch(() => {});

        // Update opportunity stage in Outbound Prospecting pipeline for every outcome
        ghlSync.updateOpportunityStage({
          ghlContactId: contactGhlId,
          outcome: outcomeToLog,
          contactName,
        }).catch(() => {});

        if (outcomeToLog === "booked" && scheduledFor && calendarId) {
          ghlSync.pushBooking({
            ghlContactId: contactGhlId,
            contactId,
            calendarId,
            scheduledFor,
            contactName,
            repName,
            notes: pipelineNotes || undefined,
            pipelineItemId: createdPipelineItem?.id,
            pipelineId: pipelineId || undefined,
            pipelineStageId: stageId || undefined,
          }).catch(() => {});
        }

        if (outcomeToLog === "follow_up" && scheduledFor) {
          ghlSync.pushFollowUp({
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

            ghlSync.pushFollowUpEmailDraft({
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
          ghlSync.pushDNC({ ghlContactId: contactGhlId, contactId }).catch(() => {});
        }
      }
    })();
  }, [
    session,
    dialpad,
    createCallLog,
    createPipelineItem,
    updateContact,
    ghlSync,
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
          <div className="grid gap-4 xl:grid-cols-[1.35fr,0.95fr]">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Start readiness</p>
                  <p className="text-sm text-foreground">Quick operator preflight before the next dial session.</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-widest",
                    startReadinessOpenItems.length === 0
                      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-300"
                      : "border-amber-500/30 text-amber-700 dark:text-amber-300",
                  )}
                >
                  {startReadinessSummary}
                </Badge>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {startReadinessItems.map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      "rounded-md border px-3 py-3 text-xs",
                      item.ready
                        ? "border-emerald-500/20 bg-emerald-500/10"
                        : "border-amber-500/20 bg-amber-500/10",
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
                        <p className="mt-1 text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
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
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Queue health</p>
                  <p className="text-sm text-foreground">Operator visibility into claimable scope before you hit start.</p>
                </div>
                <Badge variant="outline" className={cn("font-mono text-[10px] uppercase tracking-widest", queueSupervisorSummary.badgeClassName)}>
                  {queueSupervisorSummary.label}
                </Badge>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{queueSupervisorSummary.detail}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {queueSupervisorSummary.checkpoints.map((item) => (
                  <div key={item.label} className="rounded-md border border-border bg-background px-3 py-3">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                    <p className="mt-1 font-mono text-sm text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Power Hour Timer — Fanatical Prospecting */}
            <PowerHourTimer
              sessionCallCount={session.callCount}
              isSessionActive={session.isSessionActive}
            />
          </div>
        )}

        <TwoPipelineGuide
          currentView="dialer"
          calendarName={selectedGhlCalendar?.name ?? null}
          bookedPipelineName={selectedGhlPipeline?.name ?? null}
          bookedStageName={selectedGhlStage?.name ?? null}
          followUpPipelineName={defaultFollowUpPipeline?.name ?? "Default follow-up pipeline"}
          followUpStageName={defaultFollowUpStage?.name ?? "Default follow-up stage"}
        />

        {/* ── Active Session ── */}
        {session.isSessionActive && session.currentContact ? (
          <>
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
            {/* Power Hour Timer — visible during active session */}
            <PowerHourTimer
              sessionCallCount={session.callCount}
              isSessionActive={session.isSessionActive}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <ContactCard
                contact={session.currentContact}
                onMarkPhoneQuality={(quality) => {
                  updateContact.mutateAsync({
                    id: session.currentContact!.id,
                    phone_number_quality: quality as "confirmed" | "dead" | "suspect" | "unconfirmed",
                  }).catch(() => {});
                }}
              />

              {session.isSessionPaused && (
                <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                  Session paused — this lead is held in your queue and no new call will start until you resume.
                </div>
              )}

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


              {/* Sales Toolkit — Scripts, Objections, Voicemails */}
              <SalesToolkit
                contactIndustry={session.currentContact?.industry ?? null}
                businessName={session.currentContact?.business_name ?? null}
                city={session.currentContact?.city ?? null}
                state={session.currentContact?.state ?? null}
                attemptCount={session.currentContact?.call_attempt_count ?? 0}
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
              {/* Call Outcome — top of right column for speed */}
              <div className="rounded-lg border border-border bg-card p-4">
                <label className="mb-3 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  Call Outcome <span className="text-primary">(required)</span>
                </label>
                <div className="space-y-2">
                  {outcomes.map((outcome) => {
                    const isSelected = session.selectedOutcome === outcome;
                    const canFastLogThisOutcome = canSubmit && isFastLogOutcome(outcome);

                    return (
                      <OutcomeButton
                        key={outcome}
                        outcome={outcome}
                        label={outcome === "booked" ? "Book" : undefined}
                        selected={isSelected}
                        hint={isSelected && canFastLogThisOutcome ? "Click again to save" : undefined}
                        onClick={(nextOutcome) => {
                          if (session.selectedOutcome === nextOutcome && canFastLogThisOutcome) {
                            void logAndNext(nextOutcome);
                            return;
                          }
                          session.setSelectedOutcome(nextOutcome);
                        }}
                      />
                    );
                  })}
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
                            Pipeline Stage <span className="text-primary">(required)</span>
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

              {/* Notes */}
              <ContactNotesPanel
                contactId={session.currentContact.id}
                notes={session.notes}
                onNotesChange={session.setNotes}
                enabled={session.isSessionActive}
              />

              {/* Dialpad Sync — lower priority, moved below actions */}
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

              {/* Queue intel panels */}
              <div className="rounded-lg border border-border bg-card p-4">
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
