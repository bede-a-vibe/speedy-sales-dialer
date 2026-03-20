import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Phone, Mail, Globe, MapPin, ChevronDown, ChevronUp, Pencil, Trash2, Download, CalendarClock, ArrowRight, Clock3 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useUpdateContact, usePaginatedContacts } from "@/hooks/useContacts";
import { useCreatePipelineItem, useContactPipelineItems, useSalesReps } from "@/hooks/usePipelineItems";
import { useAuth } from "@/hooks/useAuth";
import { useContactCallLogs } from "@/hooks/useCallLogs";
import { usePaginatedContactNotes } from "@/hooks/useContactNotes";
import { useIsAdmin } from "@/hooks/useUserRole";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { INDUSTRIES, OUTCOME_CONFIG, CallOutcome } from "@/data/mockData";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
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

const STATUS_BADGE_CLASSES: Record<string, string> = {
  uncalled: "bg-muted text-muted-foreground",
  called: "bg-primary/10 text-primary",
  follow_up: "bg-amber-500/10 text-amber-600",
  booked: "bg-blue-500/10 text-blue-600",
  closed: "bg-emerald-500/10 text-emerald-600",
  not_interested: "bg-muted text-muted-foreground",
  dnc: "bg-destructive/10 text-destructive",
};

function getContactStage(contact: Contact) {
  if (contact.latest_appointment_outcome) return getAppointmentOutcomeLabel(contact.latest_appointment_outcome);
  if (contact.latest_appointment_scheduled_for) return "Booked appointment";
  if (contact.last_outcome) return OUTCOME_CONFIG[contact.last_outcome as CallOutcome]?.label || contact.last_outcome;
  return "—";
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

        return (
          <div key={item.id} className="space-y-1.5 rounded border border-border bg-card px-3 py-3">
            <div className="flex items-center gap-3 text-xs">
              <div className={`h-2 w-2 rounded-full ${statusColor}`} />
              <span className="font-medium text-foreground">
                {isBooked ? "Booked Appointment" : "Follow-up"}
              </span>
              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-secondary-foreground">
                {item.status}
              </span>
              {item.appointment_outcome && (
                <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-primary">
                  {getAppointmentOutcomeLabel(item.appointment_outcome)}
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-muted-foreground">
                {format(new Date(item.created_at), "MMM d, h:mm a")}
              </span>
            </div>
            {item.scheduled_for && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                Scheduled: <span className="font-mono">{format(new Date(item.scheduled_for), "MMM d, yyyy h:mm a")}</span>
              </p>
            )}
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<Partial<Contact>>({});
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("10:00");
  const [page, setPage] = useState(1);
  const [statusChangeContact, setStatusChangeContact] = useState<Contact | null>(null);
  const [newStatus, setNewStatus] = useState("");

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
  });

  const contacts = data?.contacts ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / CONTACTS_PER_PAGE));

  const isAdmin = useIsAdmin();
  const updateContact = useUpdateContact();
  const createPipelineItem = useCreatePipelineItem();
  const { data: reps = [] } = useSalesReps();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [debouncedSearch, industryFilter, statusFilter, stateFilter, appointmentOutcomeFilter]);

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
      }

      if (newStatus === "follow_up") {
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + 2);

        await createPipelineItem.mutateAsync({
          contact_id: statusChangeContact.id,
          pipeline_type: "follow_up",
          assigned_user_id: user.id,
          created_by: user.id,
          scheduled_for: followUpDate.toISOString(),
          notes: "Created from manual status change",
        });
      }

      toast.success(`Status changed to ${newStatus}.`);
      setStatusChangeContact(null);
    } catch {
      toast.error("Failed to change status.");
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{totalCount} contacts · page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={exportCSV} className="border-border">
              <Download className="mr-1.5 h-3.5 w-3.5" />Export
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse py-20 text-center text-sm text-muted-foreground">Loading...</div>
        ) : contacts.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">No contacts found.</div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Business</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Contact</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Industry</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Status</th>
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Stage</th>
                    <th className="w-28 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => {
                    const isExpanded = expandedId === contact.id;

                    return (
                      <React.Fragment key={contact.id}>
                        <tr className="cursor-pointer border-b border-border transition-colors hover:bg-muted/30" onClick={() => setExpandedId(isExpanded ? null : contact.id)}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{contact.business_name}</p>
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
                            <div className="flex items-center gap-1">
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
                            <td colSpan={6} className="bg-muted/20 px-4 py-3">
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
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Status</Label><Select value={editForm.status || "uncalled"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}><SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger><SelectContent>{CONTACT_STATUS_OPTIONS.filter(o => o.value !== "all").map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select></div>
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
      </div>
    </AppLayout>
  );
}
