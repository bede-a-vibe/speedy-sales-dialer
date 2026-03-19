import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BOOKED_APPOINTMENT_DEFAULT_TIME, type AppointmentOutcomeValue } from "@/lib/appointments";
import { cn } from "@/lib/utils";
import type { PipelineItemWithRelations, SalesRepOption } from "@/hooks/usePipelineItems";

function combineDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next.toISOString();
}

interface BookedOutcomePanelProps {
  item: PipelineItemWithRelations;
  reps: SalesRepOption[];
  isSaving: boolean;
  onAssign?: (id: string, userId: string) => Promise<void>;
  onRecordOutcome: (
    item: PipelineItemWithRelations,
    outcome: AppointmentOutcomeValue,
    notes: string,
    scheduledFor?: string,
    dealValue?: number,
  ) => Promise<void>;
}

export function BookedOutcomePanel({ item, reps, isSaving, onAssign, onRecordOutcome }: BookedOutcomePanelProps) {
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    item.scheduled_for ? new Date(item.scheduled_for) : undefined,
  );
  const [outcomeNotes, setOutcomeNotes] = useState(item.outcome_notes || "");
  const [dealValue, setDealValue] = useState("");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
      {onAssign && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground shrink-0">Closer</span>
          <Select value={item.assigned_user_id} onValueChange={(value) => onAssign(item.id, value)}>
            <SelectTrigger className="w-full bg-background sm:w-[240px]">
              <SelectValue placeholder="Assign rep" />
            </SelectTrigger>
            <SelectContent>
              {reps.map((rep) => (
                <SelectItem key={rep.user_id} value={rep.user_id}>
                  {rep.display_name?.trim() || rep.email || "Unassigned"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Textarea
        value={outcomeNotes}
        onChange={(e) => setOutcomeNotes(e.target.value)}
        placeholder="Optional notes about the appointment result"
        className="min-h-[72px] resize-none bg-background"
      />

      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-muted-foreground" />
        <Input
          type="number"
          min="0"
          step="0.01"
          value={dealValue}
          onChange={(e) => setDealValue(e.target.value)}
          placeholder="Deal value (for closed deals)"
          className="w-full bg-background sm:w-[240px]"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="secondary"
          onClick={() =>
            rescheduleDate &&
            onRecordOutcome(item, "rescheduled", outcomeNotes, combineDateTime(rescheduleDate, BOOKED_APPOINTMENT_DEFAULT_TIME))
          }
          disabled={!rescheduleDate || isSaving}
          size="sm"
        >
          <CalendarClock className="h-4 w-4" />
          Reschedule
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("justify-start bg-background", !rescheduleDate && "text-muted-foreground")}>
              <CalendarClock className="h-4 w-4" />
              {rescheduleDate ? format(rescheduleDate, "PPP") : "Pick new day"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={rescheduleDate}
              onSelect={setRescheduleDate}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="sm" onClick={() => onRecordOutcome(item, "no_show", outcomeNotes)} disabled={isSaving}>
          No Show
        </Button>
        <Button variant="outline" size="sm" onClick={() => onRecordOutcome(item, "showed_verbal_commitment", outcomeNotes)} disabled={isSaving}>
          Verbal Commitment
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const val = dealValue ? parseFloat(dealValue) : undefined;
            onRecordOutcome(item, "showed_closed", outcomeNotes, undefined, val);
          }}
          disabled={isSaving}
        >
          <DollarSign className="h-4 w-4" />
          Showed - Closed
        </Button>
        <Button variant="outline" size="sm" onClick={() => onRecordOutcome(item, "showed_no_close", outcomeNotes)} disabled={isSaving}>
          Showed - No Close
        </Button>
      </div>
    </div>
  );
}
