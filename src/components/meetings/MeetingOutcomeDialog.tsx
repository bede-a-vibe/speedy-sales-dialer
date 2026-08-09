import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { useSetMeetingOutcome, type MeetingRow } from "@/hooks/useMeetings";
import {
  OUTCOME_REASONS,
  RECORDABLE_OUTCOMES,
  type RecordableOutcome,
} from "@/lib/meetingOutcomes";

interface Props {
  meeting: MeetingRow | null;
  /** Preselects an outcome when the rep clicked a specific button to open this. */
  initialOutcome?: RecordableOutcome | null;
  onOpenChange: (open: boolean) => void;
}

export function MeetingOutcomeDialog({ meeting, initialOutcome, onOpenChange }: Props) {
  const { toast } = useToast();
  const setOutcome = useSetMeetingOutcome();

  const [outcome, setOutcome_] = useState<RecordableOutcome | null>(null);
  const [reason, setReason] = useState<string>("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (meeting) {
      setOutcome_(initialOutcome ?? null);
      setReason("");
      setNotes("");
    }
  }, [meeting, initialOutcome]);

  const spec = useMemo(
    () => RECORDABLE_OUTCOMES.find((option) => option.value === outcome),
    [outcome],
  );
  const reasons = outcome ? OUTCOME_REASONS[outcome] : [];
  const reasonMissing = !!spec?.requiresReason && !reason;

  const handleSave = async () => {
    if (!meeting || !outcome) return;
    try {
      await setOutcome.mutateAsync({
        meetingId: meeting.id,
        stream: meeting.stream,
        outcome,
        reason: reason || null,
        notes: notes.trim() || null,
      });
      toast({ description: "Outcome recorded." });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Could not save that outcome.",
      });
    }
  };

  return (
    <Dialog open={!!meeting} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What happened?</DialogTitle>
          <DialogDescription>
            {meeting?.business_name || meeting?.contact_person || meeting?.title || "This meeting"}
            {meeting?.reschedule_count ? (
              <span className="mt-1 block text-amber-600 dark:text-amber-400">
                Moved {meeting.reschedule_count}{" "}
                {meeting.reschedule_count === 1 ? "time" : "times"} already.
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Outcome</Label>
            <ToggleGroup
              type="single"
              value={outcome ?? ""}
              onValueChange={(value) => {
                setOutcome_((value || null) as RecordableOutcome | null);
                setReason("");
              }}
              className="grid grid-cols-2 gap-2"
            >
              {RECORDABLE_OUTCOMES.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value} className="w-full">
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {outcome ? (
            <div className="space-y-2">
              <Label>
                Reason{" "}
                {spec?.requiresReason ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground">(optional)</span>
                )}
              </Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a reason" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {spec?.requiresReason ? (
                <p className="text-xs text-muted-foreground">
                  Required — a no-show or cancellation without a reason cannot be acted on later.
                </p>
              ) : null}
            </div>
          ) : null}

          {outcome === "rescheduled" ? (
            <p className="rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
              If the new time is already booked in GHL, the sync picks it up on its own and counts
              the move — you do not need to record it here.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="outcome-notes">Notes (optional)</Label>
            <Textarea
              id="outcome-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth knowing next time"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!outcome || reasonMissing || setOutcome.isPending}>
            {setOutcome.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save outcome
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
