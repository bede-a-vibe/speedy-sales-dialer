import { useState } from "react";
import { format, isPast, isToday } from "date-fns";
import { AlertTriangle, CalendarClock, Check, Clock3, DollarSign, Phone, RefreshCw, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BOOKED_APPOINTMENT_DEFAULT_TIME, getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { cn } from "@/lib/utils";
import type { PipelineItemWithRelations, SalesRepOption } from "@/hooks/usePipelineItems";
import { FollowUpMethodBadge } from "@/components/pipelines/FollowUpMethodSelector";

function combineDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next.toISOString();
}

interface PipelineItemCardProps {
  item: PipelineItemWithRelations;
  repName: string;
  setterName?: string;
  reps: SalesRepOption[];
  isSaving: boolean;
  showActions?: boolean;
  onComplete?: (id: string) => Promise<void>;
  onAssign?: (id: string, userId: string) => Promise<void>;
  onReschedule?: (id: string, iso: string) => Promise<void>;
  onRecordBookedOutcome?: (
    item: PipelineItemWithRelations,
    outcome: AppointmentOutcomeValue,
    notes: string,
    scheduledFor?: string,
    dealValue?: number,
    followUpDate?: string,
  ) => Promise<void>;
}

export function PipelineItemCard({
  item,
  repName,
  setterName,
  reps,
  isSaving,
  showActions = true,
  onComplete,
  onAssign,
  onReschedule,
  onRecordBookedOutcome,
}: PipelineItemCardProps) {
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(item.scheduled_for ? new Date(item.scheduled_for) : undefined);
  const [rescheduleTime, setRescheduleTime] = useState(item.scheduled_for ? format(new Date(item.scheduled_for), "HH:mm") : BOOKED_APPOINTMENT_DEFAULT_TIME);
  const [outcomeNotes, setOutcomeNotes] = useState(item.outcome_notes || "");
  const [dealValue, setDealValue] = useState("");

  const scheduledDate = item.scheduled_for ? new Date(item.scheduled_for) : null;
  const overdue = !!scheduledDate && isPast(scheduledDate) && !isToday(scheduledDate);
  const today = !!scheduledDate && isToday(scheduledDate);
  const isBooked = item.pipeline_type === "booked";
  const isStale = isBooked && item.status === "open" && overdue && !item.appointment_outcome;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border bg-card p-4",
        isStale && "border-amber-500/60 bg-amber-500/5",
        !isStale && overdue && item.status === "open" && "border-destructive/40 bg-destructive/5",
        !isStale && today && item.status === "open" && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{item.contacts?.business_name}</p>
            {item.pipeline_type === "follow_up" && (
              <FollowUpMethodBadge method={item.follow_up_method || "call"} />
            )}
            {isStale && (
              <Badge variant="outline" className="border-amber-500/60 text-amber-600 text-[10px]">
                <AlertTriangle className="mr-1 h-3 w-3" />
                Needs Outcome
              </Badge>
            )}
            {item.reschedule_count > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                <RefreshCw className="mr-1 h-3 w-3" />
                Rescheduled ×{item.reschedule_count}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {item.contacts?.contact_person || "No contact"} · {item.contacts?.industry || "Unknown industry"}
          </p>
          {item.notes && <p className="text-xs italic text-muted-foreground">"{item.notes}"</p>}
          <a
            href={`tel:${item.contacts?.phone || ""}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Phone className="h-3 w-3" /> {item.contacts?.phone}
          </a>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          {scheduledDate && (
            <div className="text-right">
              <p className="text-xs font-mono text-foreground">{format(scheduledDate, isBooked ? "MMM d, yyyy" : "MMM d, yyyy h:mm a")}</p>
              {isStale && <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-600">Stale</span>}
              {!isStale && overdue && item.status === "open" && <span className="text-[10px] font-semibold uppercase tracking-widest text-destructive">Overdue</span>}
              {today && item.status === "open" && <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Today</span>}
            </div>
          )}
          {isBooked && setterName ? (
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground lg:items-end">
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3 w-3" /> Setter: {setterName}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserRound className="h-3 w-3" /> Closer: {repName}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <UserRound className="h-3 w-3" /> {repName}
            </div>
          )}
          {isBooked && item.appointment_outcome && (
            <span className="rounded bg-secondary px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-secondary-foreground">
              Last update · {getAppointmentOutcomeLabel(item.appointment_outcome)}
            </span>
          )}
          {item.deal_value != null && item.deal_value > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-mono font-semibold text-emerald-600">
              <DollarSign className="h-3 w-3" />
              {item.deal_value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
            </span>
          )}
          {item.completed_at && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Completed · {format(new Date(item.completed_at), "MMM d, yyyy")}
            </span>
          )}
        </div>
      </div>

      {!showActions ? (
        isBooked && item.outcome_notes ? (
          <div className="rounded-lg border border-border bg-background/60 p-3 text-sm text-muted-foreground">
            {item.outcome_notes}
          </div>
        ) : null
      ) : (
        <>
          <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap">
            {onAssign && (
              <Select value={item.assigned_user_id} onValueChange={(value) => onAssign(item.id, value)}>
                <SelectTrigger className="w-full bg-background lg:w-[240px]">
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
            )}

            {!isBooked && onReschedule && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start bg-background", !rescheduleDate && "text-muted-foreground")}>
                      <CalendarClock className="h-4 w-4" />
                      {rescheduleDate ? format(rescheduleDate, "PPP") : "Pick a date"}
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
                <Input
                  type="time"
                  value={rescheduleTime}
                  onChange={(event) => setRescheduleTime(event.target.value)}
                  className="w-full bg-background sm:w-[140px]"
                />
                <Button
                  variant="secondary"
                  onClick={() => rescheduleDate && onReschedule(item.id, combineDateTime(rescheduleDate, rescheduleTime))}
                  disabled={!rescheduleDate || isSaving}
                >
                  <Clock3 className="h-4 w-4" />
                  Reschedule
                </Button>
              </div>
            )}

            {!isBooked && onComplete && (
              <Button variant="outline" onClick={() => onComplete(item.id)} className="lg:ml-auto" disabled={isSaving}>
                <Check className="h-4 w-4" />
                Mark complete
              </Button>
            )}
          </div>

          {isBooked && onRecordBookedOutcome && (
            <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Booked outcome</p>
                <p className="text-xs text-muted-foreground">Record the meeting result or move the appointment day.</p>
              </div>

              <Textarea
                value={outcomeNotes}
                onChange={(event) => setOutcomeNotes(event.target.value)}
                placeholder="Optional notes about the appointment result"
                className="min-h-[88px] resize-none bg-background"
              />

              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={dealValue}
                  onChange={(event) => setDealValue(event.target.value)}
                  placeholder="Deal value (for closed deals)"
                  className="w-full bg-background sm:w-[240px]"
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  variant="secondary"
                  onClick={() =>
                    rescheduleDate &&
                    onRecordBookedOutcome(
                      item,
                      "rescheduled",
                      outcomeNotes,
                      combineDateTime(rescheduleDate, BOOKED_APPOINTMENT_DEFAULT_TIME),
                    )
                  }
                  disabled={!rescheduleDate || isSaving}
                >
                  <CalendarClock className="h-4 w-4" />
                  Reschedule
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("justify-start bg-background", !rescheduleDate && "text-muted-foreground")}>
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
                <Button variant="outline" onClick={() => onRecordBookedOutcome(item, "no_show", outcomeNotes)} disabled={isSaving}>
                  No Show
                </Button>
                <Button variant="outline" onClick={() => onRecordBookedOutcome(item, "showed_verbal_commitment", outcomeNotes)} disabled={isSaving}>
                  Verbal Commitment
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const val = dealValue ? parseFloat(dealValue) : undefined;
                    onRecordBookedOutcome(item, "showed_closed", outcomeNotes, undefined, val);
                  }}
                  disabled={isSaving}
                >
                  <DollarSign className="h-4 w-4" />
                  Showed - Closed
                </Button>
                <Button variant="outline" onClick={() => onRecordBookedOutcome(item, "showed_no_close", outcomeNotes)} disabled={isSaving}>
                  Showed - No Close
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
