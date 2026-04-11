import { format, formatDistanceToNowStrict, isPast, isToday } from "date-fns";
import { AlertTriangle, CalendarClock, Clock3 } from "lucide-react";
import type { PipelineItemWithRelations } from "@/hooks/usePipelineItems";
import { cn } from "@/lib/utils";

type BoardStageKey = "stale" | "today" | "upcoming" | "overdue";

type BoardStage = {
  key: BoardStageKey;
  fallbackTitle: string;
  description: string;
  tone: string;
  emptyLabel: string;
};

const BOARD_STAGES: BoardStage[] = [
  {
    key: "stale",
    fallbackTitle: "Needs Outcome",
    description: "Booked appointments in the past with no result recorded yet.",
    tone: "border-amber-500/40 bg-amber-500/5",
    emptyLabel: "No stale appointments.",
  },
  {
    key: "today",
    fallbackTitle: "Today",
    description: "Appointments happening today.",
    tone: "border-primary/40 bg-primary/5",
    emptyLabel: "Nothing booked for today.",
  },
  {
    key: "upcoming",
    fallbackTitle: "Upcoming",
    description: "Future appointments still on the board.",
    tone: "border-border bg-card",
    emptyLabel: "No upcoming appointments.",
  },
  {
    key: "overdue",
    fallbackTitle: "Overdue",
    description: "Past appointments that already have an outcome but still remain open.",
    tone: "border-destructive/40 bg-destructive/5",
    emptyLabel: "No overdue appointments.",
  },
];

function getBoardStage(item: PipelineItemWithRelations): BoardStageKey {
  const scheduledDate = item.scheduled_for ? new Date(item.scheduled_for) : null;
  if (!scheduledDate) return "upcoming";
  const past = isPast(scheduledDate) && !isToday(scheduledDate);
  if (past && !item.appointment_outcome) return "stale";
  if (past) return "overdue";
  if (isToday(scheduledDate)) return "today";
  return "upcoming";
}

function getScheduleLabel(scheduledFor: string | null) {
  if (!scheduledFor) return { primary: "No appointment date", secondary: null };

  const date = new Date(scheduledFor);
  return {
    primary: format(date, "EEE d MMM, h:mm a"),
    secondary: `${isPast(date) ? "Started" : "Starts"} ${formatDistanceToNowStrict(date, { addSuffix: true })}`,
  };
}

export function BookedPipelineBoard({
  items,
  repMap,
  bookedStageNames = [],
}: {
  items: PipelineItemWithRelations[];
  repMap: Map<string, string>;
  bookedStageNames?: string[];
}) {
  const grouped = BOARD_STAGES.map((stage, index) => ({
    ...stage,
    title: bookedStageNames[index] || stage.fallbackTitle,
    items: items
      .filter((item) => getBoardStage(item) === stage.key)
      .sort((a, b) => {
        const aTime = a.scheduled_for ? new Date(a.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.scheduled_for ? new Date(b.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      }),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Booked pipeline board</h4>
          <p className="text-xs text-muted-foreground">Open booked opportunities grouped into stage columns, using Sales & Growth Sessions names when available.</p>
        </div>
        <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{items.length} open opportunities</p>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {grouped.map((stage) => (
          <section key={stage.key} className={cn("rounded-xl border p-3", stage.tone)}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h5 className="text-sm font-semibold text-foreground">{stage.title}</h5>
                <p className="mt-1 text-[11px] text-muted-foreground">{stage.description}</p>
              </div>
              <div className="rounded-md bg-background/80 px-2 py-1 text-xs font-mono text-foreground">
                {stage.items.length}
              </div>
            </div>

            <div className="space-y-2">
              {stage.items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-background/60 p-3 text-xs text-muted-foreground">
                  {stage.emptyLabel}
                </div>
              ) : (
                stage.items.map((item) => {
                  const schedule = getScheduleLabel(item.scheduled_for);
                  const closer = repMap.get(item.assigned_user_id) || "Unknown rep";
                  const setter = repMap.get(item.created_by) || "Unknown rep";

                  return (
                    <article key={item.id} className="rounded-lg border border-border bg-background/90 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{item.contacts?.business_name || "Unknown business"}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.contacts?.contact_person || "No contact name"}</p>
                        </div>
                        {stage.key === "stale" ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        ) : stage.key === "today" ? (
                          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        ) : (
                          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </div>

                      <div className="mt-3 space-y-2 text-xs">
                        <div>
                          <p className="font-mono text-foreground">{schedule.primary}</p>
                          {schedule.secondary ? <p className="text-muted-foreground">{schedule.secondary}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                          <span>Setter: {setter}</span>
                          <span>Closer: {closer}</span>
                        </div>
                        {item.notes ? <p className="line-clamp-2 italic text-muted-foreground">"{item.notes}"</p> : null}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
