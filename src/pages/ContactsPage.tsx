import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Phone, Mail, Globe, MapPin, ChevronDown, ChevronUp, Pencil, Trash2, Download, CalendarClock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useContacts, useUpdateContact } from "@/hooks/useContacts";
import { useCreatePipelineItem } from "@/hooks/usePipelineItems";
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
import { getAppointmentOutcomeLabel } from "@/lib/appointments";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Contact } from "@/hooks/useContacts";

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

const AUSTRALIAN_STATE_ALIASES: Record<string, string[]> = {
  NSW: ["nsw", "new south wales"],
  VIC: ["vic", "victoria"],
  QLD: ["qld", "queensland"],
  WA: ["wa", "western australia"],
  SA: ["sa", "south australia"],
  TAS: ["tas", "tasmania"],
  ACT: ["act", "australian capital territory"],
  NT: ["nt", "northern territory"],
};

const NOTE_SOURCE_LABELS = {
  manual: "Manual note",
  dialpad_summary: "Dialpad summary",
  dialpad_transcript: "Dialpad transcript",
} as const;

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
            <CalendarClock className="h-3 w-3" /> Appointment Status
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
                  {log.notes && <p className="text-xs italic text-muted-foreground">“{log.notes}”</p>}
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
  const [industryFilter, setIndustryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<Partial<Contact>>({});
  const [page, setPage] = useState(1);

  const { data: contacts = [], isLoading } = useContacts(industryFilter);
  const isAdmin = useIsAdmin();
  const updateContact = useUpdateContact();
  const queryClient = useQueryClient();

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const normalizedState = c.state?.trim().toLowerCase() ?? "";
      const normalizedSearch = search.toLowerCase();
      const matchesSearch =
        !search ||
        c.business_name.toLowerCase().includes(normalizedSearch) ||
        c.contact_person?.toLowerCase().includes(normalizedSearch) ||
        c.phone.includes(search) ||
        c.email?.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      const matchesState = stateFilter === "all" || AUSTRALIAN_STATE_ALIASES[stateFilter]?.includes(normalizedState);
      return matchesSearch && matchesStatus && matchesState;
    });
  }, [contacts, search, statusFilter, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / CONTACTS_PER_PAGE));
  const paginatedContacts = useMemo(() => {
    const start = (page - 1) * CONTACTS_PER_PAGE;
    return filtered.slice(start, start + CONTACTS_PER_PAGE);
  }, [filtered, page]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [search, industryFilter, statusFilter, stateFilter]);

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
  };

  const saveEdit = async () => {
    if (!editContact) return;
    try {
      await updateContact.mutateAsync({ id: editContact.id, ...editForm });
      toast.success("Contact updated.");
      setEditContact(null);
    } catch {
      toast.error("Failed to update contact.");
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
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
      toast.success("Contact deleted.");
    }
  };

  const exportCSV = () => {
    const headers = ["Business Name", "Contact Person", "Phone", "Email", "Industry", "City", "State", "Status", "Last Outcome", "Appointment Stage", "Appointment Day"];
    const rows = filtered.map((c) => [
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
    toast.success(`Exported ${filtered.length} contacts.`);
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
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="uncalled">Uncalled</SelectItem>
              <SelectItem value="called">Called</SelectItem>
              <SelectItem value="follow_up">Follow Up</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="not_interested">Not Interested</SelectItem>
              <SelectItem value="dnc">Do Not Call</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{filtered.length} contacts · page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={exportCSV} className="border-border">
              <Download className="mr-1.5 h-3.5 w-3.5" />Export
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="animate-pulse py-20 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
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
                    <th className="w-24 px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedContacts.map((contact) => {
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
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${contact.status === "called" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                              {contact.status}
                            </span>
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
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Status</Label><Select value={editForm.status || "uncalled"} onValueChange={(v) => setEditForm({ ...editForm, status: v })}><SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="uncalled">Uncalled</SelectItem><SelectItem value="called">Called</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem><SelectItem value="booked">Booked</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="dnc">Do Not Call</SelectItem></SelectContent></Select></div>
              <div className="col-span-2"><Button onClick={saveEdit} className="w-full font-semibold">Save Changes</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
