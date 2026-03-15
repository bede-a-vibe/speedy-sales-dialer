import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { OutcomeButton } from "@/components/OutcomeButton";
import { INDUSTRIES, CallOutcome, OUTCOME_CONFIG } from "@/data/mockData";
import { useUncalledContacts, useUpdateContact } from "@/hooks/useContacts";
import { useCreateCallLog } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Phone, CheckCircle2, Loader2, PhoneCall } from "lucide-react";
import { toast } from "sonner";

export default function DialerPage() {
  const { user } = useAuth();
  const [industry, setIndustry] = useState<string>("all");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [isDialing, setIsDialing] = useState(false);
  const [callCount, setCallCount] = useState(0);
  const [manualPhone, setManualPhone] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const { data: uncalledContacts = [], isLoading } = useUncalledContacts(industry);
  const updateContact = useUpdateContact();
  const createCallLog = useCreateCallLog();

  const currentContact = currentIndex !== null && currentIndex < uncalledContacts.length
    ? uncalledContacts[currentIndex]
    : null;

  const startDialing = useCallback(() => {
    if (uncalledContacts.length === 0) return;
    setCurrentIndex(0);
    setIsDialing(true);
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
  }, [uncalledContacts]);

  const logAndNext = useCallback(async () => {
    if (!selectedOutcome || !currentContact || !user) return;

    try {
      // Log the call
      await createCallLog.mutateAsync({
        contact_id: currentContact.id,
        user_id: user.id,
        outcome: selectedOutcome,
        notes: notes || undefined,
        follow_up_date: selectedOutcome === "follow_up" && followUpDate
          ? followUpDate.toISOString()
          : null,
      });

      // Update contact status
      await updateContact.mutateAsync({
        id: currentContact.id,
        status: "called",
        last_outcome: selectedOutcome,
        is_dnc: selectedOutcome === "dnc",
      });

      setCallCount((prev) => prev + 1);
      setSelectedOutcome(null);
      setNotes("");
      setFollowUpDate(undefined);

      toast.success(`Logged: ${OUTCOME_CONFIG[selectedOutcome].label}`);

      // Move to next (index stays same since current was removed from uncalled query)
      // After invalidation, the list refreshes without the called contact
    } catch (err) {
      toast.error("Failed to log call. Try again.");
    }
  }, [selectedOutcome, currentContact, user, notes, followUpDate, createCallLog, updateContact]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isDialing || !currentContact) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
      const outcomes: CallOutcome[] = [
        "no_answer", "voicemail", "not_interested", "dnc",
        "follow_up", "booked", "wrong_number",
      ];
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < outcomes.length) {
        setSelectedOutcome(outcomes[idx]);
      }
      if (e.key === "Enter" && selectedOutcome) {
        e.preventDefault();
        logAndNext();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDialing, currentContact, selectedOutcome, logAndNext]);

  const outcomes: CallOutcome[] = [
    "no_answer", "voicemail", "not_interested", "dnc",
    "follow_up", "booked", "wrong_number",
  ];

  // When uncalled contacts refresh and current contact was removed, stay at same index or end session
  useEffect(() => {
    if (isDialing && currentIndex !== null && uncalledContacts.length === 0) {
      setIsDialing(false);
      setCurrentIndex(null);
    } else if (isDialing && currentIndex !== null && currentIndex >= uncalledContacts.length) {
      setCurrentIndex(uncalledContacts.length > 0 ? uncalledContacts.length - 1 : null);
      if (uncalledContacts.length === 0) setIsDialing(false);
    }
  }, [uncalledContacts.length, isDialing, currentIndex]);

  return (
    <AppLayout title="Dialer">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Controls bar */}
        <div className="flex items-center gap-4">
          <Select value={industry} onValueChange={setIndustry}>
            <SelectTrigger className="w-[200px] bg-card border-border">
              <SelectValue placeholder="Filter by industry" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Industries</SelectItem>
              {INDUSTRIES.map((ind) => (
                <SelectItem key={ind} value={ind}>{ind}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1 flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">
              {isLoading ? "..." : uncalledContacts.length} leads in queue
            </span>
            <span className="text-xs font-mono text-primary">
              {callCount} calls this session
            </span>
          </div>

          {!isDialing ? (
            <Button
              onClick={startDialing}
              disabled={uncalledContacts.length === 0 || isLoading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-6"
            >
              <Phone className="h-4 w-4 mr-2" />
              Start Dialing
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => { setIsDialing(false); setCurrentIndex(null); }}
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              Stop Session
            </Button>
          )}
        </div>

        {/* Main dialer area */}
        {isDialing && currentContact ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Contact info */}
            <div className="lg:col-span-3 space-y-4">
              <ContactCard contact={currentContact} />

              {/* Notes */}
              <div className="bg-card border border-border rounded-lg p-4">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">
                  Call Notes
                </label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Type notes during or after the call..."
                  className="bg-background border-border min-h-[100px] font-mono text-sm resize-none"
                />
              </div>
            </div>

            {/* Right: Outcomes */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-card border border-border rounded-lg p-4">
                <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3 block">
                  Call Outcome <span className="text-primary">(required)</span>
                </label>
                <div className="space-y-2">
                  {outcomes.map((outcome) => (
                    <OutcomeButton
                      key={outcome}
                      outcome={outcome}
                      selected={selectedOutcome === outcome}
                      onClick={setSelectedOutcome}
                    />
                  ))}
                </div>
              </div>

              {/* Follow-up date picker */}
              {selectedOutcome === "follow_up" && (
                <div className="bg-card border border-border rounded-lg p-4">
                  <label className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 block">
                    Follow-up Date
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-background",
                          !followUpDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {followUpDate ? format(followUpDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={followUpDate}
                        onSelect={setFollowUpDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Submit */}
              <Button
                onClick={logAndNext}
                disabled={!selectedOutcome || createCallLog.isPending}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-3"
              >
                {createCallLog.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Log & Next Lead
                <kbd className="ml-2 text-[10px] font-mono opacity-70 bg-primary-foreground/20 px-1.5 py-0.5 rounded">
                  Enter
                </kbd>
              </Button>
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Phone className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {uncalledContacts.length === 0 && !isLoading ? "No Leads Available" : "Ready to Dial"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {uncalledContacts.length === 0 && !isLoading
                ? "All contacts in this queue have been called. Try a different industry filter or upload new lists."
                : "Select an industry filter and hit 'Start Dialing' to begin your calling session. Use number keys 1-7 to quickly select outcomes."
              }
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
