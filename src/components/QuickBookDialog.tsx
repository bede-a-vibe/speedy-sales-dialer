import { useState, useCallback, useEffect, useMemo } from "react";
import { Search, CalendarPlus, Phone, User, Building2, MapPin, Loader2, CalendarIcon, ClipboardList, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useUserRole";
import { useCreateContact } from "@/hooks/useContacts";
import { useCreateCallLog } from "@/hooks/useCallLogs";
import { useSalesReps, useCreatePipelineItem, type FollowUpMethod } from "@/hooks/usePipelineItems";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import { useGHLSync } from "@/hooks/useGHLSync";
import { useGHLContactLink } from "@/hooks/useGHLContactLink";
import { useGHLCalendars, useGHLPipelines } from "@/hooks/useGHLConfig";
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

  const ghlSelectedPipelineStages = useMemo(
    () => ghlPipelines.find((p) => p.id === ghlPipelineId)?.stages ?? [],
    [ghlPipelines, ghlPipelineId],
  );

  // Set default rep to current user
  useEffect(() => {
    if (user && !assignedRepId) {
      setAssignedRepId(user.id);
    }
  }, [user, assignedRepId]);

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
          setResults(data || []);
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


  const canSubmit = useMemo(
    () => !!selectedContact && !!assignedRepId && !!scheduledDate && (pipelineType !== "booked" || !!ghlCalendarId),
    [selectedContact, assignedRepId, scheduledDate, pipelineType, ghlCalendarId],
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedContact || !assignedRepId || !scheduledDate || !user) return;

    const scheduledFor = new Date(
      scheduledDate.getFullYear(),
      scheduledDate.getMonth(),
      scheduledDate.getDate(),
      ...scheduledTime.split(":").map(Number) as [number, number],
    );

    try {
      await createPipelineItem.mutateAsync({
        contact_id: selectedContact.id,
        pipeline_type: pipelineType,
        assigned_user_id: assignedRepId,
        created_by: user.id,
        scheduled_for: scheduledFor.toISOString(),
        notes: notes.trim() || "",
        ...(pipelineType === "follow_up" ? { follow_up_method: followUpMethod } : {}),
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

      const newStatus = pipelineType === "booked" ? "booked" : "follow_up";
      await supabase
        .from("contacts")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", selectedContact.id);

      const label = pipelineType === "booked" ? "Booking" : "Follow-up";
      toast.success(`${label} created for ${selectedContact.business_name}`);

      // ── GHL Sync (fire-and-forget) ──
      // Auto-link contact to GHL if not already linked, then sync
      const contactGhlId =
        (selectedContact as Record<string, unknown>).ghl_contact_id as string | null
        ?? await ghlLink.ensureGHLLink(selectedContact as any).catch(() => null);

      if (contactGhlId) {
        const repName = salesReps.find((r) => r.user_id === assignedRepId)?.display_name ?? undefined;
        if (pipelineType === "booked" && ghlCalendarId) {
          ghlSync.pushBooking({
            ghlContactId: contactGhlId,
            calendarId: ghlCalendarId,
            scheduledFor: scheduledFor.toISOString(),
            contactName: selectedContact.business_name,
            repName,
            notes: notes.trim() || undefined,
            pipelineId: ghlPipelineId || undefined,
            pipelineStageId: ghlStageId || undefined,
          }).catch(() => {});
        }
        if (pipelineType === "follow_up") {
          ghlSync.pushFollowUp({
            ghlContactId: contactGhlId,
            scheduledFor: scheduledFor.toISOString(),
            method: followUpMethod,
          }).catch(() => {});
        }
      }

      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create item");
    }
  }, [selectedContact, assignedRepId, scheduledDate, scheduledTime, notes, user, pipelineType, createPipelineItem, createCallLog, onOpenChange, ghlSync, ghlLink, ghlCalendarId, ghlPipelineId, ghlStageId, salesReps, followUpMethod]);

  const isBooked = pipelineType === "booked";

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
                <div className="flex items-start justify-between">
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
                  <FollowUpMethodSelector value={followUpMethod} onChange={setFollowUpMethod} />
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

              {/* Date / time */}
              <div>
                <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  {isBooked ? "Confirm Booked Date" : "Follow-up Date"}
                </label>
                <div className="space-y-2">
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

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={!canSubmit || createPipelineItem.isPending}
                className="w-full py-3 font-semibold"
              >
                {createPipelineItem.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : isBooked ? (
                  <CalendarPlus className="mr-2 h-4 w-4" />
                ) : (
                  <ClipboardList className="mr-2 h-4 w-4" />
                )}
                {isBooked ? "Create Booking" : "Create Follow-up"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
