import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { OutcomeButton } from "@/components/OutcomeButton";
import { MOCK_CONTACTS, INDUSTRIES, CallOutcome, Contact, OUTCOME_CONFIG } from "@/data/mockData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Phone, SkipForward, CheckCircle2 } from "lucide-react";

export default function DialerPage() {
  const [industry, setIndustry] = useState<string>("all");
  const [contacts, setContacts] = useState<Contact[]>(MOCK_CONTACTS);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [isDialing, setIsDialing] = useState(false);
  const [callCount, setCallCount] = useState(0);

  const filteredContacts = contacts.filter(
    (c) => c.status === "uncalled" && (industry === "all" || c.industry === industry)
  );

  const currentContact = currentIndex !== null ? filteredContacts[currentIndex] : null;

  const startDialing = useCallback(() => {
    if (filteredContacts.length === 0) return;
    setCurrentIndex(0);
    setIsDialing(true);
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
  }, [filteredContacts]);

  const logAndNext = useCallback(() => {
    if (!selectedOutcome || !currentContact) return;

    setContacts((prev) =>
      prev.map((c) =>
        c.id === currentContact.id
          ? { ...c, status: "called" as const, last_outcome: selectedOutcome }
          : c
      )
    );

    setCallCount((prev) => prev + 1);
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);

    // Move to next
    const nextIndex = (currentIndex ?? 0) + 1;
    if (nextIndex < filteredContacts.length) {
      setCurrentIndex(nextIndex);
    } else {
      setCurrentIndex(null);
      setIsDialing(false);
    }
  }, [selectedOutcome, currentContact, currentIndex, filteredContacts.length]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isDialing || !currentContact) return;

    const handler = (e: KeyboardEvent) => {
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
              {filteredContacts.length} leads in queue
            </span>
            <span className="text-xs font-mono text-primary">
              {callCount} calls today
            </span>
          </div>

          {!isDialing ? (
            <Button
              onClick={startDialing}
              disabled={filteredContacts.length === 0}
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
                disabled={!selectedOutcome}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold py-3"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
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
              {filteredContacts.length === 0 ? "No Leads Available" : "Ready to Dial"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {filteredContacts.length === 0
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
