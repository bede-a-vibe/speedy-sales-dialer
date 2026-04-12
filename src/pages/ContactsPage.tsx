import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Phone, Mail, Globe, MapPin, ChevronDown, ChevronUp, Pencil, Trash2, Download, CalendarClock, ArrowRight, Clock3, Plus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { GhlMirrorDetails } from "@/components/ghl/GhlMirrorDetails";
import { GhlMirrorStatusBadge, getGhlMirrorCue } from "@/components/ghl/GhlMirrorStatusBadge";
import { useUpdateContact, useCreateContact, usePaginatedContacts, type ContactsSortOption } from "@/hooks/useContacts";
import { useCreatePipelineItem, useContactPipelineItems, useSalesReps } from "@/hooks/usePipelineItems";
import { useAuth } from "@/hooks/useAuth";
import { useContactCallLogs } from "@/hooks/useCallLogs";
import { usePaginatedContactNotes } from "@/hooks/useContactNotes";
import { useIsAdmin } from "@/hooks/useUserRole";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { INDUSTRIES, OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { getDefaultManualFollowUpScheduledFor, shouldCreatePipelineItemForStatus } from "@/lib/pipelineMappings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Contact } from "@/hooks/useContacts";
import type { PipelineItemWithRelations } from "@/hooks/usePipelineItems";

const CONTACTS_PER_PAGE = 100;

const AUSTRALIAN_STATE_OPTIONS = [
  { value: "all", label: "All States" },
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
] as const;

const NOTE_SOURCE_LABELS = {
  manual: "Manual note",
  dialpad_summary: "Dialpad summary",
  dialpad_transcript: "Dialpad transcript",
} as const;

const CONTACT_STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "uncalled", label: "Uncalled" },
  { value: "called", label: "Called" },
  { value: "follow_up", label: "Follow Up" },
  { value: "booked", label: "Booked" },
  { value: "closed", label: "Closed" },
  { value: "not_interested", label: "Not Interested" },
  { value: "dnc", label: "Do Not Call" },
] as const;

const APPOINTMENT_OUTCOME_FILTER_OPTIONS = [
  { value: "all", label: "All Outcomes" },
  { value: "no_show", label: "No Show" },
  { value: "rescheduled", label: "Rescheduled" },
  { value: "showed_verbal_commitment", label: "Verbal Commitment" },
  { value: "showed_closed", label: "Showed - Closed" },
  { value: "showed_no_close", label: "Showed - No Close" },
] as const;

const CONTACT_SORT_OPTIONS: { value: ContactsSortOption; label: string }[] = [
  { value: "operational", label: "Operational priority" },
  { value: "updated_desc", label: "Recently updated" },
  { value: "created_desc", label: "Recently created" },
  { value: "business_name_asc", label: "Business name (A-Z)" },
];

const STATUS_BADGE_CLASSES: Record<string, string> = {
  uncalled: "bg-muted text-muted-foreground",
  called: "bg-primary/10 text-primary",
  follow_up: "bg-amber-500/10 text-amber-600",
  booked: "bg-blue-500/10 text-blue-600",
  closed: "bg-emerald-500/10 text-emerald-600",
  not_interested: "bg-muted text-muted-foreground",
  dnc: "bg-destructive/10 text-destructive",
};

const PHONE_QUALITY_OPTIONS = ["unconfirmed", "confirmed", "suspect", "dead"] as const;
const PHONE_TYPE_OPTIONS = ["unknown", "mobile", "landline", "business_line"] as const;

const PHONE_QUALITY_LABELS: Record<(typeof PHONE_QUALITY_OPTIONS)[number], string> = {
  unconfirmed: "Unconfirmed",
  confirmed: "Confirmed",
  suspect: "Suspect",
  dead: "Dead",
};

const PHONE_TYPE_LABELS: Record<(typeof PHONE_TYPE_OPTIONS)[number], string> = {
  unknown: "Unknown",
  mobile: "Mobile",
  landline: "Landline",
  business_line: "Business Line",
};

type ContactIntegrityBadge = {
  label: string;
  className: string;
  title: string;
};

type ContactActionCue = {
  label: string;
  detail: string;
  className: string;
  title: string;
};

type ContactAutoRepairPlan = {
  updates: Partial<Contact>;
  successMessage: string;
  title: string;
};

type ContactFocusFilter = "all" | "follow_up" | "integrity" | "drift" | "queue_ready" | "enrichment";

type FocusBoardCard = {
  id: string;
  label: string;
  count: number;
  detail: string;
  accentClassName: string;
  focusFilter: ContactFocusFilter;
  leadContact: Contact | null;
};

function getContactIntegrityBadges(contact: Contact): ContactIntegrityBadge[] {
  const badges: ContactIntegrityBadge[] = [];
  const hasGhlLink = Boolean(contact.ghl_contact_id);
  const hasBookedDate = Boolean(contact.meeting_booked_date || contact.latest_appointment_scheduled_for);
  const hasFollowUpDate = Boolean(contact.next_followup_date);

  badges.push(
    hasGhlLink
      ? {
          label: "GHL linked",
          className: "bg-emerald-500/10 text-emerald-700",
          title: `Linked to GHL contact ${contact.ghl_contact_id}`,
        }
      : {
          label: "Local only",
          className: "bg-amber-500/10 text-amber-700",
          title: "This contact has no saved GHL contact id yet, so remote sync can drift.",
        },
  );

  if (contact.status === "booked" && !hasBookedDate) {
    badges.push({
      label: "Booked missing date",
      className: "bg-destructive/10 text-destructive",
      title: "Status is booked, but there is no booked appointment date saved on the contact.",
    });
  }

  if (contact.status === "follow_up" && !hasFollowUpDate) {
    badges.push({
      label: "Follow-up missing date",
      className: "bg-destructive/10 text-destructive",
      title: "Status is follow_up, but there is no next follow-up date saved on the contact.",
    });
  }

  if (contact.status !== "booked" && Boolean(contact.meeting_booked_date)) {
    badges.push({
      label: "Booked drift",
      className: "bg-sky-500/10 text-sky-700",
      title: "A booked date is still saved locally even though the contact status is no longer booked.",
    });
  }

  if (contact.status !== "follow_up" && Boolean(contact.next_followup_date)) {
    badges.push({
      label: "Follow-up drift",
      className: "bg-sky-500/10 text-sky-700",
      title: "A follow-up date is still saved locally even though the contact status is no longer follow_up.",
    });
  }

  return badges;
}

function getContactStage(contact: Contact) {
  if (contact.latest_appointment_outcome) return getAppointmentOutcomeLabel(contact.latest_appointment_outcome);
  if (contact.latest_appointment_scheduled_for) return "Booked appointment";
  if (contact.last_outcome) return OUTCOME_CONFIG[contact.last_outcome as CallOutcome]?.label || contact.last_outcome;
  return "—";
}

