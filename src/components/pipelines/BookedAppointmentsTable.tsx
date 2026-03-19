import { useMemo, useState } from "react";
import { format, isPast, isToday } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronUp, DollarSign, ExternalLink, Globe, MapPin, Phone, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { BookedOutcomePanel } from "./BookedOutcomePanel";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import type { PipelineItemWithRelations, SalesRepOption } from "@/hooks/usePipelineItems";

type StatusFilter = "all" | "stale" | "today" | "upcoming" | "overdue";

function getRepLabel(displayName: string | null, email: string | null) {
  return displayName?.trim() || email || "Unassigned";
}

type ItemStatus = "stale" | "overdue" | "today" | "upcoming";

function getItemStatus(item: PipelineItemWithRelations): ItemStatus {
  const scheduledDate = item.scheduled_for ? new Date(item.scheduled_for) : null;
  if (!scheduledDate) return "upcoming";
  const past = isPast(scheduledDate) && !isToday(scheduledDate);
  const todayFlag = isToday(scheduledDate);
  if (past && !item.appointment_outcome) return "stale";
  if (past) return "overdue";
  if (todayFlag) return "today";
  return "upcoming";
}

function StatusPill({ status }: { status: ItemStatus }) {
  const styles: Record<string, string> = {
    stale: "border-amber-500/60 text-amber-600 bg-amber-500/10",
    overdue: "border-destructive/60 text-destructive bg-destructive/10",
    today: "border-primary/60 text-primary bg-primary/10",
    upcoming: "border-border text-muted-foreground bg-muted/50",
  };
  const labels: Record<string, string> = {
    stale: "Needs Outcome",
    overdue: "Overdue",
    today: "Today",
    upcoming: "Upcoming",
  };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-semibold", styles[status])}>
      {status === "stale" && <AlertTriangle className="mr-1 h-3 w-3" />}
      {labels[status]}
    </Badge>
  );
}

interface BookedAppointmentsTableProps {
  items: PipelineItemWithRelations[];
  reps: SalesRepOption[];
  repMap: Map<string, string>;
  isSaving: boolean;
  onAssign: (id: string, userId: string) => Promise<void>;
  onRecordOutcome: (
    item: PipelineItemWithRelations,
    outcome: AppointmentOutcomeValue,
    notes: string,
    scheduledFor?: string,
    dealValue?: number,
  ) => Promise<void>;
}

export function BookedAppointmentsTable({
  items,
  reps,
  repMap,
  isSaving,
  onAssign,
  onRecordOutcome,
}: BookedAppointmentsTableProps) {
  const isMobile = useIsMobile();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [closerFilter, setCloserFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const enriched = useMemo(
    () =>
      items.map((item) => ({
        item,
        status: getItemStatus(item),
        setter: repMap.get(item.created_by) || "Unknown",
        closer: repMap.get(item.assigned_user_id) || "Unknown",
      })),
    [items, repMap],
  );

  const filtered = useMemo(() => {
    let list = enriched;
    if (closerFilter !== "all") list = list.filter((r) => r.item.assigned_user_id === closerFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    // Sort: stale first, then today, then upcoming, then overdue
    const order: Record<string, number> = { stale: 0, today: 1, upcoming: 2, overdue: 3 };
    return [...list].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
  }, [enriched, closerFilter, statusFilter]);

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  // ---- Filters bar ----
  const filtersBar = (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="text-xs font-mono text-muted-foreground">{filtered.length} appointments</span>
      <Select value={closerFilter} onValueChange={setCloserFilter}>
        <SelectTrigger className="w-[200px] bg-background">
          <SelectValue placeholder="All closers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All closers</SelectItem>
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
          <SelectItem value="stale">Needs Outcome</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="upcoming">Upcoming</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {filtersBar}
        <div className="py-20 text-center text-sm text-muted-foreground">No open booked appointments.</div>
      </div>
    );
  }

  // ---- Mobile: condensed card layout ----
  if (isMobile) {
    return (
      <div className="space-y-3">
        {filtersBar}
        {filtered.map(({ item, status, setter, closer }) => (
          <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={() => toggle(item.id)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className={cn(
                  "w-full flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50",
                  status === "stale" && "border-amber-500/60 bg-amber-500/5",
                  status === "overdue" && "border-destructive/40 bg-destructive/5",
                  status === "today" && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-foreground truncate">{item.contacts?.business_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.scheduled_for ? format(new Date(item.scheduled_for), "MMM d, yyyy") : "No date"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>S: {setter}</span>
                    <span>·</span>
                    <span>C: {closer}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <StatusPill status={status} />
                  {item.reschedule_count > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">×{item.reschedule_count}</span>
                  )}
                  {expandedId === item.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-1 pt-2">
                <div className="mb-2 space-y-1 text-xs text-muted-foreground">
                  <p>{item.contacts?.contact_person || "No contact"} · {item.contacts?.industry}</p>
                  <a href={`tel:${item.contacts?.phone || ""}`} className="inline-flex items-center gap-1 hover:text-foreground">
                    <Phone className="h-3 w-3" /> {item.contacts?.phone}
                  </a>
                  <div className="flex flex-wrap gap-3">
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
                  {item.notes && <p className="italic">"{item.notes}"</p>}
                </div>
                <BookedOutcomePanel item={item} reps={reps} isSaving={isSaving} onAssign={onAssign} onRecordOutcome={onRecordOutcome} />
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
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Date</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Setter</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Closer</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Resch.</th>
              <th className="px-4 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ item, status, setter, closer }) => {
              const isOpen = expandedId === item.id;
              return (
                <Collapsible key={item.id} asChild open={isOpen} onOpenChange={() => toggle(item.id)}>
                  <>
                    <CollapsibleTrigger asChild>
                      <tr
                        className={cn(
                          "border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-muted/40",
                          status === "stale" && "bg-amber-500/5",
                          status === "overdue" && "bg-destructive/5",
                          status === "today" && "bg-primary/5",
                          isOpen && "bg-muted/30",
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{item.contacts?.business_name}</div>
                          <div className="text-xs text-muted-foreground">{item.contacts?.contact_person || "No contact"}</div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {item.scheduled_for ? format(new Date(item.scheduled_for), "MMM d, yyyy") : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{setter}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{closer}</td>
                        <td className="px-4 py-3">
                          <StatusPill status={status} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.reschedule_count > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">
                              <RefreshCw className="mr-1 h-3 w-3" />×{item.reschedule_count}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
                        <td colSpan={7} className="px-4 py-3 bg-muted/20">
                          <div className="space-y-2">
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
                              {item.deal_value != null && item.deal_value > 0 && (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 font-mono font-semibold text-emerald-600">
                                  <DollarSign className="h-3 w-3" />
                                  {item.deal_value.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                </span>
                              )}
                              {item.appointment_outcome && (
                                <span className="rounded bg-secondary px-2 py-0.5 font-mono uppercase tracking-widest text-secondary-foreground">
                                  {getAppointmentOutcomeLabel(item.appointment_outcome)}
                                </span>
                              )}
                            </div>
                            {item.notes && <p className="text-xs italic text-muted-foreground">"{item.notes}"</p>}
                            <BookedOutcomePanel
                              item={item}
                              reps={reps}
                              isSaving={isSaving}
                              onAssign={onAssign}
                              onRecordOutcome={onRecordOutcome}
                            />
                          </div>
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
