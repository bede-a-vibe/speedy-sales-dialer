import { useMemo, useState } from "react";
import { format, isPast, isToday, addHours } from "date-fns";
import { AlertTriangle, CalendarClock, Check, ChevronDown, ChevronUp, Clock3, ExternalLink, Globe, MapPin, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FollowUpMethodBadge, FollowUpMethodSelector } from "@/components/pipelines/FollowUpMethodSelector";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { PipelineItemWithRelations, SalesRepOption, FollowUpMethod } from "@/hooks/usePipelineItems";

// ---------- Status helpers ----------

type ItemStatus = "overdue" | "today" | "due_soon" | "upcoming";

function getItemStatus(item: PipelineItemWithRelations): ItemStatus {
  const d = item.scheduled_for ? new Date(item.scheduled_for) : null;
  if (!d) return "upcoming";
  if (isPast(d) && !isToday(d)) return "overdue";
  if (isToday(d)) return "today";
  if (d <= addHours(new Date(), 48)) return "due_soon";
  return "upcoming";
}

function StatusPill({ status }: { status: ItemStatus }) {
  const styles: Record<ItemStatus, string> = {
    overdue: "border-destructive/60 text-destructive bg-destructive/10",
    today: "border-primary/60 text-primary bg-primary/10",
    due_soon: "border-amber-500/60 text-amber-600 bg-amber-500/10",
    upcoming: "border-border text-muted-foreground bg-muted/50",
  };
  const labels: Record<ItemStatus, string> = {
    overdue: "Overdue",
    today: "Today",
    due_soon: "Due Soon",
    upcoming: "Upcoming",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", styles[status])}>
      {status === "overdue" && <AlertTriangle className="mr-1 h-3 w-3" />}
      {labels[status]}
    </Badge>
  );
}

// ---------- Types ----------

type StatusFilter = "all" | "overdue" | "today" | "due_soon" | "upcoming";

function getRepLabel(displayName: string | null, email: string | null) {
  return displayName?.trim() || email || "Unassigned";
}

function combineDateTime(date: Date, time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next.toISOString();
}

// ---------- Props ----------

interface FollowUpTableProps {
  items: PipelineItemWithRelations[];
  reps: SalesRepOption[];
  repMap: Map<string, string>;
  isSaving: boolean;
  onComplete: (id: string) => Promise<void>;
  onAssign: (id: string, userId: string) => Promise<void>;
  onReschedule: (id: string, iso: string) => Promise<void>;
  onChangeMethod: (id: string, method: FollowUpMethod) => Promise<void>;
}

// ---------- Expanded action panel ----------