function getOperationalRank(contact: Contact) {
  let score = 0;

  if (contact.status === "follow_up") score += 120;
  if (contact.status === "booked") score += 105;
  if (contact.latest_appointment_scheduled_for) score += 20;
  if (contact.next_followup_date) score += 18;
  if (contact.dm_phone) score += 40;
  if (contact.dm_name) score += 10;
  if (contact.ghl_contact_id) score += 16;
  if (contact.best_time_to_call) score += 8;
  if (contact.best_route_to_decision_maker) score += 6;
  if (contact.gatekeeper_name) score += 5;
  if (contact.phone_type === "mobile") score += 14;
  if (contact.phone_type === "business_line") score += 4;
  if (contact.phone_type === "landline") score -= 6;
  if (contact.phone_number_quality === "confirmed") score += 10;
  if (contact.phone_number_quality === "suspect") score -= 12;
  if (contact.phone_number_quality === "dead") score -= 40;
  if ((contact.call_attempt_count ?? 0) === 0) score += 8;
  if ((contact.call_attempt_count ?? 0) >= 4) score -= 8;
  if ((contact.voicemail_count ?? 0) >= 2) score -= 6;
  if (contact.status === "closed") score -= 60;
  if (contact.status === "not_interested") score -= 50;
  if (contact.is_dnc || contact.status === "dnc") score -= 100;

  return score;
}

function getQueueReadinessBadge(contact: Contact): ContactIntegrityBadge {
  if (contact.is_dnc || contact.status === "dnc") {
    return {
      label: "Do not call",
      className: "bg-destructive/10 text-destructive",
      title: "This contact should stay out of the active queue.",
    };
  }

  if (contact.status === "booked" || contact.latest_appointment_scheduled_for) {
    return {
      label: "Booked",
      className: "bg-blue-500/10 text-blue-700",
      title: "This contact already has a booked appointment state recorded.",
    };
  }

  if (contact.status === "follow_up") {
    return {
      label: "Follow-up due",
      className: "bg-amber-500/10 text-amber-700",
      title: "This contact is sitting in follow-up and should be worked before cold leads.",
    };
  }

  if (contact.dm_phone && contact.ghl_contact_id) {
    return {
      label: "Direct + linked",
      className: "bg-emerald-500/10 text-emerald-700",
      title: "Decision-maker direct line is captured and the contact is linked to GHL.",
    };
  }

  if (contact.dm_phone) {
    return {
      label: "Direct path",
      className: "bg-emerald-500/10 text-emerald-700",
      title: "A direct decision-maker number is already captured.",
    };
  }

  if (contact.phone_type === "landline" || contact.phone_type === "business_line") {
    return {
      label: "Needs routing",
      className: "bg-orange-500/10 text-orange-700",
      title: "This is a routed business line and still needs better gatekeeper or transfer intel.",
    };
  }

  return {
    label: "Needs enrichment",
    className: "bg-muted text-muted-foreground",
    title: "This lead still needs cleaner operational context before it is queue-ready.",
  };
}

function hasIntegrityIssue(contact: Contact) {
  return (contact.status === "booked" && !contact.meeting_booked_date && !contact.latest_appointment_scheduled_for)
    || (contact.status === "follow_up" && !contact.next_followup_date);
}

function getAutoRepairPlan(contact: Contact): ContactAutoRepairPlan | null {
  if (contact.status !== "booked" && contact.meeting_booked_date) {
    return {
      updates: { meeting_booked_date: null },
      successMessage: "Cleared stale booked date.",
      title: "Remove stale booked date saved on a non-booked contact.",
    };
  }

  if (contact.status !== "follow_up" && contact.next_followup_date) {
    return {
      updates: { next_followup_date: null },
      successMessage: "Cleared stale follow-up date.",
      title: "Remove stale follow-up date saved on a contact that is no longer in follow-up.",
    };
  }

  if (contact.status === "follow_up" && !contact.next_followup_date) {
    return {
      updates: { next_followup_date: getDefaultManualFollowUpScheduledFor().toISOString() },
      successMessage: "Scheduled a default follow-up time.",
      title: "Restore a missing next follow-up date so this callback can re-enter the working queue.",
    };
  }

  return null;
}

function hasOperationalDrift(contact: Contact) {
  return (!contact.ghl_contact_id && (contact.status === "follow_up" || contact.status === "booked"))
    || (contact.status !== "booked" && Boolean(contact.meeting_booked_date))
    || (contact.status !== "follow_up" && Boolean(contact.next_followup_date));
}

function isQueueReady(contact: Contact) {
  if (contact.is_dnc || contact.status === "dnc" || contact.status === "booked" || contact.status === "follow_up" || contact.latest_appointment_scheduled_for) {
    return false;
  }

  return Boolean(contact.dm_phone);
}

function needsEnrichment(contact: Contact) {
  if (contact.is_dnc || contact.status === "dnc" || contact.status === "booked" || contact.status === "follow_up" || contact.latest_appointment_scheduled_for) {
    return false;
  }

  return !contact.dm_phone || contact.phone_type === "landline" || contact.phone_type === "business_line" || !contact.ghl_contact_id;
}

function matchesFocusFilter(contact: Contact, focusFilter: ContactFocusFilter) {
  switch (focusFilter) {
    case "follow_up":
      return contact.status === "follow_up";
    case "integrity":
      return hasIntegrityIssue(contact);
    case "drift":
      return hasOperationalDrift(contact);
    case "queue_ready":
      return isQueueReady(contact);
    case "enrichment":
      return needsEnrichment(contact);
    default:
      return true;
  }
}

function isFollowUpDueSoon(contact: Contact) {
  if (contact.status !== "follow_up" || !contact.next_followup_date) return false;
  const followUpAt = new Date(contact.next_followup_date).getTime();
  return followUpAt <= Date.now() + (1000 * 60 * 60 * 24);
}

function needsBookedHandoffFix(contact: Contact) {
  return contact.status === "booked" && !contact.meeting_booked_date && !contact.latest_appointment_scheduled_for;
}

function needsDirectPathCapture(contact: Contact) {
  if (contact.is_dnc || contact.status === "dnc" || contact.status === "booked" || contact.status === "follow_up" || contact.latest_appointment_scheduled_for) {
    return false;
  }

  return !contact.dm_phone;
}

