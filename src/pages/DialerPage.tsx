import { useState, useCallback, useEffect, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ContactCard } from "@/components/ContactCard";
import { OutcomeButton } from "@/components/OutcomeButton";
import { DailyTarget } from "@/components/DailyTarget";
import { INDUSTRIES, CallOutcome, OUTCOME_CONFIG } from "@/data/mockData";
import { useUncalledContacts, useUpdateContact } from "@/hooks/useContacts";
import { useCreateCallLog } from "@/hooks/useCallLogs";
import { useAuth } from "@/hooks/useAuth";
import { useMyDialpadSettings } from "@/hooks/useDialpadSettings";
import { useDialpadCall } from "@/hooks/useDialpad";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Phone, CheckCircle2, Loader2, PhoneCall, SkipForward, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface SessionStats {
  calls: number;
  outcomes: Partial<Record<CallOutcome, number>>;
}

export default function DialerPage() {
  const { user } = useAuth();
  const [industry, setIndustry] = useState<string>("all");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>();
  const [isDialing, setIsDialing] = useState(false);
  const [callCount, setCallCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [sessionOutcomes, setSessionOutcomes] = useState<Partial<Record<CallOutcome, number>>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [manualPhone, setManualPhone] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const activeDialRequestRef = useRef<string | null>(null);

  const { data: uncalledContacts = [], isLoading } = useUncalledContacts(industry);
  const updateContact = useUpdateContact();
  const createCallLog = useCreateCallLog();
  const { data: myDialpadSettings } = useMyDialpadSettings();
  const dialpadCall = useDialpadCall();

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
    setCallCount(0);
    setSkippedCount(0);
    setSessionOutcomes({});
    setShowSummary(false);
  }, [uncalledContacts]);

  const stopSession = useCallback(() => {
    if (callCount > 0) {
      setShowSummary(true);
    }
    setIsDialing(false);
    setCurrentIndex(null);
  }, [callCount]);

  const skipLead = useCallback(() => {
    if (currentIndex === null) return;
    setSkippedCount((prev) => prev + 1);
    setSelectedOutcome(null);
    setNotes("");
    setFollowUpDate(undefined);
    const nextIdx = currentIndex + 1;
    if (nextIdx < uncalledContacts.length) {
      setCurrentIndex(nextIdx);
    } else {
      toast.info("No more leads in queue.");
      stopSession();
    }
  }, [currentIndex, uncalledContacts.length, stopSession]);

  const logAndNext = useCallback(async () => {
    if (!selectedOutcome || !currentContact || !user) return;

    try {
      await createCallLog.mutateAsync({
        contact_id: currentContact.id,
        user_id: user.id,
        outcome: selectedOutcome,
        notes: notes || undefined,
        follow_up_date: selectedOutcome === "follow_up" && followUpDate
          ? followUpDate.toISOString()
          : null,
      });

      await updateContact.mutateAsync({
        id: currentContact.id,
        status: "called",
        last_outcome: selectedOutcome,
        is_dnc: selectedOutcome === "dnc",
      });

      setCallCount((prev) => prev + 1);
      setSessionOutcomes((prev) => ({
        ...prev,
        [selectedOutcome]: (prev[selectedOutcome] || 0) + 1,
      }));

      toast.success(`Logged: ${OUTCOME_CONFIG[selectedOutcome].label}`);
      activeDialRequestRef.current = null;
      setSelectedOutcome(null);
      setNotes("");
      setFollowUpDate(undefined);
    } catch (err) {
      toast.error("Failed to log call. Try again.");
    }
  }, [selectedOutcome, currentContact, user, notes, followUpDate, createCallLog, updateContact]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isDialing || !currentContact) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA" || (e.target as HTMLElement).tagName === "INPUT") return;
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
      // S key to skip
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skipLead();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDialing, currentContact, selectedOutcome, logAndNext, skipLead]);

  const outcomes: CallOutcome[] = [
    "no_answer", "voicemail", "not_interested", "dnc",
    "follow_up", "booked", "wrong_number",
  ];

  // When uncalled contacts refresh
  useEffect(() => {
    if (isDialing && currentIndex !== null && uncalledContacts.length === 0) {
      stopSession();
    } else if (isDialing && currentIndex !== null && currentIndex >= uncalledContacts.length) {
      setCurrentIndex(uncalledContacts.length > 0 ? uncalledContacts.length - 1 : null);
      if (uncalledContacts.length === 0) stopSession();
    }
  }, [uncalledContacts.length, isDialing, currentIndex, stopSession]);

  useEffect(() => {
    if (!isDialing || !currentContact || !myDialpadSettings?.dialpad_user_id) return;

    const requestKey = `${currentContact.id}:${currentContact.phone}`;
    if (activeDialRequestRef.current === requestKey || dialpadCall.isPending) return;

    activeDialRequestRef.current = requestKey;

    dialpadCall
      .mutateAsync({
        phone: currentContact.phone,
        dialpad_user_id: myDialpadSettings.dialpad_user_id,
      })
      .then(() => {
        toast.success(`Calling ${currentContact.phone} through Dialpad`);
      })
      .catch((error) => {
        activeDialRequestRef.current = null;
        const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
        toast.error(message);
      });
  }, [isDialing, currentContact, myDialpadSettings?.dialpad_user_id, dialpadCall]);

  return (
    <AppLayout title="Dialer">
      <div className="max-w-6xl mx-auto space-y-6">
        <DailyTarget />

        {/* Session Summary Dialog */}
        <Dialog open={showSummary} onOpenChange={setShowSummary}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Session Summary
                </DialogTitle>
                <DialogDescription>
                  Review this calling session before closing the summary.
                </DialogDescription>
              </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-secondary rounded-lg border border-border">
                  <p className="text-2xl font-bold font-mono text-foreground">{callCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Calls</p>
                </div>
                <div className="text-center p-3 bg-secondary rounded-lg border border-border">
                  <p className="text-2xl font-bold font-mono text-foreground">{sessionOutcomes.booked || 0}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Booked</p>
                </div>
                <div className="text-center p-3 bg-secondary rounded-lg border border-border">
                  <p className="text-2xl font-bold font-mono text-foreground">{skippedCount}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Skipped</p>
                </div>
              </div>
              <div className="space-y-2">
                {(Object.entries(sessionOutcomes) as [CallOutcome, number][]).map(([outcome, count]) => {
                  const config = OUTCOME_CONFIG[outcome];
                  return (
                    <div key={outcome} className="flex items-center gap-3 text-sm">
                      <div className={`w-2 h-2 rounded-full ${config?.bgClass || "bg-muted-foreground"}`} />
                      <span className="text-foreground flex-1">{config?.label || outcome}</span>
                      <span className="font-mono text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
              <Button onClick={() => setShowSummary(false)} className="w-full">
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Controls bar */}
        <div className="flex items-center gap-4 flex-wrap">
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
            {myDialpadSettings ? (
              <span className="text-xs font-mono text-primary">
                <Phone className="h-3 w-3 inline mr-1" />
                {myDialpadSettings.dialpad_phone_number || myDialpadSettings.dialpad_user_id}
              </span>
            ) : (
              <span className="text-xs font-mono text-muted-foreground/60">
                No Dialpad number assigned
              </span>
            )}
            {isDialing && (
              <span className="text-xs font-mono text-primary">
                {callCount} calls · {skippedCount} skipped
              </span>
            )}
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
              onClick={stopSession}
              className="border-destructive text-destructive hover:bg-destructive/10"
            >
              Stop Session
            </Button>
          )}

          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-border">
                <PhoneCall className="h-4 w-4 mr-2" />
                Manual Dial
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Manual Dial</DialogTitle>
                <DialogDescription>
                  Place a Dialpad call directly to any phone number.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <Input
                  type="tel"
                  placeholder="Enter phone number..."
                  value={manualPhone}
                  onChange={(e) => setManualPhone(e.target.value)}
                  className="font-mono text-lg tracking-wider"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && manualPhone.trim() && myDialpadSettings?.dialpad_user_id) {
                      try {
                        await dialpadCall.mutateAsync({
                          phone: manualPhone.trim(),
                          dialpad_user_id: myDialpadSettings.dialpad_user_id,
                        });
                        toast.success(`Calling ${manualPhone.trim()} through Dialpad`);
                        setManualOpen(false);
                        setManualPhone("");
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
                        toast.error(message);
                      }
                    }
                  }}
                />
                <Button
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  disabled={!manualPhone.trim() || !myDialpadSettings?.dialpad_user_id || dialpadCall.isPending}
                  onClick={async () => {
                    try {
                      await dialpadCall.mutateAsync({
                        phone: manualPhone.trim(),
                        dialpad_user_id: myDialpadSettings.dialpad_user_id,
                      });
                      toast.success(`Calling ${manualPhone.trim()} through Dialpad`);
                      setManualOpen(false);
                      setManualPhone("");
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
                      toast.error(message);
                    }
                  }}
                >
                  {dialpadCall.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Phone className="h-4 w-4 mr-2" />
                  )}
                  Dial {manualPhone.trim() || "..."}
                </Button>
                {!myDialpadSettings?.dialpad_user_id && (
                  <p className="text-sm text-muted-foreground">
                    Assign a Dialpad number to your user before placing calls.
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
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

              {/* Submit + Skip */}
              <div className="space-y-2">
                <Button
                  onClick={logAndNext}
                  disabled={!selectedOutcome || createCallLog.isPending || dialpadCall.isPending}
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
                <Button
                  variant="outline"
                  onClick={skipLead}
                  className="w-full border-border text-muted-foreground hover:text-foreground"
                >
                  <SkipForward className="h-4 w-4 mr-2" />
                  Skip Lead
                  <kbd className="ml-2 text-[10px] font-mono opacity-70 bg-muted px-1.5 py-0.5 rounded">
                    S
                  </kbd>
                </Button>
              </div>
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
                : "Select an industry filter and hit 'Start Dialing' to begin your calling session. Use number keys 1-7 to quickly select outcomes, S to skip, Enter to log."
              }
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