function FollowUpActionPanel({
  item,
  reps,
  isSaving,
  onComplete,
  onAssign,
  onReschedule,
  onChangeMethod,
}: {
  item: PipelineItemWithRelations;
  reps: SalesRepOption[];
  isSaving: boolean;
  onComplete: (id: string) => Promise<void>;
  onAssign: (id: string, userId: string) => Promise<void>;
  onReschedule: (id: string, iso: string) => Promise<void>;
  onChangeMethod: (id: string, method: FollowUpMethod) => Promise<void>;
}) {
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    item.scheduled_for ? new Date(item.scheduled_for) : undefined,
  );
  const [rescheduleTime, setRescheduleTime] = useState(
    item.scheduled_for ? format(new Date(item.scheduled_for), "HH:mm") : "09:00",
  );

  return (
    <div className="space-y-3">
      {/* Contact details */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <a href={`tel:${item.contacts?.phone || ""}`} className="inline-flex items-center gap-1 hover:text-foreground">
          <Phone className="h-3 w-3" /> {item.contacts?.phone}
        </a>
        <span>{item.contacts?.industry}</span>
        {item.contacts?.state && <span>{item.contacts.state}</span>}
        {item.contacts?.website && (
          <a href={item.contacts.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            <Globe className="h-3 w-3" /> Website <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        {item.contacts?.gmb_link && (
          <a href={item.contacts.gmb_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            <MapPin className="h-3 w-3" /> GMB <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
      {item.notes && <p className="text-xs italic text-muted-foreground">"{item.notes}"</p>}

      {/* Actions row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <FollowUpMethodSelector
          value={item.follow_up_method || "call"}
          onChange={(method) => onChangeMethod(item.id, method)}
        />

        <Select value={item.assigned_user_id} onValueChange={(value) => onAssign(item.id, value)}>
          <SelectTrigger className="w-full bg-background sm:w-[200px]">
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

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn("justify-start bg-background", !rescheduleDate && "text-muted-foreground")}>
                <CalendarClock className="h-4 w-4" />
                {rescheduleDate ? format(rescheduleDate, "MMM d") : "Date"}
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
            onChange={(e) => setRescheduleTime(e.target.value)}
            className="w-[110px] bg-background"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => rescheduleDate && onReschedule(item.id, combineDateTime(rescheduleDate, rescheduleTime))}
            disabled={!rescheduleDate || isSaving}
          >
            <Clock3 className="h-4 w-4" />
            Reschedule
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={() => onComplete(item.id)} disabled={isSaving} className="sm:ml-auto">
          <Check className="h-4 w-4" />
          Mark complete
        </Button>
      </div>
    </div>
  );
}

// ---------- Main component ----------

export function FollowUpTable({
  items,
  reps,
  repMap,
  isSaving,
  onComplete,
  onAssign,
  onReschedule,
  onChangeMethod,
}: FollowUpTableProps) {
  const isMobile = useIsMobile();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [repFilter, setRepFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [methodFilter, setMethodFilter] = useState<FollowUpMethod | "all">("all");

  const enriched = useMemo(
    () =>
      items.map((item) => ({
        item,
        status: getItemStatus(item),
        rep: repMap.get(item.assigned_user_id) || "Unknown",
      })),
    [items, repMap],
  );

  const filtered = useMemo(() => {
    let list = enriched;
    if (repFilter !== "all") list = list.filter((r) => r.item.assigned_user_id === repFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (methodFilter !== "all") list = list.filter((r) => (r.item.follow_up_method || "call") === methodFilter);
    const order: Record<string, number> = { overdue: 0, today: 1, due_soon: 2, upcoming: 3 };
    return [...list].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
  }, [enriched, repFilter, statusFilter, methodFilter]);

  const overdueCount = enriched.filter((r) => r.status === "overdue").length;
  const todayCount = enriched.filter((r) => r.status === "today").length;

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  // ---- Filters bar ----
  const filtersBar = (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="text-xs font-mono text-muted-foreground">
        {filtered.length} follow-ups
        {overdueCount > 0 && <span className="text-destructive"> · {overdueCount} overdue</span>}
        {todayCount > 0 && <span className="text-primary"> · {todayCount} today</span>}
      </span>

      <Select value={methodFilter} onValueChange={(v) => setMethodFilter(v as FollowUpMethod | "all")}>
        <SelectTrigger className="w-[150px] bg-background">
          <SelectValue placeholder="All methods" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All methods</SelectItem>
          <SelectItem value="call">Call</SelectItem>
          <SelectItem value="email">Email</SelectItem>
          <SelectItem value="prospecting">Prospecting</SelectItem>
        </SelectContent>
      </Select>

      <Select value={repFilter} onValueChange={setRepFilter}>
        <SelectTrigger className="w-[200px] bg-background">
          <SelectValue placeholder="All reps" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All reps</SelectItem>
          {reps.map((rep) => (
            <SelectItem key={rep.user_id} value={rep.user_id}>
              {getRepLabel(rep.display_name, rep.email)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <SelectTrigger className="w-[160px] bg-background">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="due_soon">Due Soon</SelectItem>
          <SelectItem value="upcoming">Upcoming</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {filtersBar}
        <div className="py-20 text-center text-sm text-muted-foreground">No open follow-ups.</div>
      </div>
    );
  }

  // ---- Mobile: condensed card layout ----
  if (isMobile) {
    return (
      <div className="space-y-3">
        {filtersBar}
        {filtered.map(({ item, status, rep }) => (
          <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={() => toggle(item.id)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "w-full flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50",
                  status === "overdue" && "border-destructive/40 bg-destructive/5",
                  status === "today" && "border-primary/40 bg-primary/5",
                  status === "due_soon" && "border-amber-500/60 bg-amber-500/5",
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-foreground truncate">{item.contacts?.business_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.scheduled_for ? format(new Date(item.scheduled_for), "MMM d, yyyy h:mm a") : "No date"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{rep}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <FollowUpMethodBadge method={item.follow_up_method || "call"} />
                  <StatusPill status={status} />
                  {expandedId === item.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-1 pt-2">
                <FollowUpActionPanel
                  item={item}
                  reps={reps}
                  isSaving={isSaving}
                  onComplete={onComplete}
                  onAssign={onAssign}
                  onReschedule={onReschedule}
                  onChangeMethod={onChangeMethod}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    );
  }

  // ---- Desktop: table layout ----
  return (
    <div className="space-y-3">
      {filtersBar}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Business</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Method</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Scheduled</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Rep</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ item, status, rep }) => {
              const isOpen = expandedId === item.id;
              return (
                <Collapsible key={item.id} asChild open={isOpen} onOpenChange={() => toggle(item.id)}>
                  <>
                    <CollapsibleTrigger asChild>
                      <tr
                        className={cn(
                          "border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-muted/40",
                          status === "overdue" && "bg-destructive/5",
                          status === "today" && "bg-primary/5",
                          status === "due_soon" && "bg-amber-500/5",
                          isOpen && "bg-muted/30",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{item.contacts?.business_name}</div>
                          <div className="text-xs text-muted-foreground">{item.contacts?.contact_person || "No contact"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <FollowUpMethodBadge method={item.follow_up_method || "call"} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {item.scheduled_for ? format(new Date(item.scheduled_for), "MMM d, yyyy h:mm a") : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{rep}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={status} />
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </td>
                      </tr>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <tr className="border-b border-border last:border-b-0">
                        <td colSpan={6} className="px-4 py-3 bg-muted/20">
                          <FollowUpActionPanel
                            item={item}
                            reps={reps}
                            isSaving={isSaving}
                            onComplete={onComplete}
                            onAssign={onAssign}
                            onReschedule={onReschedule}
                            onChangeMethod={onChangeMethod}
                          />
                        </td>
                      </tr>
                    </CollapsibleContent>
                  </>
                </Collapsible>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
