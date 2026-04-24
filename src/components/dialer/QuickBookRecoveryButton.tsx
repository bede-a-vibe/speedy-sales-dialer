import { useState } from "react";
import { format } from "date-fns";
import { CalendarCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface QuickBookRecoveryButtonProps {
  contactId: string;
  contactName: string;
  /** Called after a successful recovery — useful to refresh queues / lists. */
  onRecovered?: () => void;
}

/**
 * One-click recovery for "I just booked this in GHL but the dialer didn't log it".
 * Writes a call_logs row (outcome=booked) + pipeline_items row (booked, open) +
 * updates the contact so the booking shows up in Reports immediately.
 */
export function QuickBookRecoveryButton({ contactId, contactName, onRecovered }: QuickBookRecoveryButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  });
  const [time, setTime] = useState<string>("10:00");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user) {
      toast.error("You must be signed in.");
      return;
    }
    if (!date) {
      toast.error("Pick the appointment date.");
      return;
    }

    const [hours, minutes] = time.split(":").map((n) => Number(n) || 0);
    const scheduled = new Date(date);
    scheduled.setHours(hours, minutes, 0, 0);

    setSubmitting(true);
    try {
      // 1. Write call_log (outcome=booked)
      const { data: callLog, error: callLogErr } = await supabase
        .from("call_logs")
        .insert({
          contact_id: contactId,
          user_id: user.id,
          outcome: "booked",
          notes: notes || `Booking recovered manually — appointment booked directly in GHL on ${format(scheduled, "PPpp")}.`,
          reached_connection: true,
        })
        .select("id")
        .single();

      if (callLogErr) throw callLogErr;

      // 2. Write pipeline_item (booked, open)
      const { error: pipelineErr } = await supabase.from("pipeline_items").insert({
        contact_id: contactId,
        pipeline_type: "booked",
        assigned_user_id: user.id,
        created_by: user.id,
        scheduled_for: scheduled.toISOString(),
        notes: notes || `Recovered booking for ${contactName}`,
        status: "open",
        source_call_log_id: callLog?.id ?? null,
      });

      if (pipelineErr) throw pipelineErr;

      // 3. Update contact status so it stops appearing in dialer queue
      const { error: contactErr } = await supabase
        .from("contacts")
        .update({
          status: "booked",
          last_outcome: "booked",
          last_called_at: new Date().toISOString(),
          meeting_booked_date: scheduled.toISOString(),
        })
        .eq("id", contactId);

      if (contactErr) throw contactErr;

      toast.success("Booking recovered", {
        description: `${contactName} is now logged as booked for ${format(scheduled, "PPp")}.`,
      });
      setOpen(false);
      setNotes("");
      onRecovered?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save the recovery.";
      toast.error("Recovery failed", { description: message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200"
      >
        <CalendarCheck2 className="h-3.5 w-3.5" />
        I booked this in GHL
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log a manual GHL booking</DialogTitle>
            <DialogDescription>
              Use this when you booked the appointment directly in GHL but it isn't showing up
              in the dialer or Reports. We'll backfill the call log + pipeline item so your
              activity counts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Contact</Label>
              <p className="mt-1 text-sm font-medium text-foreground">{contactName}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "mt-1 w-full justify-start font-normal",
                        !date && "text-muted-foreground",
                      )}
                    >
                      {date ? format(date, "PP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => d && setDate(d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Time</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any context to attach to the booking…"
                className="mt-1 min-h-[72px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting || !date}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck2 className="mr-2 h-4 w-4" />}
              Log Booking
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}