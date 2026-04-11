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
  repAction: string;
  automationCue: string;
};

const BOARD_STAGES: BoardStage[] = [
  {
    key: "stale",
    fallbackTitle: "Needs Outcome",
    description: "Booked appointments in the past with no result recorded yet.",
    tone: "border-amber-500/40 bg-amber-500/5",
    emptyLabel: "No stale appointments.",
    repAction: "Call the rep or client now and record the result before booking anything new.",
    automationCue: "Best automation: trigger an outcome-missing alert and manager follow-up task.",
  },
  {
    key: "today",
    fallbackTitle: "Today",
    description: "Appointments happening today.",
    tone: "border-primary/40 bg-primary/5",
    emptyLabel: "Nothing booked for today.",
    repAction: "Confirm attendance, prep handoff notes, and watch for same-day reschedules.",
    automationCue: "Best automation: send reminder workflows and surface same-day risk flags.",
  },
  {
    key: "upcoming",
    fallbackTitle: "Upcoming",
    description: "Future appointments still on the board.",
    tone: "border-border bg-card",
    emptyLabel: "No upcoming appointments.",
    repAction: "Keep these clean: correct owner, date, and notes so the closer lands warm.",
    automationCue: "Best automation: pre-appointment reminders and prep task creation.",
  },
  {
    key: "overdue",
    fallbackTitle: "Overdue",
    description: "Past appointments that already have an outcome but still remain open.",
    tone: "border-destructive/40 bg-destructive/5",
    emptyLabel: "No overdue appointments.",
    repAction: "Close or reschedule immediately so reporting and follow-up routing stay accurate.",
    automationCue: "Best automation: auto-close completed outcomes or create reschedule tasks.",
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
  bookedPipelineName,
  bookedEntryStageName,
}: {
  items: PipelineItemWithRelations[];
  repMap: Map<string, string>;
  bookedPipelineName?: string | null;
  bookedEntryStageName?: string | null;
}) {
  const grouped = BOARD_STAGES.map((stage) => ({
    ...stage,
    title: stage.fallbackTitle,
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
          <h4 className="text-sm font-semibold text-foreground">Booked execution board</h4>
          <p className="text-xs text-muted-foreground">
            Open booked opportunities grouped by appointment timing so reps can work the queue after routing lands in{" "}
            <span className="font-medium text-foreground">{bookedPipelineName ?? "Sales & Growth Sessions"}</span>
            {bookedEntryStageName ? <span className="text-muted-foreground"> {"→"} {bookedEntryStageName}</span> : null}.
          </p>
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

            <div className="mb-3 rounded-lg border border-border/70 bg-background/70 p-2.5 text-[11px]">
              <p className="font-medium text-foreground">Rep move</p>
              <p className="mt-1 text-muted-foreground">{stage.repAction}</p>
              <p className="mt-2 font-medium text-foreground">Automation cue</p>
              <p className="mt-1 text-muted-foreground">{stage.automationCue}</p>
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
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {stage.key === "stale"
                              ? "Needs result"
                              : stage.key === "today"
                                ? "Same-day watch"
                                : stage.key === "overdue"
                                  ? "Close or reschedule"
                                  : "Prep sequence"}
                          </span>
                          <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            {item.appointment_outcome ? `Outcome: ${item.appointment_outcome.replaceAll("_", " ")}` : "Outcome pending"}
                          </span>
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
