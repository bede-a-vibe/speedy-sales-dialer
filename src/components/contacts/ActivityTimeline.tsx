import { useMemo } from "react";
import { format, formatDistanceToNowStrict, isSameDay, isToday, isYesterday } from "date-fns";
import { Phone, StickyNote, Calendar, Handshake, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useContactCallLogs } from "@/hooks/useCallLogs";
import { usePaginatedContactNotes } from "@/hooks/useContactNotes";
import { useContactPipelineItems, useSalesReps } from "@/hooks/usePipelineItems";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { formatDurationSeconds } from "@/lib/duration";

type TimelineEntry = {
  id: string;
  kind: "call" | "note" | "pipeline";
  timestamp: string;
  userId?: string | null;
  title: string;
  detail?: string | null;
  meta?: string | null;
  tone?: "default" | "success" | "warning" | "muted";
};

function iconFor(kind: TimelineEntry["kind"], entry: TimelineEntry) {
  if (kind === "call") return <Phone className="h-3.5 w-3.5" />;
  if (kind === "note") return <StickyNote className="h-3.5 w-3.5" />;
  if (entry.meta?.toLowerCase().includes("booked")) return <Handshake className="h-3.5 w-3.5" />;
  return <Calendar className="h-3.5 w-3.5" />;
}

function dayHeading(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, dd MMM yyyy");
}

export function ActivityTimeline({ contactId }: { contactId?: string }) {
  const callLogsQuery = useContactCallLogs(contactId, 25, !!contactId);
  const notesQuery = usePaginatedContactNotes(contactId, 25);
  const pipelineQuery = useContactPipelineItems(contactId);
  const { data: reps = [] } = useSalesReps();

  const repName = useMemo(() => {
    const map = new Map<string, string>();
    reps.forEach((r) => {
      if (r.user_id) map.set(r.user_id, r.display_name || r.email || "Unknown rep");
    });
    return (id?: string | null) => (id ? map.get(id) ?? "Unknown rep" : "System");
  }, [reps]);

  const isLoading = callLogsQuery.isLoading || notesQuery.isLoading || pipelineQuery.isLoading;
  const hasError = callLogsQuery.error || notesQuery.error || pipelineQuery.error;

  const entries = useMemo<TimelineEntry[]>(() => {
    const calls = callLogsQuery.data?.pages.flatMap((p) => p.items) ?? [];
    const notes = notesQuery.data?.pages.flatMap((p) => p.items) ?? [];
    const pipeline = pipelineQuery.data ?? [];

    const items: TimelineEntry[] = [];

    calls.forEach((call) => {
      const cfg = OUTCOME_CONFIG[call.outcome as CallOutcome];
      const durationSecs = call.dialpad_talk_time_seconds ?? call.dialpad_total_duration_seconds ?? 0;
      const parts: string[] = [];
      if (durationSecs > 0) parts.push(formatDurationSeconds(durationSecs));
      if (call.dialpad_call_id) parts.push("Dialpad");
      items.push({
        id: `call-${call.id}`,
        kind: "call",
        timestamp: call.created_at,
        userId: call.user_id,
        title: `Call · ${cfg?.label ?? call.outcome}`,
        detail: call.notes || call.dialpad_summary || null,
        meta: parts.join(" · ") || null,
        tone: call.outcome === "booked" ? "success" : call.outcome === "dnc" ? "warning" : "default",
      });
    });

    notes.forEach((note) => {
      items.push({
        id: `note-${note.id}`,
        kind: "note",
        timestamp: note.created_at,
        userId: note.created_by,
        title: `Note · ${note.source.replace(/_/g, " ")}`,
        detail: note.content,
        tone: "muted",
      });
    });

    pipeline.forEach((item: any) => {
      const isBooked = item.pipeline_type === "booked";
      const parts: string[] = [];
      parts.push(isBooked ? "Appointment" : "Follow-up");
      if (item.status) parts.push(item.status);
      if (item.scheduled_for) parts.push(`for ${format(new Date(item.scheduled_for), "dd MMM · HH:mm")}`);
      if (item.deal_value) parts.push(`$${Number(item.deal_value).toLocaleString()}`);
      if (item.monthly_recurring_value) parts.push(`$${Number(item.monthly_recurring_value).toLocaleString()}/mo`);

      const outcomeLabel = item.appointment_outcome
        ? getAppointmentOutcomeLabel(item.appointment_outcome as AppointmentOutcomeValue)
        : null;

      items.push({
        id: `pipe-${item.id}`,
        kind: "pipeline",
        timestamp: item.created_at,
        userId: item.assigned_user_id || item.created_by,
        title: parts.join(" · "),
        detail: outcomeLabel ? `Outcome: ${outcomeLabel}${item.outcome_notes ? ` — ${item.outcome_notes}` : ""}` : item.notes || null,
        meta: isBooked ? "booked" : "follow_up",
        tone: isBooked ? "success" : "default",
      });
    });

    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [callLogsQuery.data, notesQuery.data, pipelineQuery.data]);

  const groups = useMemo(() => {
    const map: { date: Date; items: TimelineEntry[] }[] = [];
    entries.forEach((e) => {
      const d = new Date(e.timestamp);
      const bucket = map.find((g) => isSameDay(g.date, d));
      if (bucket) bucket.items.push(e);
      else map.push({ date: d, items: [e] });
    });
    return map;
  }, [entries]);

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Activity Timeline
        </CardTitle>
        <Badge variant="outline" className="text-[10px] font-mono">{entries.length} events</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : hasError ? (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> Failed to load activity.
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No activity yet — calls, notes, and pipeline events will appear here.
          </p>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.date.toISOString()} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
                    {dayHeading(group.date)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <ol className="space-y-2">
                  {group.items.map((entry) => (
                    <li key={entry.id} className="flex gap-3 rounded-lg border border-border bg-background p-3">
                      <div
                        className={
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border " +
                          (entry.tone === "success"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                            : entry.tone === "warning"
                              ? "border-destructive/40 bg-destructive/10 text-destructive"
                              : "border-border bg-muted/40 text-muted-foreground")
                        }
                      >
                        {iconFor(entry.kind, entry)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className="text-sm font-medium text-foreground truncate">{entry.title}</p>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {format(new Date(entry.timestamp), "HH:mm")} · {formatDistanceToNowStrict(new Date(entry.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{repName(entry.userId)}</span>
                          {entry.meta && entry.kind === "call" && <span className="font-mono">{entry.meta}</span>}
                        </div>
                        {entry.detail && (
                          <p className="mt-1 text-xs text-foreground whitespace-pre-wrap line-clamp-4">
                            {entry.detail}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
            {(callLogsQuery.hasNextPage || notesQuery.hasNextPage) && (
              <div className="flex justify-center gap-2 pt-2">
                {callLogsQuery.hasNextPage && (
                  <button
                    onClick={() => callLogsQuery.fetchNextPage()}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Load older calls
                  </button>
                )}
                {notesQuery.hasNextPage && (
                  <button
                    onClick={() => notesQuery.fetchNextPage()}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Load older notes
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ActivityTimeline;