function getContactActionCue(contact: Contact): ContactActionCue {
  const bookedAt = contact.meeting_booked_date || contact.latest_appointment_scheduled_for;
  const followUpAt = contact.next_followup_date;

  if (contact.is_dnc || contact.status === "dnc") {
    return {
      label: "Blocked",
      detail: "Keep out of queue",
      className: "bg-destructive/10 text-destructive",
      title: "This record is marked do-not-call and should not be worked.",
    };
  }

  if (contact.status === "booked" && !bookedAt) {
    return {
      label: "Fix booked state",
      detail: "Missing appointment date",
      className: "bg-destructive/10 text-destructive",
      title: "Booked status exists without a saved appointment date, so reps cannot trust the handoff.",
    };
  }

  if (contact.status === "follow_up" && !followUpAt) {
    return {
      label: "Fix follow-up",
      detail: "Missing next date",
      className: "bg-destructive/10 text-destructive",
      title: "Follow-up status exists without a scheduled next touch date.",
    };
  }

  if (!contact.ghl_contact_id && (contact.status === "follow_up" || contact.status === "booked")) {
    return {
      label: "Link to GHL",
      detail: "Status can drift remotely",
      className: "bg-amber-500/10 text-amber-700",
      title: "This active operational contact is not linked to GHL yet.",
    };
  }

  if (contact.status === "booked") {
    return {
      label: "Booked",
      detail: bookedAt ? format(new Date(bookedAt), "MMM d, h:mm a") : "Review handoff",
      className: "bg-blue-500/10 text-blue-700",
      title: "Booked contact, confirm the appointment details and keep it out of the active dial queue.",
    };
  }

  if (contact.status === "follow_up") {
    return {
      label: "Work follow-up",
      detail: followUpAt ? format(new Date(followUpAt), "MMM d, h:mm a") : "Needs scheduling",
      className: "bg-amber-500/10 text-amber-700",
      title: "This contact should be worked as a follow-up before cold queue leads.",
    };
  }

  if (contact.dm_phone && contact.ghl_contact_id) {
    return {
      label: "Queue ready",
      detail: "Direct DM + linked",
      className: "bg-emerald-500/10 text-emerald-700",
      title: "This contact has a direct decision-maker path and is linked to GHL.",
    };
  }

  if (contact.dm_phone) {
    return {
      label: "Queue ready",
      detail: "Direct DM captured",
      className: "bg-emerald-500/10 text-emerald-700",
      title: "This contact has a direct decision-maker number saved.",
    };
  }

  if (contact.phone_type === "landline" || contact.phone_type === "business_line") {
    return {
      label: "Capture routing",
      detail: "Need transfer intel",
      className: "bg-orange-500/10 text-orange-700",
      title: "This routed line still needs better gatekeeper or transfer notes before it is truly queue-ready.",
    };
  }

  if (!contact.ghl_contact_id) {
    return {
      label: "Enrich + link",
      detail: "No GHL identity yet",
      className: "bg-muted text-muted-foreground",
      title: "This lead still needs cleaner operating context and a saved GHL identity.",
    };
  }

  return {
    label: "Enrich contact",
    detail: "Confirm DM path",
    className: "bg-muted text-muted-foreground",
    title: "This lead still needs better decision-maker or routing context before it is fully queue-ready.",
  };
}

function TimelineSectionSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-20 w-full rounded border border-border" />
      <Skeleton className="h-20 w-full rounded border border-border" />
    </div>
  );
}

