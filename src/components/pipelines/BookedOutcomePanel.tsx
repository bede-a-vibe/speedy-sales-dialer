import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, DollarSign, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BOOKED_APPOINTMENT_DEFAULT_TIME, type AppointmentOutcomeValue } from "@/lib/appointments";
import { cn } from "@/lib/utils";
import type { PipelineItemWithRelations, SalesRepOption, FollowUpMethod } from "@/hooks/usePipelineItems";
import { FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";

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
    followUpDate?: string,
    followUpMethod?: FollowUpMethod,
  ) => Promise<void>;
}

export function BookedOutcomePanel({ item, reps, isSaving, onAssign, onRecordOutcome }: BookedOutcomePanelProps) {
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    item.scheduled_for ? new Date(item.scheduled_for) : undefined,
  );
  const [outcomeNotes, setOutcomeNotes] = useState(item.outcome_notes || "");
  const [dealValue, setDealValue] = useState("");
  const [wantsFollowUp, setWantsFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined);
  const [followUpTime, setFollowUpTime] = useState("09:00");
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>("call");

  const followUpIso = followUpDate ? combineDateTime(followUpDate, followUpTime) : undefined;

  const fireOutcome = (outcome: AppointmentOutcomeValue, scheduledFor?: string) => {
    const val = outcome === "showed_closed" && dealValue ? parseFloat(dealValue) : undefined;
    onRecordOutcome(
      item,
      outcome,
      outcomeNotes,
      scheduledFor,
      val,
      wantsFollowUp && followUpIso ? followUpIso : undefined,
      wantsFollowUp ? followUpMethod : undefined,
    );
  };

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

      {/* Follow-up scheduling */}
      <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox
            checked={wantsFollowUp}
            onCheckedChange={(checked) => setWantsFollowUp(checked === true)}
          />
          <CalendarPlus className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Schedule follow-up</span>
        </label>

        {wantsFollowUp && (
          <div className="flex flex-col gap-2 pl-6">
            <FollowUpMethodSelector value={followUpMethod} onChange={setFollowUpMethod} />
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("justify-start bg-background", !followUpDate && "text-muted-foreground")}>
                    <CalendarPlus className="h-4 w-4" />
                    {followUpDate ? format(followUpDate, "PPP") : "Pick follow-up date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={setFollowUpDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                value={followUpTime}
                onChange={(e) => setFollowUpTime(e.target.value)}
                className="w-[120px] bg-background"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="secondary"
          onClick={() =>
            rescheduleDate &&
            fireOutcome("rescheduled", combineDateTime(rescheduleDate, BOOKED_APPOINTMENT_DEFAULT_TIME))
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
        <Button variant="outline" size="sm" onClick={() => fireOutcome("no_show")} disabled={isSaving}>
          No Show
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("showed_verbal_commitment")} disabled={isSaving}>
          Verbal Commitment
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fireOutcome("showed_closed")}
          disabled={isSaving}
        >
          <DollarSign className="h-4 w-4" />
          Showed - Closed
        </Button>
        <Button variant="outline" size="sm" onClick={() => fireOutcome("showed_no_close")} disabled={isSaving}>
          Showed - No Close
        </Button>
      </div>
    </div>
  );
}
