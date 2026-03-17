import { useMemo, useState } from "react";
import { format, isToday, isPast } from "date-fns";
import { CalendarClock, Check, Clock3, Phone, UserRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { usePipelineItems, useSalesReps, useUpdatePipelineItem, type PipelineItemWithRelations } from "@/hooks/usePipelineItems";

function getRepLabel(displayName: string | null, email: string | null) {
  return displayName?.trim() || email || "Unassigned";
}

function combineDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next.toISOString();
}

function PipelineCard({
  item,
  repName,
  reps,
  onComplete,
  onAssign,
  onReschedule,
}: {
  item: PipelineItemWithRelations;
  repName: string;
  reps: { user_id: string; display_name: string | null; email: string | null }[];
  onComplete: (id: string) => Promise<void>;
  onAssign: (id: string, userId: string) => Promise<void>;
  onReschedule?: (id: string, iso: string) => Promise<void>;
}) {
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(item.scheduled_for ? new Date(item.scheduled_for) : undefined);
  const [rescheduleTime, setRescheduleTime] = useState(item.scheduled_for ? format(new Date(item.scheduled_for), "HH:mm") : "09:00");

  const scheduledDate = item.scheduled_for ? new Date(item.scheduled_for) : null;
  const overdue = !!scheduledDate && isPast(scheduledDate) && !isToday(scheduledDate);
  const today = !!scheduledDate && isToday(scheduledDate);

  return (
    <div className={cn(
      "rounded-lg border p-4 flex flex-col gap-4 bg-card",
      overdue && "border-destructive/40 bg-destructive/5",
      today && "border-primary/40 bg-primary/5"
    )}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">{item.contacts?.business_name}</p>
          <p className="text-xs text-muted-foreground">
            {item.contacts?.contact_person || "No contact"} · {item.contacts?.industry || "Unknown industry"}
          </p>
          {item.notes && <p className="text-xs italic text-muted-foreground">“{item.notes}”</p>}
          <a href={`tel:${item.contacts?.phone || ""}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Phone className="h-3 w-3" /> {item.contacts?.phone}
          </a>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          {scheduledDate && (
            <div className="text-right">
              <p className="text-xs font-mono text-foreground">{format(scheduledDate, "MMM d, yyyy h:mm a")}</p>
              {overdue && <span className="text-[10px] font-semibold uppercase tracking-widest text-destructive">Overdue</span>}
              {today && <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Today</span>}
            </div>
          )}
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <UserRound className="h-3 w-3" /> {repName}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row">
        <Select defaultValue={item.assigned_user_id} onValueChange={(value) => onAssign(item.id, value)}>
          <SelectTrigger className="w-full lg:w-[240px] bg-background">
            <SelectValue placeholder="Assign rep" />
          </SelectTrigger>
          <SelectContent>
            {reps.map((rep) => (
              <SelectItem key={rep.user_id} value={rep.user_id}>
                {getRepLabel(rep.display_name, rep.email)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {onReschedule && (
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
              className="w-full sm:w-[140px] bg-background"
            />
            <Button
              variant="secondary"
              onClick={() => rescheduleDate && onReschedule(item.id, combineDateTime(rescheduleDate, rescheduleTime))}
              disabled={!rescheduleDate}
            >
              <Clock3 className="h-4 w-4" />
              Reschedule
            </Button>
          </div>
        )}

        <Button variant="outline" onClick={() => onComplete(item.id)} className="lg:ml-auto">
          <Check className="h-4 w-4" />
          Mark complete
        </Button>
      </div>
    </div>
  );
}

export default function PipelinesPage() {
  const [tab, setTab] = useState<"follow_up" | "booked">("follow_up");
  const { data: followUps = [], isLoading: followUpsLoading } = usePipelineItems("follow_up");
  const { data: booked = [], isLoading: bookedLoading } = usePipelineItems("booked");
  const { data: reps = [] } = useSalesReps();
  const updatePipelineItem = useUpdatePipelineItem();

  const repMap = useMemo(
    () => new Map(reps.map((rep) => [rep.user_id, getRepLabel(rep.display_name, rep.email)])),
    [reps]
  );

  const handleComplete = async (id: string) => {
    await updatePipelineItem.mutateAsync({ id, status: "completed" });
  };

  const handleAssign = async (id: string, userId: string) => {
    await updatePipelineItem.mutateAsync({ id, assigned_user_id: userId });
  };

  const handleReschedule = async (id: string, iso: string) => {
    await updatePipelineItem.mutateAsync({ id, scheduled_for: iso });
  };

  const renderItems = (items: PipelineItemWithRelations[], type: "follow_up" | "booked") => {
    if ((type === "follow_up" && followUpsLoading) || (type === "booked" && bookedLoading)) {
      return <div className="py-20 text-center text-sm font-mono text-muted-foreground animate-pulse">Loading...</div>;
    }

    if (items.length === 0) {
      return <div className="py-20 text-center text-sm text-muted-foreground">No open {type === "follow_up" ? "follow-ups" : "booked appointments"}.</div>;
    }

    return (
      <div className="space-y-3">
        {items.map((item) => (
          <PipelineCard
            key={item.id}
            item={item}
            repName={repMap.get(item.assigned_user_id) || "Unknown rep"}
            reps={reps}
            onComplete={handleComplete}
            onAssign={handleAssign}
            onReschedule={type === "follow_up" ? handleReschedule : undefined}
          />
        ))}
      </div>
    );
  };

  return (
    <AppLayout title="Pipelines">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Appointment pipelines</h3>
            <p className="text-sm text-muted-foreground">Track open follow-ups and booked appointments in one place.</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span>{followUps.length} follow-ups</span>
            <span>{booked.length} booked</span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as "follow_up" | "booked") }>
          <TabsList>
            <TabsTrigger value="follow_up">Follow-ups</TabsTrigger>
            <TabsTrigger value="booked">Booked</TabsTrigger>
          </TabsList>
          <TabsContent value="follow_up" className="mt-4">
            {renderItems(followUps, "follow_up")}
          </TabsContent>
          <TabsContent value="booked" className="mt-4">
            {renderItems(booked, "booked")}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
