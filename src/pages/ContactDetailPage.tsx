import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, Phone, Mail, Globe, MapPin, ExternalLink, Shield, ShieldOff,
  Calendar, Send, Loader2, Building2, StickyNote, PhoneCall,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useContactCallLogs } from "@/hooks/useCallLogs";
import { usePaginatedContactNotes } from "@/hooks/useContactNotes";
import { useContactPipelineItems, useCreatePipelineItem } from "@/hooks/usePipelineItems";
import { useUpdateContact } from "@/hooks/useContacts";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { getDefaultManualFollowUpScheduledFor, shouldCreatePipelineItemForStatus } from "@/lib/pipelineMappings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Contact = Tables<"contacts">;

const CONTACT_STATUS_OPTIONS = [
  { value: "uncalled", label: "Uncalled" },
  { value: "called", label: "Called" },
  { value: "follow_up", label: "Follow Up" },
  { value: "booked", label: "Booked" },
  { value: "closed", label: "Closed" },
  { value: "not_interested", label: "Not Interested" },
  { value: "dnc", label: "Do Not Call" },
] as const;

function formatTimestamp(value?: string | null, pattern = "dd MMM yy · HH:mm") {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return format(parsed, pattern);
}

function normaliseExternalUrl(value?: string | null) {
  if (!value) return null;
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function useContact(id?: string) {
  return useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      if (!id) throw new Error("No contact ID");
      const { data, error } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Contact;
    },
    enabled: !!id,
  });
}

function ContactDetailSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const updateContact = useUpdateContact();
  const createPipelineItem = useCreatePipelineItem();

  const { data: contact, isLoading, error } = useContact(id);
  const { data: callLogPages, fetchNextPage: fetchMoreLogs, hasNextPage: hasMoreLogs } = useContactCallLogs(id, 5, !!contact);
  const { data: notePages, fetchNextPage: fetchMoreNotes, hasNextPage: hasMoreNotes } = usePaginatedContactNotes(id);
  const { data: pipelineItems = [] } = useContactPipelineItems(id);

  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [nextStatus, setNextStatus] = useState<string>("uncalled");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("10:00");

  const allCallLogs = useMemo(() => callLogPages?.pages.flatMap((p) => p.items) ?? [], [callLogPages]);
  const allNotes = useMemo(() => notePages?.pages.flatMap((p) => p.items) ?? [], [notePages]);
  const websiteUrl = normaliseExternalUrl(contact?.website);
  const gmbUrl = normaliseExternalUrl(contact?.gmb_link);
  const nextPipelineItem = pipelineItems.find((item: any) => item.scheduled_for && item.status !== "completed") ?? pipelineItems[0];
  const latestCall = allCallLogs[0];
  const latestNote = allNotes[0];
  const currentStatusValue = contact ? (contact.is_dnc ? "dnc" : contact.status) : "uncalled";

  useEffect(() => {
    setNextStatus(currentStatusValue);
  }, [currentStatusValue, id]);

  const handleToggleDnc = async () => {
    if (!contact) return;
    try {
      await updateContact.mutateAsync({ id: contact.id, is_dnc: !contact.is_dnc });
      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      toast.success(contact.is_dnc ? "Removed from DNC" : "Marked as DNC");
    } catch {
      toast.error("Failed to update DNC status");
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !id || !user?.id) return;
    setSavingNote(true);
    try {
      const { error } = await supabase.from("contact_notes").insert({
        contact_id: id,
        content: newNote.trim(),
        created_by: user.id,
        source: "manual" as const,
      });
      if (error) throw error;
      setNewNote("");
      queryClient.invalidateQueries({ queryKey: ["contact-notes-paginated", id] });
      toast.success("Note added");
    } catch {
      toast.error("Failed to add note");
    } finally {
      setSavingNote(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!contact || !user || nextStatus === currentStatusValue) return;

    const isBooking = nextStatus === "booked";
    if (isBooking && !bookingDate) {
      toast.error("Please select a booking date.");
      return;
    }

    try {
      await updateContact.mutateAsync({
        id: contact.id,
        status: nextStatus === "dnc" ? contact.status : nextStatus,
        is_dnc: nextStatus === "dnc",
      });

      if (isBooking) {
        const [hours, minutes] = bookingTime.split(":").map(Number);
        const scheduled = new Date(bookingDate);
        scheduled.setHours(hours || 10, minutes || 0, 0, 0);

        await createPipelineItem.mutateAsync({
          contact_id: contact.id,
          pipeline_type: "booked",
          assigned_user_id: user.id,
          created_by: user.id,
          scheduled_for: scheduled.toISOString(),
          notes: "Created from contact detail page",
        });
      } else if (shouldCreatePipelineItemForStatus(nextStatus) && nextStatus === "follow_up") {
        const scheduled = getDefaultManualFollowUpScheduledFor();

        await createPipelineItem.mutateAsync({
          contact_id: contact.id,
          pipeline_type: nextStatus,
          assigned_user_id: user.id,
          created_by: user.id,
          scheduled_for: scheduled.toISOString(),
          notes: contact.follow_up_note || "Created from contact detail page",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["contact", id] });
      setBookingDate("");
      setBookingTime("10:00");
      toast.success(`Status updated to ${nextStatus}.`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  if (isLoading) {
    return (
      <AppLayout title="Contact">
        <ContactDetailSkeleton />
      </AppLayout>
    );
  }

  if (error || !contact) {
    return (
      <AppLayout title="Contact">
        <div className="max-w-6xl mx-auto text-center py-20 space-y-4">
          <p className="text-muted-foreground">Contact not found.</p>
          <Button variant="outline" onClick={() => navigate("/contacts")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Contacts
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={contact.business_name}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="flex items-center gap-3 lg:flex-1 lg:min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate("/contacts")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-foreground truncate">{contact.business_name}</h1>
                <Badge variant="secondary" className="font-mono text-xs">{contact.industry}</Badge>
                <Badge variant={currentStatusValue === "uncalled" ? "outline" : "default"} className="text-xs capitalize">
                  {currentStatusValue}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {contact.contact_person ? (
                  <span>{contact.contact_person}</span>
                ) : (
                  <span>No contact person captured yet</span>
                )}
                {(contact.city || contact.state) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {[contact.city, contact.state].filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[360px]">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <PhoneCall className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-widest">Calls</span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-foreground">{contact.call_attempt_count ?? 0}</p>
                <p className="text-xs text-muted-foreground">Last {latestCall ? formatTimestamp(latestCall.created_at, "dd MMM") : "not recorded"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <StickyNote className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-widest">Notes</span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-foreground">{allNotes.length}</p>
                <p className="text-xs text-muted-foreground">Latest {latestNote ? formatTimestamp(latestNote.created_at, "dd MMM") : "not added"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-widest">Pipeline</span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-foreground">{pipelineItems.length}</p>
                <p className="text-xs text-muted-foreground">{nextPipelineItem?.scheduled_for ? formatTimestamp(nextPipelineItem.scheduled_for, "dd MMM") : "No upcoming slot"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-widest">DNC</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-foreground">{contact.is_dnc ? "Blocked" : "Callable"}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Switch checked={contact.is_dnc} onCheckedChange={handleToggleDnc} />
                  {contact.is_dnc ? <ShieldOff className="h-4 w-4 text-destructive" /> : <Shield className="h-4 w-4 text-muted-foreground/40" />}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-primary hover:underline font-mono">
                <Phone className="h-3.5 w-3.5" /> {contact.phone}
              </a>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" /> {contact.email}
                </a>
              )}
              {websiteUrl && (
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <Globe className="h-3.5 w-3.5" /> Website
                </a>
              )}
              {gmbUrl && (
                <a href={gmbUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" /> GMB
                </a>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Last call</p>
                <p className="mt-1 text-sm text-foreground">
                  {latestCall
                    ? `${OUTCOME_CONFIG[latestCall.outcome as CallOutcome]?.label || latestCall.outcome} · ${formatTimestamp(latestCall.created_at)}`
                    : "No calls recorded yet"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Latest note</p>
                <p className="mt-1 text-sm text-foreground line-clamp-2">
                  {latestNote?.content || "No notes added yet"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Next pipeline step</p>
                <p className="mt-1 text-sm text-foreground line-clamp-2">
                  {nextPipelineItem
                    ? `${nextPipelineItem.pipeline_type} · ${nextPipelineItem.scheduled_for ? formatTimestamp(nextPipelineItem.scheduled_for) : nextPipelineItem.status}`
                    : "No pipeline items yet"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  Call History
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {allCallLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No calls recorded yet.</p>
                ) : (
                  <>
                    {allCallLogs.map((log) => {
                      const config = OUTCOME_CONFIG[log.outcome as CallOutcome];
                      return (
                        <div key={log.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {config?.label || log.outcome}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {formatTimestamp(log.created_at)}
                              </span>
                            </div>
                            {log.notes && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{log.notes}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {hasMoreLogs && (
                      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => fetchMoreLogs()}>
                        Load more
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a note..."
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    className="min-h-[60px] text-sm border-border"
                    rows={2}
                  />
                  <Button
                    size="icon"
                    onClick={handleAddNote}
                    disabled={!newNote.trim() || savingNote}
                    className="shrink-0 self-end"
                  >
                    {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                {allNotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center">No notes yet.</p>
                ) : (
                  <>
                    {allNotes.map((note) => (
                      <div key={note.id} className="rounded-lg border border-border p-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] font-mono">{note.source}</Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatTimestamp(note.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                    {hasMoreNotes && (
                      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => fetchMoreNotes()}>
                        Load more
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  Quick Status Update
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={nextStatus} onValueChange={setNextStatus}>
                    <SelectTrigger className="border-border bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONTACT_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {nextStatus === "booked" && (
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
                {nextStatus === "follow_up" && (
                  <p className="rounded border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    This also creates a follow-up task scheduled in 2 days.
                  </p>
                )}
                {nextStatus === "dnc" && (
                  <p className="rounded border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
                    This marks the contact as do not call without overwriting its existing status.
                  </p>
                )}
                <Button
                  onClick={handleStatusUpdate}
                  disabled={updateContact.isPending || createPipelineItem.isPending || nextStatus === currentStatusValue}
                  className="w-full"
                >
                  {updateContact.isPending || createPipelineItem.isPending ? "Saving…" : "Update Status"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  Pipeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pipelineItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No pipeline items.</p>
                ) : (
                  pipelineItems.map((item: any) => (
                    <div key={item.id} className="rounded-lg border border-border p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={item.pipeline_type === "booked" ? "default" : "secondary"} className="text-[10px]">
                          {item.pipeline_type}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-mono">{item.status}</Badge>
                        {item.scheduled_for && (
                          <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatTimestamp(item.scheduled_for, "dd MMM yy")}
                          </span>
                        )}
                      </div>
                      {item.appointment_outcome && (
                        <p className="text-xs text-muted-foreground">
                          Outcome: {getAppointmentOutcomeLabel(item.appointment_outcome as AppointmentOutcomeValue)}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.notes}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Call Attempts</dt>
                    <dd className="font-mono font-medium text-foreground">{contact.call_attempt_count}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Last Outcome</dt>
                    <dd className="font-mono text-foreground text-right">
                      {contact.last_outcome
                        ? (OUTCOME_CONFIG[contact.last_outcome as CallOutcome]?.label || contact.last_outcome)
                        : "—"}
                    </dd>
                  </div>
                  {contact.latest_appointment_outcome && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Appt. Outcome</dt>
                      <dd className="font-mono text-foreground text-right">
                        {getAppointmentOutcomeLabel(contact.latest_appointment_outcome as AppointmentOutcomeValue)}
                      </dd>
                    </div>
                  )}
                  {contact.follow_up_note && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Follow-up Note</dt>
                      <dd className="text-foreground text-xs max-w-[200px] text-right">{contact.follow_up_note}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="font-mono text-xs text-foreground">
                      {formatTimestamp(contact.created_at, "dd MMM yyyy")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd className="font-mono text-xs text-foreground">
                      {formatTimestamp(contact.updated_at, "dd MMM yyyy")}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
