import { useState, useCallback, useEffect, useMemo } from "react";
import { Search, CalendarPlus, Phone, User, Building2, MapPin, Loader2, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSalesReps, useCreatePipelineItem } from "@/hooks/usePipelineItems";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InlineBookingEmbed } from "@/components/dialer/InlineBookingEmbed";
import type { Tables } from "@/integrations/supabase/types";

type Contact = Tables<"contacts">;

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

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  // Booking fields
  const [assignedRepId, setAssignedRepId] = useState("");
  const [bookedDate, setBookedDate] = useState<Date | undefined>();
  const [bookedTime, setBookedTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [isBookedDateAutoDetected, setIsBookedDateAutoDetected] = useState(false);

  // Set default rep to current user
  useEffect(() => {
    if (user && !assignedRepId) {
      setAssignedRepId(user.id);
    }
  }, [user, assignedRepId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedContact(null);
      setBookedDate(undefined);
      setBookedTime("09:00");
      setNotes("");
      setAssignedRepId(user?.id || "");
      setIsBookedDateAutoDetected(false);
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

  const handleBookedDateDetected = useCallback((date: Date) => {
    setBookedDate(date);
    setIsBookedDateAutoDetected(true);
  }, []);

  const canSubmit = useMemo(
    () => !!selectedContact && !!assignedRepId && !!bookedDate,
    [selectedContact, assignedRepId, bookedDate],
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedContact || !assignedRepId || !bookedDate || !user) return;

    const scheduledFor = new Date(
      bookedDate.getFullYear(),
      bookedDate.getMonth(),
      bookedDate.getDate(),
      ...bookedTime.split(":").map(Number) as [number, number],
    );

    try {
      await createPipelineItem.mutateAsync({
        contact_id: selectedContact.id,
        pipeline_type: "booked",
        assigned_user_id: assignedRepId,
        created_by: user.id,
        scheduled_for: scheduledFor.toISOString(),
        notes: notes.trim() || "",
      });

      // Update contact status to booked
      await supabase
        .from("contacts")
        .update({ status: "booked", updated_at: new Date().toISOString() })
        .eq("id", selectedContact.id);

      toast.success(`Booking created for ${selectedContact.business_name}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create booking");
    }
  }, [selectedContact, assignedRepId, bookedDate, bookedTime, notes, user, createPipelineItem, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            Quick Book Appointment
          </DialogTitle>
          <DialogDescription>Search for a contact and create a booking.</DialogDescription>
        </DialogHeader>

        {!selectedContact ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by business name, phone, or contact person..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
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
                  No contacts found for "{query}"
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
        ) : (
          <ScrollArea className="flex-1 max-h-[calc(90vh-120px)]">
            <div className="space-y-4 pr-2">
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

              {/* Inline booking embed */}
              <InlineBookingEmbed onDetectedDate={handleBookedDateDetected} />

              {/* Confirm booked date */}
              <div>
                <label className="mb-2 block text-[10px] uppercase tracking-widest text-muted-foreground">
                  Confirm Booked Date
                </label>
                <div className="space-y-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start border-border bg-background text-left font-normal",
                          !bookedDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {bookedDate ? format(bookedDate, "PPP") : "Confirm appointment date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={bookedDate}
                        onSelect={(d) => {
                          setBookedDate(d);
                          setIsBookedDateAutoDetected(false);
                        }}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                        className="pointer-events-auto p-3"
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    value={bookedTime}
                    onChange={(e) => setBookedTime(e.target.value)}
                    className="border-border bg-background"
                  />
                  <p className="text-xs text-muted-foreground">
                    {bookedDate
                      ? isBookedDateAutoDetected
                        ? "Date auto-detected from the booking widget — adjust if needed."
                        : "Date confirmed manually."
                      : "Choose the booked appointment day."}
                  </p>
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
                  placeholder="Any booking notes..."
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
                ) : (
                  <CalendarPlus className="mr-2 h-4 w-4" />
                )}
                Create Booking
              </Button>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
