import { useState, useCallback, useEffect, useMemo } from "react";
import { addDays, setHours, setMinutes } from "date-fns";
import { Search, CalendarPlus, Phone, User, Building2, MapPin, Loader2, CalendarIcon, ClipboardList, Plus, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { getContactStatusForPipelineType } from "@/lib/pipelineMappings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useCreateContact } from "@/hooks/useContacts";
import { useCreateCallLog } from "@/hooks/useCallLogs";
import { useSalesReps, useCreatePipelineItem, type FollowUpMethod } from "@/hooks/usePipelineItems";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import { useGHLSync } from "@/hooks/useGHLSync";
import { useGHLContactLink } from "@/hooks/useGHLContactLink";
import {
  findDefaultBookedPipeline,
  findDefaultBookedStage,
  findDefaultFollowUpPipeline,
  findDefaultFollowUpStage,
  useGHLCalendars,
  useGHLPipelines,
} from "@/hooks/useGHLConfig";
import { INDUSTRIES } from "@/data/mockData";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import type { Tables } from "@/integrations/supabase/types";

type Contact = Tables<"contacts">;
type PipelineType = "booked" | "follow_up";

interface QuickBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getRepLabel(name: string | null, email: string | null) {
  return name || email?.split("@")[0] || "Unknown";
}

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function rankSearchResult(contact: Contact, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return 0;

  const businessName = normalizeSearchValue(contact.business_name);
  const contactPerson = normalizeSearchValue(contact.contact_person);
  const phone = normalizeSearchValue(contact.phone);

  if (phone === normalizedQuery) return 400;
  if (businessName === normalizedQuery) return 320;
  if (contactPerson === normalizedQuery) return 280;
  if (businessName.startsWith(normalizedQuery)) return 220;
  if (contactPerson.startsWith(normalizedQuery)) return 180;
  if (phone.includes(normalizedQuery)) return 140;
  if (businessName.includes(normalizedQuery)) return 120;
  if (contactPerson.includes(normalizedQuery)) return 100;

  return 0;
}

function buildFollowUpContext(contact: Contact | null) {
  if (!contact) return "";

  const contextLines = [
    contact.follow_up_note?.trim() ? `Previous note: ${contact.follow_up_note.trim()}` : null,
    contact.best_time_to_call?.trim() ? `Best callback window: ${contact.best_time_to_call.trim()}` : null,
    contact.best_route_to_decision_maker?.trim()
      ? `Best route: ${contact.best_route_to_decision_maker.trim()}`
      : null,
    contact.dm_name?.trim() || contact.dm_phone?.trim()
      ? `Decision maker: ${[contact.dm_name?.trim(), contact.dm_phone?.trim()].filter(Boolean).join(" · ")}`
      : null,
    contact.gatekeeper_name?.trim()
      ? `Gatekeeper: ${contact.gatekeeper_name.trim()}`
      : null,
  ].filter(Boolean) as string[];

  if (contextLines.length === 0) return "";

  return ["Next step:", "Reason for follow-up:", ...contextLines].join("\n");
}

function getQuickCreateDefaultSchedule(type: PipelineType) {
  const now = new Date();
  const next = addDays(now, 1);
  const defaultHour = type === "booked" ? 9 : 11;
  return setMinutes(setHours(next, defaultHour), 0);
}

export function QuickBookDialog({ open, onOpenChange }: QuickBookDialogProps) {
  const { user } = useAuth();
  const { data: salesReps = [] } = useSalesReps();
  const createPipelineItem = useCreatePipelineItem();
  const createCallLog = useCreateCallLog();
  const ghlSync = useGHLSync();
  const ghlLink = useGHLContactLink();
  const { data: ghlCalendars = [] } = useGHLCalendars();
  const { data: ghlPipelines = [] } = useGHLPipelines();

  const isAdmin = useIsAdmin();
  const createContactMutation = useCreateContact();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newContact, setNewContact] = useState({
    business_name: "",
    contact_person: "",
    phone: "",
    email: "",
    industry: "",
    city: "",
    state: "",
  });

  const [pipelineType, setPipelineType] = useState<PipelineType>("booked");
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>("call");
  const [assignedRepId, setAssignedRepId] = useState("");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>();
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [notes, setNotes] = useState("");

  const [ghlCalendarId, setGhlCalendarId] = useState("");
  const [ghlPipelineId, setGhlPipelineId] = useState("");
  const [ghlStageId, setGhlStageId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const ghlSelectedPipelineStages = useMemo(
    () => ghlPipelines.find((p) => p.id === ghlPipelineId)?.stages ?? [],
    [ghlPipelines, ghlPipelineId],
  );

  const defaultBookedPipeline = useMemo(
    () => findDefaultBookedPipeline(ghlPipelines),
    [ghlPipelines],
  );

  const defaultBookedStage = useMemo(
    () => findDefaultBookedStage(defaultBookedPipeline),
    [defaultBookedPipeline],
  );

  const defaultFollowUpPipeline = useMemo(
    () => findDefaultFollowUpPipeline(ghlPipelines),
    [ghlPipelines],
  );

  const defaultFollowUpStage = useMemo(
    () => findDefaultFollowUpStage(defaultFollowUpPipeline),
    [defaultFollowUpPipeline],
  );

  // Set default rep to current user
  useEffect(() => {
    if (user && !assignedRepId) {
      setAssignedRepId(user.id);
    }
  }, [user, assignedRepId]);

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

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedContact(null);
      setShowCreateForm(false);
      setNewContact({ business_name: "", contact_person: "", phone: "", email: "", industry: "", city: "", state: "" });
      setPipelineType("booked");
      setFollowUpMethod("call");
      setScheduledDate(undefined);
      setScheduledTime("09:00");
      setNotes("");
      setAssignedRepId(user?.id || "");
      setGhlCalendarId("");
      setGhlPipelineId("");
      setGhlStageId("");
    }
  }, [open, user?.id]);

  // Search contacts
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from("contacts")
          .select("*")
          .or(`business_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%,contact_person.ilike.%${trimmed}%`)
          .order("business_name")
          .limit(20);

        if (!controller.signal.aborted) {
          if (error) throw error;
          const rankedResults = [...(data || [])].sort((left, right) => {
            const scoreDifference = rankSearchResult(right, trimmed) - rankSearchResult(left, trimmed);
            if (scoreDifference !== 0) return scoreDifference;
            return left.business_name.localeCompare(right.business_name);
          });
          setResults(rankedResults);
        }
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, open]);

  const handleCreateContact = useCallback(async () => {
    if (!newContact.business_name.trim() || !newContact.phone.trim() || !newContact.industry) {
      toast.error("Business name, phone, and industry are required.");
      return;
    }
    try {
      const created = await createContactMutation.mutateAsync({
        business_name: newContact.business_name.trim(),
        phone: newContact.phone.trim(),
        industry: newContact.industry,
        contact_person: newContact.contact_person.trim() || null,
        email: newContact.email.trim() || null,
        city: newContact.city.trim() || null,
        state: newContact.state.trim() || null,
      });
      toast.success("Contact created.");
      setSelectedContact(created as Contact);
      setShowCreateForm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create contact.";
      if (msg.includes("idx_contacts_business_phone") || msg.includes("duplicate key")) {
        toast.error("A contact with this business name and phone already exists.");
      } else {
        toast.error(msg);
      }
    }
  }, [newContact, createContactMutation]);


  const scheduledForPreview = useMemo(() => {
    if (!scheduledDate) return null;

    return new Date(
      scheduledDate.getFullYear(),
      scheduledDate.getMonth(),
      scheduledDate.getDate(),
      ...scheduledTime.split(":").map(Number) as [number, number],
    );
  }, [scheduledDate, scheduledTime]);

  const selectedRepLabel = useMemo(
    () => salesReps.find((rep) => rep.user_id === assignedRepId)
      ? getRepLabel(
          salesReps.find((rep) => rep.user_id === assignedRepId)?.display_name ?? null,
          salesReps.find((rep) => rep.user_id === assignedRepId)?.email ?? null,
        )
      : null,
    [salesReps, assignedRepId],
  );

  const topSearchResult = useMemo(() => results[0] ?? null, [results]);

  const contactLinkStatus = useMemo(() => {
    if (!selectedContact) return null;
    if ((selectedContact as Record<string, unknown>).ghl_contact_id) {
      return { tone: "success", label: "Linked to GHL", detail: "Existing GHL contact link is already saved." };
    }
    if (!selectedContact.phone?.trim()) {
      return { tone: "danger", label: "Cannot link to GHL", detail: "This contact has no phone number, so GHL sync will be skipped." };
    }
    return { tone: "warning", label: "Will link on save", detail: "The app will try to create or match the GHL contact when you submit." };
  }, [selectedContact]);

  const existingScheduleWarning = useMemo(() => {
    if (!selectedContact) return null;

    const bookedAt = selectedContact.meeting_booked_date ? new Date(selectedContact.meeting_booked_date) : null;
    const followUpAt = selectedContact.next_followup_date ? new Date(selectedContact.next_followup_date) : null;
    const now = Date.now();

    if (pipelineType === "booked" && followUpAt && !Number.isNaN(followUpAt.getTime()) && followUpAt.getTime() >= now) {
      return {
        title: "This contact already has a follow-up scheduled",
        detail: `Saving this booking will replace the current follow-up timing of ${format(followUpAt, "PPP p")} on the contact record.`,
      };
    }

    if (pipelineType === "follow_up" && bookedAt && !Number.isNaN(bookedAt.getTime()) && bookedAt.getTime() >= now) {
      return {
        title: "This contact is already marked as booked",
        detail: `Saving this follow-up will clear the booked date of ${format(bookedAt, "PPP p")} on the contact record.`,
      };
    }

    return null;
  }, [selectedContact, pipelineType]);

  useEffect(() => {
    if (pipelineType !== "follow_up" || !selectedContact || notes.trim()) return;

    const draft = buildFollowUpContext(selectedContact);
    if (draft) {
      setNotes(draft);
    }
  }, [pipelineType, selectedContact, notes]);

  useEffect(() => {
    if (!open || !selectedContact || scheduledDate) return;

    const defaultSchedule = getQuickCreateDefaultSchedule(pipelineType);
    setScheduledDate(defaultSchedule);
    setScheduledTime(format(defaultSchedule, "HH:mm"));
  }, [open, selectedContact, scheduledDate, pipelineType]);

  const syncReadiness = useMemo(() => {
    if (!selectedContact) return [] as { label: string; status: string; detail: string }[];

    const localStatusTarget = getContactStatusForPipelineType(pipelineType);
    const items = [
      {
        label: "Local record",
        status: "ready",
        detail: `Will create a ${pipelineType === "booked" ? "booking" : "follow-up"} item and set contact status to ${localStatusTarget}.`,
      },
      {
        label: "GHL contact",
        status: contactLinkStatus?.tone === "danger" ? "warning" : "ready",
        detail: contactLinkStatus?.detail ?? "Contact link status unknown.",
      },
    ];

    if (pipelineType === "booked") {
      items.push({
        label: "GHL booking sync",
        status: ghlCalendarId && ghlPipelineId && ghlStageId ? "ready" : "warning",
        detail: ghlCalendarId && ghlPipelineId && ghlStageId
          ? "Calendar, pipeline, and stage are selected, so the booking can be mirrored to GHL."
          : "Pick a GHL calendar, pipeline, and stage before creating the booking.",
      });
    } else {
      items.push({
        label: "GHL follow-up sync",
        status: defaultFollowUpPipeline?.id && defaultFollowUpStage?.id ? "ready" : "warning",
        detail: defaultFollowUpPipeline?.id && defaultFollowUpStage?.id
          ? `Will create a ${followUpMethod} follow-up task and mirror it into the default follow-up pipeline.`
          : "Follow-up pipeline defaults are not fully configured, so GHL opportunity mirroring may be incomplete.",
      });
    }

    return items;
  }, [selectedContact, pipelineType, contactLinkStatus, ghlCalendarId, ghlPipelineId, ghlStageId, defaultFollowUpPipeline?.id, defaultFollowUpStage?.id, followUpMethod]);

  const isBooked = pipelineType === "booked";

  const canSubmit = useMemo(
    () => !!selectedContact
      && !!assignedRepId
      && !!scheduledDate
      && (pipelineType !== "booked" || (!!ghlCalendarId && !!ghlPipelineId && !!ghlStageId)),
    [selectedContact, assignedRepId, scheduledDate, pipelineType, ghlCalendarId, ghlPipelineId, ghlStageId],
  );

  const quickScheduleOptions = useMemo(() => {
    const tomorrow = addDays(new Date(), 1);
    return [
      { label: "Tomorrow 9:00", date: setMinutes(setHours(tomorrow, 9), 0) },
      { label: "Tomorrow 11:00", date: setMinutes(setHours(tomorrow, 11), 0) },
      { label: "Tomorrow 2:00", date: setMinutes(setHours(tomorrow, 14), 0) },
      { label: "Next day 9:00", date: setMinutes(setHours(addDays(new Date(), 2), 9), 0) },
    ];
  }, []);

  const submitReadinessMessage = useMemo(() => {
    if (!selectedContact) return "Pick a contact to continue.";
    if (!assignedRepId) return "Assign a sales rep before saving.";
    if (!scheduledDate) return isBooked ? "Confirm the appointment date before saving." : "Pick a follow-up date before saving.";
    if (isBooked && (!ghlCalendarId || !ghlPipelineId || !ghlStageId)) return "Choose the GHL calendar, pipeline, and stage before creating the booking.";
    return null;
  }, [selectedContact, assignedRepId, scheduledDate, isBooked, ghlCalendarId, ghlPipelineId, ghlStageId]);

  const handleSubmit = useCallback(async () => {
    if (!selectedContact || !assignedRepId || !scheduledDate || !user || isSubmitting || !canSubmit) return;

    const scheduledFor = new Date(
      scheduledDate.getFullYear(),
      scheduledDate.getMonth(),
      scheduledDate.getDate(),
      ...scheduledTime.split(":").map(Number) as [number, number],
    );

    setIsSubmitting(true);

    try {
      const createdPipelineItem = await createPipelineItem.mutateAsync({
        contact_id: selectedContact.id,
        pipeline_type: pipelineType,
        assigned_user_id: assignedRepId,
        created_by: user.id,
        scheduled_for: scheduledFor.toISOString(),
        notes: notes.trim() || "",
        follow_up_method: pipelineType === "follow_up" ? followUpMethod : undefined,
      });

      // Create a corresponding call_log so the booking/follow-up shows in dashboard outcomes
      const callOutcome = pipelineType === "booked" ? "booked" : "follow_up";
      await createCallLog.mutateAsync({
        contact_id: selectedContact.id,
        user_id: user.id,
        outcome: callOutcome,
        notes: notes.trim() || `Quick ${pipelineType === "booked" ? "Book" : "Follow-up"}: ${selectedContact.business_name}`,
        follow_up_date: pipelineType === "follow_up" ? scheduledFor.toISOString() : null,
      });

      const newStatus = getContactStatusForPipelineType(pipelineType);
      const lifecycleFieldUpdates = pipelineType === "booked"
        ? {
            meeting_booked_date: scheduledFor.toISOString(),
            next_followup_date: null,
            follow_up_note: null,
          }
        : {
            meeting_booked_date: null,
            next_followup_date: scheduledFor.toISOString(),
            follow_up_note: notes.trim() || null,
          };

      const { error: contactMirrorError } = await supabase
        .from("contacts")
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...lifecycleFieldUpdates,
        })
        .eq("id", selectedContact.id);

      if (contactMirrorError) {
        throw contactMirrorError;
      }

      const label = pipelineType === "booked" ? "Booking" : "Follow-up";
      let ghlSyncConfirmed = false;

      // Try to confirm GHL sync before showing success.
      const contactGhlId =
        (selectedContact as Record<string, unknown>).ghl_contact_id as string | null
        ?? await ghlLink.ensureGHLLink(selectedContact as any).catch(() => null);

      if (contactGhlId) {
        const repName = salesReps.find((r) => r.user_id === assignedRepId)?.display_name ?? undefined;

        // Update opportunity stage in Outbound Prospecting pipeline
        ghlSync.updateOpportunityStage({
          ghlContactId: contactGhlId,
          outcome: pipelineType === "booked" ? "booked" : "follow_up",
          contactName: selectedContact.business_name,
        }).catch(() => {});

        if (pipelineType === "booked" && ghlCalendarId) {
          ghlSyncConfirmed = await ghlSync.pushBooking({
            ghlContactId: contactGhlId,
            contactId: selectedContact.id,
            calendarId: ghlCalendarId,
            scheduledFor: scheduledFor.toISOString(),
            contactName: selectedContact.business_name,
            repName,
            notes: notes.trim() || undefined,
            pipelineItemId: createdPipelineItem.id,
            pipelineId: ghlPipelineId || undefined,
            pipelineStageId: ghlStageId || undefined,
          });
        }
        if (pipelineType === "follow_up") {
          ghlSyncConfirmed = await ghlSync.pushFollowUp({
            ghlContactId: contactGhlId,
            contactId: selectedContact.id,
            scheduledFor: scheduledFor.toISOString(),
            method: followUpMethod,
            contactName: selectedContact?.business_name ?? undefined,
            repName,
            pipelineItemId: createdPipelineItem.id,
            pipelineId: defaultFollowUpPipeline?.id,
            pipelineStageId: defaultFollowUpStage?.id,
          });

          // Generate and push a draft email to GHL for all follow-ups
          if (selectedContact) {
            ghlSync.pushFollowUpEmailDraft({
              ghlContactId: contactGhlId,
              contactName: selectedContact.business_name ?? "there",
              businessName: selectedContact.business_name ?? "",
              industry: (selectedContact as any)?.industry ?? undefined,
              repName: repName ?? "The Odin Team",
              callNotes: notes.trim() || undefined,
            }).catch(() => {});
          }
        }
      }

      if (ghlSyncConfirmed) {
        toast.success(`${label} created for ${selectedContact.business_name}`);
      } else if (contactGhlId) {
        toast.warning(`${label} saved locally, but GHL sync is not confirmed yet.`);
      } else {
        toast.warning(`${label} saved locally, but this contact is not linked to GHL yet.`);
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create item");
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedContact, assignedRepId, scheduledDate, scheduledTime, notes, user, pipelineType, createPipelineItem, createCallLog, onOpenChange, ghlSync, ghlLink, ghlCalendarId, ghlPipelineId, ghlStageId, salesReps, followUpMethod, defaultFollowUpPipeline?.id, defaultFollowUpStage?.id, isSubmitting]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
      if (!canSubmit || createPipelineItem.isPending || isSubmitting) return;

      event.preventDefault();
      void handleSubmit();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, canSubmit, createPipelineItem.isPending, isSubmitting, handleSubmit]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Quick Create
          </DialogTitle>
          <DialogDescription>Search for a contact and create a booking or follow-up.</DialogDescription>
        </DialogHeader>

        {!selectedContact && !showCreateForm ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by business name, phone, or contact person..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !topSearchResult) return;
                    e.preventDefault();
                    setSelectedContact(topSearchResult);
                  }}
                  className="pl-10"
                  autoFocus
                />
              </div>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => setShowCreateForm(true)} className="shrink-0">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />New
                </Button>
              )}
            </div>

            <ScrollArea className="max-h-[400px]">
              {isSearching && (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </div>
              )}

              {!isSearching && query.length >= 2 && results.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <p>No contacts found for &ldquo;{query}&rdquo;</p>
                  {isAdmin && (
                    <Button variant="link" size="sm" className="mt-2" onClick={() => {
                      setNewContact((prev) => ({ ...prev, business_name: query }));
                      setShowCreateForm(true);
                    }}>
                      <Plus className="mr-1 h-3.5 w-3.5" />Create &ldquo;{query}&rdquo; as a new contact
                    </Button>
                  )}
                </div>
              )}

              {!isSearching && query.length < 2 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Type at least 2 characters to search
                </div>
              )}

              {!isSearching && query.length >= 2 && topSearchResult && (
                <p className="pb-2 text-xs text-muted-foreground">
                  Press Enter to open the top match, or click a contact below.
                </p>
              )}

              <div className="space-y-1">
                {results.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => setSelectedContact(contact)}
                    className="w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0 text-primary" />
                          <span className="font-semibold text-sm truncate">{contact.business_name}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {contact.phone}
                          </span>
                          {contact.contact_person && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {contact.contact_person}
                            </span>
                          )}
                          {(contact.city || contact.state) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {[contact.city, contact.state].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase tracking-widest font-mono bg-accent text-accent-foreground px-2 py-0.5 rounded">
                        {contact.status}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : !selectedContact && showCreateForm ? (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-4 pr-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Create New Contact</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>Back to Search</Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5"><Label className="text-xs text-muted-foreground">Business Name *</Label><Input value={newContact.business_name} onChange={(e) => setNewContact({ ...newContact, business_name: e.target.value })} className="border-border bg-card" placeholder="Acme Plumbing" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Contact Person</Label><Input value={newContact.contact_person} onChange={(e) => setNewContact({ ...newContact, contact_person: e.target.value })} className="border-border bg-card" placeholder="John Smith" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone *</Label><Input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} className="border-border bg-card font-mono" placeholder="+61 400 000 000" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Email</Label><Input value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} className="border-border bg-card" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Industry *</Label><Select value={newContact.industry} onValueChange={(v) => setNewContact({ ...newContact, industry: v })}><SelectTrigger className="border-border bg-card"><SelectValue placeholder="Select industry" /></SelectTrigger><SelectContent>{INDUSTRIES.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">City</Label><Input value={newContact.city} onChange={(e) => setNewContact({ ...newContact, city: e.target.value })} className="border-border bg-card" /></div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">State</Label><Input value={newContact.state} onChange={(e) => setNewContact({ ...newContact, state: e.target.value })} className="border-border bg-card" /></div>
              </div>
              <Button onClick={handleCreateContact} disabled={createContactMutation.isPending} className="w-full font-semibold">
                {createContactMutation.isPending ? "Creating…" : "Create Contact & Continue"}
              </Button>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="space-y-4 pb-1">
              {/* Selected contact summary */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div>
                      <h3 className="font-semibold text-foreground">{selectedContact.business_name}</h3>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {selectedContact.phone}
                        </span>
                        {selectedContact.contact_person && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {selectedContact.contact_person}
                          </span>
                        )}
                      </div>
                    </div>
                    {contactLinkStatus && (
                      <div className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium",
                        contactLinkStatus.tone === "success" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                        contactLinkStatus.tone === "warning" && "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                        contactLinkStatus.tone === "danger" && "bg-destructive/10 text-destructive",
                      )}>
                        {contactLinkStatus.label}
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedContact(null)}>
                    Change
                  </Button>
                </div>
              </div>

              {/* Type toggle */}
              <Tabs value={pipelineType} onValueChange={(v) => setPipelineType(v as PipelineType)}>
                <TabsList className="w-full">
                  <TabsTrigger value="booked" className="flex-1 gap-1.5">
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Book Appointment
                  </TabsTrigger>
                  <TabsTrigger value="follow_up" className="flex-1 gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Follow-up
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Follow-up method selector — only for follow-up type */}
              {pipelineType === "follow_up" && (
                <div>
                  <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                    Follow-up Type
                  </label>
                  <FollowUpMethodSelector value={followUpMethod} onChange={setFollowUpMethod} allowedMethods={["call", "email"]} />
                </div>
              )}

              {/* Assigned rep */}
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
              </div>


              {/* GHL Calendar + Pipeline selectors — only for booked type */}
              {isBooked && (
                <div className="space-y-3">
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
                      No stages were found for the selected GHL pipeline. Pick a different pipeline before creating a booking.
                    </p>
                  )}
                </div>
              )}

              {/* Date / time */}
              <div>
                <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  {isBooked ? "Confirm Booked Date" : "Follow-up Date"}
                </label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {quickScheduleOptions.map((option) => {
                      const isActive = scheduledForPreview && scheduledForPreview.getTime() === option.date.getTime();
                      return (
                        <Button
                          key={option.label}
                          type="button"
                          variant={isActive ? "secondary" : "outline"}
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            setScheduledDate(option.date);
                            setScheduledTime(format(option.date, "HH:mm"));
                          }}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start border-border bg-background text-left font-normal",
                          !scheduledDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {scheduledDate
                          ? format(scheduledDate, "PPP")
                          : isBooked
                            ? "Confirm appointment date"
                            : "Pick follow-up date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduledDate}
                        onSelect={setScheduledDate}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        className="pointer-events-auto p-3"
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="border-border bg-background"
                  />

                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  Notes (optional)
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isBooked ? "Any booking notes..." : "Follow-up details..."}
                  className="min-h-[60px] resize-none border-border bg-background text-sm"
                />
              </div>

              {existingScheduleWarning && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
                    <div>
                      <p className="font-medium text-amber-900 dark:text-amber-100">{existingScheduleWarning.title}</p>
                      <p className="text-xs text-amber-800/90 dark:text-amber-200/90">{existingScheduleWarning.detail}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Execution preview</p>
                  <p className="text-sm font-medium text-foreground">
                    {isBooked ? "Booking" : "Follow-up"}
                    {scheduledForPreview ? ` for ${format(scheduledForPreview, "PPP p")}` : " timing pending"}
                    {selectedRepLabel ? `, assigned to ${selectedRepLabel}` : ""}
                  </p>
                </div>
                <div className="space-y-2">
                  {syncReadiness.map((item) => (
                    <div key={item.label} className="flex items-start gap-2 text-sm">
                      <span className={cn(
                        "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                        item.status === "ready" ? "bg-emerald-500" : "bg-amber-500",
                      )} />
                      <div>
                        <p className="font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit */}
              {submitReadinessMessage && (
                <p className="text-xs text-muted-foreground">{submitReadinessMessage}</p>
              )}

              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || createPipelineItem.isPending || isSubmitting}
                className="w-full py-3 font-semibold"
              >
                {createPipelineItem.isPending || isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isBooked ? (
                  <CalendarPlus className="mr-2 h-4 w-4" />
                ) : (
                  <ClipboardList className="mr-2 h-4 w-4" />
                )}
                {isBooked ? "Create Booking" : "Create Follow-up"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Tip: press {navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}+Enter to save.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