function PipelineTimeline({ contactId }: { contactId: string }) {
  const { data: items = [], isLoading } = useContactPipelineItems(contactId);

  if (isLoading) return <TimelineSectionSkeleton />;
  if (items.length === 0) return <p className="text-xs text-muted-foreground">No pipeline items.</p>;

  return (
    <div className="space-y-2">
      {items.map((item: PipelineItemWithRelations) => {
        const isBooked = item.pipeline_type === "booked";
        const statusColor = item.status === "completed" ? "bg-emerald-500" : item.status === "canceled" ? "bg-muted-foreground" : "bg-blue-500";
        const ghlCue = getGhlMirrorCue({
          pipelineType: item.pipeline_type,
          ghlContactId: item.contacts?.ghl_contact_id,
          ghlOpportunityId: item.ghl_opportunity_id,
          ghlPipelineId: item.ghl_pipeline_id,
          ghlStageId: item.ghl_stage_id,
        });

        return (
          <div key={item.id} className="space-y-2 rounded border border-border bg-card px-3 py-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className={`h-2 w-2 rounded-full ${statusColor}`} />
              <span className="font-medium text-foreground">
                {isBooked ? "Booked Appointment" : "Follow-up"}
              </span>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-secondary-foreground">
                {item.status}
              </span>
              <GhlMirrorStatusBadge
                pipelineType={item.pipeline_type}
                ghlContactId={item.contacts?.ghl_contact_id}
                ghlOpportunityId={item.ghl_opportunity_id}
                ghlPipelineId={item.ghl_pipeline_id}
                ghlStageId={item.ghl_stage_id}
              />
              {item.appointment_outcome && (
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                  {getAppointmentOutcomeLabel(item.appointment_outcome)}
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                {format(new Date(item.created_at), "MMM d, h:mm a")}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{ghlCue}</p>
            {item.scheduled_for && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                Scheduled: <span className="font-mono">{format(new Date(item.scheduled_for), "MMM d, yyyy h:mm a")}</span>
              </p>
            )}
            <GhlMirrorDetails
              className="bg-background/40"
              pipelineType={item.pipeline_type}
              ghlContactId={item.contacts?.ghl_contact_id}
              ghlOpportunityId={item.ghl_opportunity_id}
              ghlPipelineId={item.ghl_pipeline_id}
              ghlStageId={item.ghl_stage_id}
            />
            {item.notes && <p className="text-xs italic text-muted-foreground">"{item.notes}"</p>}
            {item.outcome_notes && <p className="text-xs text-muted-foreground">Outcome notes: "{item.outcome_notes}"</p>}
            {item.completed_at && (
              <p className="text-[10px] font-mono text-muted-foreground">
                Completed {format(new Date(item.completed_at), "MMM d, yyyy")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ExpandedContactDetails({ contact }: { contact: Contact }) {
  const integrityBadges = getContactIntegrityBadges(contact);
  const {
    data: callLogPages,
    isLoading: isLoadingCallLogs,
    hasNextPage: hasMoreCallLogs,
    fetchNextPage: fetchMoreCallLogs,
    isFetchingNextPage: isFetchingMoreCallLogs,
  } = useContactCallLogs(contact.id);
  const {
    data: notePages,
    isLoading: isLoadingNotes,
    hasNextPage: hasMoreNotes,
    fetchNextPage: fetchMoreNotes,
    isFetchingNextPage: isFetchingMoreNotes,
  } = usePaginatedContactNotes(contact.id);

  const callLogs = callLogPages?.pages.flatMap((page) => page.items) ?? [];
  const callLogTotal = callLogPages?.pages[0]?.totalCount ?? 0;
  const notes = notePages?.pages.flatMap((page) => page.items) ?? [];
  const noteTotal = notePages?.pages[0]?.totalCount ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
        <span className={`rounded px-2 py-1 font-mono ${STATUS_BADGE_CLASSES[contact.status] || "bg-muted text-muted-foreground"}`}>
          {contact.status}
        </span>
        {contact.is_dnc && <span className="rounded bg-destructive/10 px-2 py-1 font-mono text-destructive">Do Not Call</span>}
        <span className="rounded bg-secondary px-2 py-1 font-mono text-secondary-foreground">
          {PHONE_TYPE_LABELS[(contact.phone_type as keyof typeof PHONE_TYPE_LABELS) || "unknown"] || "Unknown"}
        </span>
        <span className="rounded bg-secondary px-2 py-1 font-mono text-secondary-foreground">
          {PHONE_QUALITY_LABELS[(contact.phone_number_quality as keyof typeof PHONE_QUALITY_LABELS) || "unconfirmed"] || "Unconfirmed"}
        </span>
        {contact.prospect_tier && <span className="rounded bg-primary/10 px-2 py-1 font-mono text-primary">{contact.prospect_tier}</span>}
        {contact.buying_signal_strength && <span className="rounded bg-emerald-500/10 px-2 py-1 font-mono text-emerald-600">Signal: {contact.buying_signal_strength}</span>}
      </div>

      <div className="rounded border border-border bg-card px-3 py-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <CalendarClock className="h-3 w-3" /> GHL & Scheduling Integrity
        </div>
        <div className="flex flex-wrap gap-2">
          {integrityBadges.map((badge) => (
            <span key={badge.label} className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-widest ${badge.className}`} title={badge.title}>
              {badge.label}
            </span>
          ))}
        </div>
        <div className="mt-3 grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
          <p>GHL Contact ID: <span className="font-mono text-foreground">{contact.ghl_contact_id || "—"}</span></p>
          <p>Next Follow-up: <span className="font-mono text-foreground">{contact.next_followup_date ? format(new Date(contact.next_followup_date), "MMM d, yyyy h:mm a") : "—"}</span></p>
          <p>Meeting Booked: <span className="font-mono text-foreground">{contact.meeting_booked_date ? format(new Date(contact.meeting_booked_date), "MMM d, yyyy h:mm a") : "—"}</span></p>
          <p>Eligibility: <span className="text-foreground">{contact.is_dnc ? "Blocked, DNC" : contact.phone ? "Callable" : "Missing phone"}</span></p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {contact.email && <a href={`mailto:${contact.email}`} className="flex items-center gap-1 transition-colors hover:text-foreground"><Mail className="h-3 w-3" /> {contact.email}</a>}
        {contact.website && <a href={contact.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 transition-colors hover:text-foreground"><Globe className="h-3 w-3" /> Website</a>}
        {(contact.city || contact.state) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[contact.city, contact.state].filter(Boolean).join(", ")}</span>}
        <a href={`tel:${contact.phone}`} className="ml-auto flex items-center gap-1 transition-colors hover:text-foreground"><Phone className="h-3 w-3" /> Call Now</a>
      </div>

      {(contact.latest_appointment_scheduled_for || contact.latest_appointment_outcome) && (
        <div className="rounded border border-border bg-card px-3 py-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <CalendarClock className="h-3 w-3" /> Current Appointment Status
          </div>
          <div className="space-y-1 text-sm">
            {contact.latest_appointment_scheduled_for && (
              <p className="text-foreground">Day: <span className="font-mono">{format(new Date(contact.latest_appointment_scheduled_for), "MMM d, yyyy")}</span></p>
            )}
            {contact.latest_appointment_outcome && (
              <p className="text-foreground">Outcome: <span className="text-muted-foreground">{getAppointmentOutcomeLabel(contact.latest_appointment_outcome)}</span></p>
            )}
            {contact.latest_appointment_recorded_at && (
              <p className="text-xs text-muted-foreground">Updated {format(new Date(contact.latest_appointment_recorded_at), "MMM d, h:mm a")}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-border bg-card px-3 py-3">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Phone Intelligence</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>Attempts: <span className="font-mono text-foreground">{contact.call_attempt_count ?? 0}</span></p>
            <p>Voicemails: <span className="font-mono text-foreground">{contact.voicemail_count ?? 0}</span></p>
            {contact.best_time_to_call && <p>Best time: <span className="text-foreground">{contact.best_time_to_call}</span></p>}
            {contact.follow_up_note && <p className="italic text-foreground">“{contact.follow_up_note}”</p>}
          </div>
        </div>
        <div className="rounded border border-border bg-card px-3 py-3">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Decision Maker Intel</p>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            {contact.dm_name ? (
              <>
                <p className="text-foreground">{contact.dm_name}{contact.dm_role ? <span className="text-muted-foreground">, {contact.dm_role}</span> : null}</p>
                {contact.dm_phone && <p>Phone: <span className="font-mono text-foreground">{contact.dm_phone}</span></p>}
                {contact.dm_email && <p>Email: <span className="text-foreground">{contact.dm_email}</span></p>}
              </>
            ) : (
              <p>No decision maker captured yet.</p>
            )}
            {contact.gatekeeper_name && <p>Gatekeeper: <span className="text-foreground">{contact.gatekeeper_name}</span></p>}
            {contact.best_route_to_decision_maker && <p>Best route: <span className="text-foreground">{contact.best_route_to_decision_maker}</span></p>}
          </div>
        </div>
      </div>

      {/* Pipeline Items Timeline */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">Pipeline History</p>
        <PipelineTimeline contactId={contact.id} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Call History ({callLogTotal > callLogs.length ? `${callLogs.length} of ${callLogTotal}` : callLogTotal})
          </p>
        </div>
        {isLoadingCallLogs ? (
          <TimelineSectionSkeleton />
        ) : callLogs.length > 0 ? (
          <div className="space-y-2">
            {callLogs.map((log) => {
              const config = OUTCOME_CONFIG[log.outcome as CallOutcome];
              const hasSyncedSummary = Boolean(log.dialpad_summary);
              const hasSyncedTranscript = Boolean(log.dialpad_transcript);
              const syncPending = Boolean(log.dialpad_call_id) && !log.transcript_synced_at;

              return (
                <div key={log.id} className="space-y-2 rounded border border-border bg-card px-3 py-3">
                  <div className="flex items-center gap-3 text-xs">
                    <div className={`h-2 w-2 rounded-full ${config?.bgClass || "bg-muted-foreground"}`} />
                    <span className="font-medium text-foreground">{config?.label || log.outcome}</span>
                    {syncPending && <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Sync pending</span>}
                    {hasSyncedSummary && <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">Summary</span>}
                    {hasSyncedTranscript && <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-foreground">Transcript</span>}
                    <span className="ml-auto shrink-0 font-mono text-muted-foreground">{format(new Date(log.created_at), "MMM d, h:mm a")}</span>
                  </div>
                  {log.notes && <p className="text-xs italic text-muted-foreground">"{log.notes}"</p>}
                  {hasSyncedSummary && <div className="whitespace-pre-wrap rounded-md bg-background px-3 py-2 text-xs text-foreground">{log.dialpad_summary}</div>}
                </div>
              );
            })}
            {hasMoreCallLogs && (
              <Button variant="outline" size="sm" onClick={() => fetchMoreCallLogs()} disabled={isFetchingMoreCallLogs}>
                {isFetchingMoreCallLogs ? "Loading…" : "Load more call history"}
              </Button>
            )}
          </div>
        ) : <p className="text-xs text-muted-foreground">No call history.</p>}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Contact Notes ({noteTotal > notes.length ? `${notes.length} of ${noteTotal}` : noteTotal})
          </p>
        </div>
        {isLoadingNotes ? (
          <TimelineSectionSkeleton />
        ) : notes.length > 0 ? (
          <div className="space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded border border-border bg-card px-3 py-3">
                <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span className="rounded bg-secondary px-2 py-1 text-secondary-foreground">{NOTE_SOURCE_LABELS[note.source]}</span>
                  <span className="font-mono">{format(new Date(note.created_at), "MMM d, h:mm a")}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{note.content}</p>
              </div>
            ))}
            {hasMoreNotes && (
              <Button variant="outline" size="sm" onClick={() => fetchMoreNotes()} disabled={isFetchingMoreNotes}>
                {isFetchingMoreNotes ? "Loading…" : "Load more notes"}
              </Button>
            )}
          </div>
        ) : <p className="text-xs text-muted-foreground">No contact notes yet.</p>}
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [appointmentOutcomeFilter, setAppointmentOutcomeFilter] = useState("all");
  const [focusFilter, setFocusFilter] = useState<ContactFocusFilter>("all");
  const [sortBy, setSortBy] = useState<ContactsSortOption>("operational");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<Partial<Contact>>({});
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("10:00");
  const [page, setPage] = useState(1);
  const [statusChangeContact, setStatusChangeContact] = useState<Contact | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<{
    business_name: string;
    contact_person: string;
    phone: string;
    email: string;
    industry: string;
    website: string;
    gmb_link: string;
    city: string;
    state: string;
  }>({
    business_name: "",
    contact_person: "",
    phone: "",
    email: "",
    industry: "",
    website: "",
    gmb_link: "",
    city: "",
    state: "",
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = usePaginatedContacts({
    industry: industryFilter,
    status: statusFilter,
    state: stateFilter,
    appointmentOutcome: appointmentOutcomeFilter,
    search: debouncedSearch,
    page,
    pageSize: CONTACTS_PER_PAGE,
    sortBy,
  });

  const allPageContacts = useMemo(() => {
    const items = [...(data?.contacts ?? [])];

    if (sortBy === "operational") {
      items.sort((a, b) => {
        const scoreDelta = getOperationalRank(b) - getOperationalRank(a);
        if (scoreDelta !== 0) return scoreDelta;

        const followUpTimeDelta = (a.next_followup_date ? new Date(a.next_followup_date).getTime() : Number.POSITIVE_INFINITY)
          - (b.next_followup_date ? new Date(b.next_followup_date).getTime() : Number.POSITIVE_INFINITY);
        if (followUpTimeDelta !== 0) return followUpTimeDelta;

        return a.business_name.localeCompare(b.business_name);
      });
    }

    return items;
  }, [data?.contacts, sortBy]);

  const focusCounts = useMemo(() => ({
    all: allPageContacts.length,
    follow_up: allPageContacts.filter((contact) => matchesFocusFilter(contact, "follow_up")).length,
    integrity: allPageContacts.filter((contact) => matchesFocusFilter(contact, "integrity")).length,
    drift: allPageContacts.filter((contact) => matchesFocusFilter(contact, "drift")).length,
    queue_ready: allPageContacts.filter((contact) => matchesFocusFilter(contact, "queue_ready")).length,
    enrichment: allPageContacts.filter((contact) => matchesFocusFilter(contact, "enrichment")).length,
  }), [allPageContacts]);

  const contacts = useMemo(
    () => allPageContacts.filter((contact) => matchesFocusFilter(contact, focusFilter)),
    [allPageContacts, focusFilter],
  );

  const focusBoardCards = useMemo<FocusBoardCard[]>(() => {
    const overdueFollowUps = allPageContacts.filter((contact) => isFollowUpDueSoon(contact));
    const bookedFixes = allPageContacts.filter((contact) => needsBookedHandoffFix(contact));
    const queueReadyNow = allPageContacts.filter((contact) => matchesFocusFilter(contact, "queue_ready"));
    const directPathGaps = allPageContacts.filter((contact) => needsDirectPathCapture(contact));

    return [
      {
        id: "follow_up_due",
        label: "Due follow-ups",
        count: overdueFollowUps.length,
        detail: overdueFollowUps.length > 0
          ? "Touch these first so warm leads do not drift past their callback window."
          : "No follow-ups are due in the next 24 hours on this page.",
        accentClassName: "border-amber-500/30 bg-amber-500/5",
        focusFilter: "follow_up",
        leadContact: overdueFollowUps[0] ?? null,
      },
      {
        id: "booked_fixes",
        label: "Booked handoff fixes",
        count: bookedFixes.length,
        detail: bookedFixes.length > 0
          ? "Booked records missing dates need cleanup before reps can trust the handoff."
          : "Booked handoffs on this page already have appointment dates.",
        accentClassName: "border-destructive/30 bg-destructive/5",
        focusFilter: "integrity",
        leadContact: bookedFixes[0] ?? null,
      },
      {
        id: "queue_ready_now",
        label: "Ready to call now",
        count: queueReadyNow.length,
        detail: queueReadyNow.length > 0
          ? "These leads already have a direct path, so reps can work them fastest."
          : "No direct-path cold leads are ready on this page right now.",
        accentClassName: "border-emerald-500/30 bg-emerald-500/5",
        focusFilter: "queue_ready",
        leadContact: queueReadyNow[0] ?? null,
      },
      {
        id: "direct_path_gaps",
        label: "Still need DM phone",
        count: directPathGaps.length,
        detail: directPathGaps.length > 0
          ? "Use these calls to capture a direct mobile or extension before requeueing."
          : "Every active cold lead on this page already has a direct decision-maker phone.",
        accentClassName: "border-sky-500/30 bg-sky-500/5",
        focusFilter: "enrichment",
        leadContact: directPathGaps[0] ?? null,
      },
    ];
  }, [allPageContacts]);

  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / CONTACTS_PER_PAGE));

  const isAdmin = useIsAdmin();
  const updateContact = useUpdateContact();
  const createContact = useCreateContact();
  const createPipelineItem = useCreatePipelineItem();
  const { data: reps = [] } = useSalesReps();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const resetCreateForm = () => {
    setCreateForm({
      business_name: "",
      contact_person: "",
      phone: "",
      email: "",
      industry: "",
      website: "",
      gmb_link: "",
      city: "",
      state: "",
    });
  };

  const saveNewContact = async () => {
    if (!createForm.business_name.trim() || !createForm.phone.trim() || !createForm.industry) {
      toast.error("Business name, phone, and industry are required.");
      return;
    }
    try {
      await createContact.mutateAsync({
        business_name: createForm.business_name.trim(),
        phone: createForm.phone.trim(),
        industry: createForm.industry,
        contact_person: createForm.contact_person.trim() || null,
        email: createForm.email.trim() || null,
        website: createForm.website.trim() || null,
        gmb_link: createForm.gmb_link.trim() || null,
        city: createForm.city.trim() || null,
        state: createForm.state.trim() || null,
      });
      toast.success("Contact created.");
      setShowCreateDialog(false);
      resetCreateForm();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create contact.";
      if (msg.includes("idx_contacts_business_phone") || msg.includes("duplicate key")) {
        toast.error("A contact with this business name and phone already exists.");
      } else {
        toast.error(msg);
      }
    }
  };

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [debouncedSearch, industryFilter, statusFilter, stateFilter, appointmentOutcomeFilter, sortBy]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const openEdit = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditContact(contact);
    setEditForm({
      business_name: contact.business_name,
      contact_person: contact.contact_person,
      phone: contact.phone,
      email: contact.email,
      website: contact.website,
      gmb_link: contact.gmb_link,
      industry: contact.industry,
      city: contact.city,
      state: contact.state,
      status: contact.status,
      phone_type: contact.phone_type,
      phone_number_quality: contact.phone_number_quality,
      best_time_to_call: contact.best_time_to_call,
      best_route_to_decision_maker: contact.best_route_to_decision_maker,
      follow_up_note: contact.follow_up_note,
      dm_name: contact.dm_name,
      dm_role: contact.dm_role,
      dm_phone: contact.dm_phone,
      dm_email: contact.dm_email,
      gatekeeper_name: contact.gatekeeper_name,
      is_dnc: contact.is_dnc,
    });
    setBookingDate("");
    setBookingTime("10:00");
  };

  const saveEdit = async () => {
    if (!editContact || !user) return;

    const statusChanged = editForm.status !== editContact.status;
    const isBooking = statusChanged && editForm.status === "booked";

    if (isBooking && !bookingDate) {
      toast.error("Please select a booking date.");
      return;
    }

    try {
      await updateContact.mutateAsync({ id: editContact.id, ...editForm });

      if (isBooking) {
        const [hours, minutes] = bookingTime.split(":").map(Number);
        const scheduled = new Date(bookingDate);
        scheduled.setHours(hours || 10, minutes || 0, 0, 0);

        await createPipelineItem.mutateAsync({
          contact_id: editContact.id,
          pipeline_type: "booked",
          assigned_user_id: user.id,
          created_by: user.id,
          scheduled_for: scheduled.toISOString(),
          notes: "Created from contact status update",
        });
        toast.success("Contact updated & booked appointment created.");
      } else if (statusChanged && shouldCreatePipelineItemForStatus(editForm.status as ContactLifecycleStatus) && editForm.status === "follow_up") {
        const scheduled = getDefaultManualFollowUpScheduledFor();

        await createPipelineItem.mutateAsync({
          contact_id: editContact.id,
          pipeline_type: editForm.status,
          assigned_user_id: user.id,
          created_by: user.id,
          scheduled_for: scheduled.toISOString(),
          notes: editForm.follow_up_note?.trim() || "Created from contact status update",
        });
        toast.success("Contact updated & follow-up created.");
      } else {
        toast.success("Contact updated.");
      }
      setEditContact(null);
    } catch {
      toast.error("Failed to update contact.");
    }
  };

  const openStatusChange = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    setStatusChangeContact(contact);
    setNewStatus(contact.status);
    setBookingDate("");
    setBookingTime("10:00");
  };

  const confirmStatusChange = async () => {
    if (!statusChangeContact || !user || newStatus === statusChangeContact.status) return;

    const isBooking = newStatus === "booked";
    if (isBooking && !bookingDate) {
      toast.error("Please select a booking date.");
      return;
    }

    try {
      await updateContact.mutateAsync({ id: statusChangeContact.id, status: newStatus });

      if (isBooking) {
        const [hours, minutes] = bookingTime.split(":").map(Number);
        const scheduled = new Date(bookingDate);
        scheduled.setHours(hours || 10, minutes || 0, 0, 0);

        await createPipelineItem.mutateAsync({
          contact_id: statusChangeContact.id,
          pipeline_type: "booked",
          assigned_user_id: user.id,
          created_by: user.id,
          scheduled_for: scheduled.toISOString(),
          notes: "Created from manual status change",
        });
      } else if (shouldCreatePipelineItemForStatus(newStatus as ContactLifecycleStatus) && newStatus === "follow_up") {
        const scheduled = getDefaultManualFollowUpScheduledFor();

        await createPipelineItem.mutateAsync({
          contact_id: statusChangeContact.id,
          pipeline_type: newStatus,
          assigned_user_id: user.id,
          created_by: user.id,
          scheduled_for: scheduled.toISOString(),
          notes: statusChangeContact.follow_up_note || "Created from manual status change",
        });
      }

      toast.success(`Status changed to ${newStatus}.`);
      setStatusChangeContact(null);
    } catch {
      toast.error("Failed to change status.");
    }
  };

  const repairContactDrift = async (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();

    const plan = getAutoRepairPlan(contact);
    if (!plan) {
      toast.message("No one-click repair available for this contact.");
      return;
    }

    try {
      await updateContact.mutateAsync({ id: contact.id, ...plan.updates });
      toast.success(plan.successMessage);
    } catch {
      toast.error("Failed to repair contact drift.");
    }
  };

  const deleteContact = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this contact permanently?")) return;
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete contact.");
    } else {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contacts-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
      toast.success("Contact deleted.");
    }
  };

  const exportCSV = () => {
    const headers = ["Business Name", "Contact Person", "Phone", "Email", "Industry", "City", "State", "Status", "Last Outcome", "Appointment Stage", "Appointment Day"];
    const rows = contacts.map((c) => [
      c.business_name,
      c.contact_person || "",
      c.phone,
      c.email || "",
      c.industry,
      c.city || "",
      c.state || "",
      c.status,
      c.last_outcome || "",
      getContactStage(c),
      c.latest_appointment_scheduled_for ? format(new Date(c.latest_appointment_scheduled_for), "yyyy-MM-dd") : "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-export-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${contacts.length} contacts (current page).`);
  };

  return (
    <AppLayout title="Contacts">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="border-border bg-card pl-9" />
          </div>
          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger className="w-[180px] border-border bg-card"><SelectValue placeholder="Industry" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Industries</SelectItem>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-[220px] border-border bg-card"><SelectValue placeholder="Australian state" /></SelectTrigger>
            <SelectContent>{AUSTRALIAN_STATE_OPTIONS.map((state) => <SelectItem key={state.value} value={state.value}>{state.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px] border-border bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {CONTACT_STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={appointmentOutcomeFilter} onValueChange={setAppointmentOutcomeFilter}>
            <SelectTrigger className="w-[180px] border-border bg-card"><SelectValue placeholder="Appt. Outcome" /></SelectTrigger>
            <SelectContent>
              {APPOINTMENT_OUTCOME_FILTER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as ContactsSortOption)}>
            <SelectTrigger className="w-[210px] border-border bg-card"><SelectValue placeholder="Sort by" /></SelectTrigger>
            <SelectContent>
              {CONTACT_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{contacts.length}/{allPageContacts.length} visible · {totalCount} contacts · page {page} of {totalPages}</span>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => { resetCreateForm(); setShowCreateDialog(true); }} className="border-border">
                <Plus className="mr-1.5 h-3.5 w-3.5" />New Contact
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportCSV} className="border-border">
              <Download className="mr-1.5 h-3.5 w-3.5" />Export
            </Button>
          </div>
        </div>

        {!isLoading && allPageContacts.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-3">
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Queue focus</span>
              {[
                { value: "all", label: "All on page" },
                { value: "follow_up", label: "Follow-ups first" },
                { value: "integrity", label: "Integrity fixes" },
                { value: "drift", label: "Drift risk" },
                { value: "queue_ready", label: "Queue ready" },
                { value: "enrichment", label: "Needs enrichment" },
              ].map((option) => {
                const value = option.value as ContactFocusFilter;
                const isActive = focusFilter === value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={isActive ? "secondary" : "outline"}
                    size="sm"
                    className="h-8"
                    onClick={() => setFocusFilter(value)}
                  >
                    {option.label}
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{focusCounts[value]}</span>
                  </Button>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {focusBoardCards.map((card) => (
                <div key={card.id} className={`rounded-lg border px-4 py-3 ${card.accentClassName}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{card.label}</p>
                      <p className="mt-1 text-2xl font-semibold text-foreground">{card.count}</p>
                    </div>
                    <Button
                      type="button"
                      variant={focusFilter === card.focusFilter ? "secondary" : "outline"}
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setFocusFilter(card.focusFilter);
                        if (card.leadContact) setExpandedId(card.leadContact.id);
                      }}
                    >
                      {card.leadContact ? "Open first" : "View"}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{card.detail}</p>
                  <p className="mt-3 text-xs font-medium text-foreground">
                    {card.leadContact ? `${card.leadContact.business_name} next` : "No lead in this slice"}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {isLoading ? (
          <div className="animate-pulse py-20 text-center text-sm text-muted-foreground">Loading...</div>
        ) : contacts.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">No contacts found.</div>
        ) : (
          <>
            {sortBy === "operational" && (
              <div className="rounded-lg border border-border bg-card/60 px-4 py-3 text-xs text-muted-foreground">
                Operational priority pulls urgent follow-ups and booked contacts to the top, then favors leads with GHL linkage, a direct DM path, and stronger phone intel. Queue focus lets reps narrow the current page to integrity fixes, drift risk, queue-ready leads, or enrichment work without scanning row by row.
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Business</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Contact</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Industry</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Stage</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Integrity</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Next action</th>
                    <th className="w-36 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => {
                    const isExpanded = expandedId === contact.id;
                    const integrityBadges = [getQueueReadinessBadge(contact), ...getContactIntegrityBadges(contact)];
                    const actionCue = getContactActionCue(contact);
                    const autoRepairPlan = getAutoRepairPlan(contact);

                    return (
                      <React.Fragment key={contact.id}>
                        <tr className="cursor-pointer border-b border-border transition-colors hover:bg-muted/30" onClick={() => setExpandedId(isExpanded ? null : contact.id)}>
                          <td className="px-4 py-3">
                            <Link to={`/contacts/${contact.id}`} className="font-medium text-foreground hover:text-primary hover:underline transition-colors" onClick={(e) => e.stopPropagation()}>
                              {contact.business_name}
                            </Link>
                            <p className="font-mono text-xs text-muted-foreground">{contact.phone}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{contact.contact_person || "—"}</td>
                          <td className="px-4 py-3"><span className="rounded bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground">{contact.industry}</span></td>
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => openStatusChange(contact, e)}
                              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors hover:ring-1 hover:ring-border ${STATUS_BADGE_CLASSES[contact.status] || "bg-muted text-muted-foreground"}`}
                              title="Click to change status"
                            >
                              {contact.status}
                              <ArrowRight className="h-3 w-3 opacity-50" />
                            </button>
                          </td>
                          <td className="px-4 py-3"><span className="text-xs text-muted-foreground">{getContactStage(contact)}</span></td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {integrityBadges.slice(0, 2).map((badge) => (
                                <span key={badge.label} className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${badge.className}`} title={badge.title}>
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1" title={actionCue.title}>
                              <span className={`inline-flex rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${actionCue.className}`}>
                                {actionCue.label}
                              </span>
                              <p className="text-xs text-muted-foreground">{actionCue.detail}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {!contact.is_dnc && contact.phone && (
                                <a
                                  href={`tel:${contact.dm_phone || contact.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex h-7 items-center gap-1 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  title={contact.dm_phone ? "Call decision maker" : "Call main line"}
                                >
                                  <Phone className="h-3.5 w-3.5" />
                                  Call
                                </a>
                              )}
                              {autoRepairPlan && (
                                <button
                                  onClick={(e) => repairContactDrift(contact, e)}
                                  className="inline-flex h-7 items-center gap-1 rounded border border-amber-500/30 px-2 text-xs text-amber-700 transition-colors hover:bg-amber-500/10"
                                  title={autoRepairPlan.title}
                                >
                                  Fix
                                </button>
                              )}
                              <button onClick={(e) => openEdit(contact, e)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {isAdmin && (
                                <button onClick={(e) => deleteContact(contact.id, e)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="bg-muted/20 px-4 py-3">
                              <ExpandedContactDetails contact={contact} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((current) => Math.max(1, current - 1));
                    }}
                    className={page === 1 ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive>
                    {page}
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((current) => Math.min(totalPages, current + 1));
                    }}
                    className={page === totalPages ? "pointer-events-none opacity-50" : undefined}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </>
        )}

        {/* Edit Contact Dialog */}
        <Dialog open={!!editContact} onOpenChange={(open) => !open && setEditContact(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Business Name</Label><Input value={editForm.business_name || ""} onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Contact Person</Label><Input value={editForm.contact_person || ""} onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone</Label><Input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="border-border bg-card font-mono" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Email</Label><Input value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Industry</Label><Select value={editForm.industry || ""} onValueChange={(v) => setEditForm({ ...editForm, industry: v })}><SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger><SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Website</Label><Input value={editForm.website || ""} onChange={(e) => setEditForm({ ...editForm, website: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">GMB Link</Label><Input value={editForm.gmb_link || ""} onChange={(e) => setEditForm({ ...editForm, gmb_link: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">City</Label><Input value={editForm.city || ""} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">State</Label><Input value={editForm.state || ""} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone Type</Label><Select value={editForm.phone_type || "unknown"} onValueChange={(v) => setEditForm({ ...editForm, phone_type: v })}><SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger><SelectContent>{PHONE_TYPE_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{PHONE_TYPE_LABELS[opt]}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone Quality</Label><Select value={editForm.phone_number_quality || "unconfirmed"} onValueChange={(v) => setEditForm({ ...editForm, phone_number_quality: v as Contact["phone_number_quality"] })}><SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger><SelectContent>{PHONE_QUALITY_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{PHONE_QUALITY_LABELS[opt]}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Status</Label><Select value={editForm.status || "uncalled"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}><SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger><SelectContent>{CONTACT_STATUS_OPTIONS.filter(o => o.value !== "all").map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex items-center justify-between rounded border border-border bg-muted/20 px-3 py-2"><Label className="text-xs text-muted-foreground">Do Not Call</Label><button type="button" onClick={() => setEditForm({ ...editForm, is_dnc: !editForm.is_dnc })} className={`rounded px-2 py-1 text-xs font-medium ${editForm.is_dnc ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground"}`}>{editForm.is_dnc ? "Enabled" : "Disabled"}</button></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Best Route to Decision Maker</Label><Input value={editForm.best_route_to_decision_maker || ""} onChange={(e) => setEditForm({ ...editForm, best_route_to_decision_maker: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Best Time to Call</Label><Input value={editForm.best_time_to_call || ""} onChange={(e) => setEditForm({ ...editForm, best_time_to_call: e.target.value })} className="border-border bg-card" placeholder="e.g. Weekdays 2-4pm" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Gatekeeper Name</Label><Input value={editForm.gatekeeper_name || ""} onChange={(e) => setEditForm({ ...editForm, gatekeeper_name: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Decision Maker</Label><Input value={editForm.dm_name || ""} onChange={(e) => setEditForm({ ...editForm, dm_name: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">DM Role</Label><Input value={editForm.dm_role || ""} onChange={(e) => setEditForm({ ...editForm, dm_role: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">DM Phone</Label><Input value={editForm.dm_phone || ""} onChange={(e) => setEditForm({ ...editForm, dm_phone: e.target.value })} className="border-border bg-card font-mono" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">DM Email</Label><Input value={editForm.dm_email || ""} onChange={(e) => setEditForm({ ...editForm, dm_email: e.target.value })} className="border-border bg-card" /></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Follow-up Note</Label><Textarea value={editForm.follow_up_note || ""} onChange={(e) => setEditForm({ ...editForm, follow_up_note: e.target.value })} className="min-h-[84px] border-border bg-card" /></div>
              {editForm.status === "booked" && editForm.status !== editContact?.status && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Booking Date *</Label>
                    <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="border-border bg-card" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Booking Time</Label>
                    <Input type="time" value={bookingTime} onChange={(e) => setBookingTime(e.target.value)} className="border-border bg-card" />
                  </div>
                </>
              )}
              <div className="col-span-2"><Button onClick={saveEdit} className="w-full font-semibold">Save Changes</Button></div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quick Status Change Dialog */}
        <Dialog open={!!statusChangeContact} onOpenChange={(open) => !open && setStatusChangeContact(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Change Status</DialogTitle>
            </DialogHeader>
            {statusChangeContact && (
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{statusChangeContact.business_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Current: <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASSES[statusChangeContact.status] || "bg-muted text-muted-foreground"}`}>{statusChangeContact.status}</span>
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">New Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTACT_STATUS_OPTIONS.filter(o => o.value !== "all").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newStatus === "booked" && newStatus !== statusChangeContact.status && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Booking Date *</Label>
                      <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} className="border-border bg-card" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Booking Time</Label>
                      <Input type="time" value={bookingTime} onChange={(e) => setBookingTime(e.target.value)} className="border-border bg-card" />
                    </div>
                  </div>
                )}
                {newStatus === "follow_up" && newStatus !== statusChangeContact.status && (
                  <p className="rounded border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    A follow-up task will be automatically created (scheduled in 2 days).
                  </p>
                )}
                <Button
                  onClick={confirmStatusChange}
                  disabled={newStatus === statusChangeContact.status || updateContact.isPending}
                  className="w-full font-semibold"
                >
                  {updateContact.isPending ? "Saving…" : "Confirm Status Change"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create Contact Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={(open) => !open && setShowCreateDialog(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>New Contact</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Business Name *</Label><Input value={createForm.business_name} onChange={(e) => setCreateForm({ ...createForm, business_name: e.target.value })} className="border-border bg-card" placeholder="Acme Plumbing" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Contact Person</Label><Input value={createForm.contact_person} onChange={(e) => setCreateForm({ ...createForm, contact_person: e.target.value })} className="border-border bg-card" placeholder="John Smith" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone *</Label><Input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} className="border-border bg-card font-mono" placeholder="+61 400 000 000" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Email</Label><Input value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="border-border bg-card" placeholder="john@acme.com" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Industry *</Label><Select value={createForm.industry} onValueChange={(v) => setCreateForm({ ...createForm, industry: v })}><SelectTrigger className="border-border bg-card"><SelectValue placeholder="Select industry" /></SelectTrigger><SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Website</Label><Input value={createForm.website} onChange={(e) => setCreateForm({ ...createForm, website: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">GMB Link</Label><Input value={createForm.gmb_link} onChange={(e) => setCreateForm({ ...createForm, gmb_link: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">City</Label><Input value={createForm.city} onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })} className="border-border bg-card" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">State</Label><Input value={createForm.state} onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })} className="border-border bg-card" /></div>
              <div className="col-span-2"><Button onClick={saveNewContact} disabled={createContact.isPending} className="w-full font-semibold">{createContact.isPending ? "Creating…" : "Create Contact"}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
