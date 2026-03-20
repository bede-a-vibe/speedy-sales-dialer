import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, Phone, Mail, Globe, MapPin, ExternalLink, Shield, ShieldOff,
  Calendar, Clock3, MessageSquare, Send, Loader2,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useContactCallLogs } from "@/hooks/useCallLogs";
import { usePaginatedContactNotes } from "@/hooks/useContactNotes";
import { useContactPipelineItems } from "@/hooks/usePipelineItems";
import { useUpdateContact } from "@/hooks/useContacts";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type Contact = Tables<"contacts">;

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

  const { data: contact, isLoading, error } = useContact(id);
  const { data: callLogPages, fetchNextPage: fetchMoreLogs, hasNextPage: hasMoreLogs } = useContactCallLogs(id, 5, !!contact);
  const { data: notePages, fetchNextPage: fetchMoreNotes, hasNextPage: hasMoreNotes } = usePaginatedContactNotes(id);
  const { data: pipelineItems = [] } = useContactPipelineItems(id);

  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const allCallLogs = useMemo(() => callLogPages?.pages.flatMap((p) => p.items) ?? [], [callLogPages]);
  const allNotes = useMemo(() => notePages?.pages.flatMap((p) => p.items) ?? [], [notePages]);

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
        {/* Back + Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/contacts")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground truncate">{contact.business_name}</h1>
            {contact.contact_person && (
              <p className="text-sm text-muted-foreground">{contact.contact_person}</p>
            )}
          </div>
          <Badge variant="secondary" className="font-mono text-xs">{contact.industry}</Badge>
          <Badge variant={contact.status === "uncalled" ? "outline" : "default"} className="text-xs">
            {contact.status}
          </Badge>
        </div>

        {/* Contact Info Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-primary hover:underline font-mono">
                <Phone className="h-3.5 w-3.5" /> {contact.phone}
              </a>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" /> {contact.email}
                </a>
              )}
              {contact.website && (
                <a href={contact.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <Globe className="h-3.5 w-3.5" /> Website
                </a>
              )}
              {contact.gmb_link && (
                <a href={contact.gmb_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" /> GMB
                </a>
              )}
              {(contact.city || contact.state) && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {[contact.city, contact.state].filter(Boolean).join(", ")}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">DNC</span>
                <Switch checked={contact.is_dnc} onCheckedChange={handleToggleDnc} />
                {contact.is_dnc ? <ShieldOff className="h-4 w-4 text-destructive" /> : <Shield className="h-4 w-4 text-muted-foreground/40" />}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Call History + Notes */}
          <div className="space-y-6">
            {/* Call History */}
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
                                {format(new Date(log.created_at), "dd MMM yy · HH:mm")}
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

            {/* Notes */}
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
                            {format(new Date(note.created_at), "dd MMM yy · HH:mm")}
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

          {/* Right: Pipeline + Metadata */}
          <div className="space-y-6">
            {/* Pipeline Items */}
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
                            {format(new Date(item.scheduled_for), "dd MMM yy")}
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

            {/* Contact Metadata */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                  Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Call Attempts</dt>
                    <dd className="font-mono font-medium text-foreground">{contact.call_attempt_count}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Last Outcome</dt>
                    <dd className="font-mono text-foreground">
                      {contact.last_outcome
                        ? (OUTCOME_CONFIG[contact.last_outcome as CallOutcome]?.label || contact.last_outcome)
                        : "—"}
                    </dd>
                  </div>
                  {contact.latest_appointment_outcome && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Appt. Outcome</dt>
                      <dd className="font-mono text-foreground">
                        {getAppointmentOutcomeLabel(contact.latest_appointment_outcome as AppointmentOutcomeValue)}
                      </dd>
                    </div>
                  )}
                  {contact.follow_up_note && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Follow-up Note</dt>
                      <dd className="text-foreground text-xs max-w-[200px] text-right">{contact.follow_up_note}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="font-mono text-xs text-foreground">
                      {format(new Date(contact.created_at), "dd MMM yyyy")}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd className="font-mono text-xs text-foreground">
                      {format(new Date(contact.updated_at), "dd MMM yyyy")}
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
