import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNowStrict, isSameDay, isToday, isYesterday } from "date-fns";
import { Phone, StickyNote, Calendar, Handshake, AlertCircle, Sparkles, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useContactCallLogs } from "@/hooks/useCallLogs";
import { usePaginatedContactNotes } from "@/hooks/useContactNotes";
import { useContactPipelineItems, useSalesReps } from "@/hooks/usePipelineItems";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { formatDurationSeconds } from "@/lib/duration";

const NEPQ_STAGES = [
  { key: "connection", label: "Connection" },
  { key: "situation", label: "Situation" },
  { key: "problem_awareness", label: "Problem" },
  { key: "solution_awareness", label: "Solution" },
  { key: "consequence", label: "Consequence" },
  { key: "transition", label: "Transition" },
  { key: "presentation", label: "Presentation" },
  { key: "commitment", label: "Commitment" },
] as const;

type NepqStageKey = typeof NEPQ_STAGES[number]["key"];

type Scorecard = {
  nepq_scores: Partial<Record<NepqStageKey, number>>;
  overall_score: number;
  broke_down_at: NepqStageKey | "none";
  what_went_well: string[];
  coaching_tips: Array<{ stage: NepqStageKey; tip: string }>;
  booking_blocker: string;
};

function useContactCallScores(contactId?: string) {
  return useQuery({
    queryKey: ["contact-call-scores", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_scores")
        .select("id, call_log_id, dialpad_call_id, overall_score, broke_down_at, booking_blocker, scorecard, created_at")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

function scoreTone(score: number) {
  if (score >= 75) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function CallCoachingCard({ score }: { score: any }) {
  const card = score.scorecard as Scorecard;
  if (!card || !card.nepq_scores) return null;
  const isBooked = card.broke_down_at === "none" || card.booking_blocker?.toLowerCase() === "booked";

  return (
    <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] uppercase tracking-widest text-primary font-medium">Call Coaching · NEPQ</span>
        <span className={`ml-auto font-mono text-lg font-semibold ${scoreTone(score.overall_score ?? 0)}`}>
          {score.overall_score ?? 0}
          <span className="text-[10px] text-muted-foreground ml-0.5">/100</span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5 mb-2">
        {NEPQ_STAGES.map((stage) => {
          const val = Math.max(0, Math.min(5, Number(card.nepq_scores[stage.key] ?? 0)));
          const broke = card.broke_down_at === stage.key;
          return (
            <div key={stage.key} className={`rounded border p-1.5 ${broke ? "border-destructive/60 bg-destructive/10" : "border-border bg-background"}`}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground truncate">{stage.label}</span>
                <span className="text-[10px] font-mono font-medium">{val}</span>
              </div>
              <div className="mt-1 flex gap-[2px]">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-sm ${i <= val ? (broke ? "bg-destructive" : "bg-primary") : "bg-muted"}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {card.booking_blocker && (
        <div className={`flex items-start gap-1.5 rounded px-2 py-1.5 text-xs ${isBooked ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-destructive/10 text-destructive"}`}>
          {isBooked ? <Handshake className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          <span>
            <span className="font-medium">{isBooked ? "Booked" : "Blocker"}:</span> {card.booking_blocker}
          </span>
        </div>
      )}

      {card.what_went_well?.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">What went well</p>
          <ul className="space-y-0.5 text-xs text-foreground">
            {card.what_went_well.map((w, i) => (
              <li key={i}>✓ {w}</li>
            ))}
          </ul>
        </div>
      )}

      {card.coaching_tips?.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Coaching tips</p>
          <ul className="space-y-1 text-xs text-foreground">
            {card.coaching_tips.map((t, i) => (
              <li key={i} className="flex gap-1.5">
                <Badge variant="outline" className="text-[9px] shrink-0 h-4 px-1">{t.stage.replace(/_/g, " ")}</Badge>
                <span className="flex-1">{t.tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type TimelineEntry = {
  id: string;
  kind: "call" | "note" | "pipeline";
  timestamp: string;
  userId?: string | null;
  title: string;
  detail?: string | null;
  meta?: string | null;
  tone?: "default" | "success" | "warning" | "muted";
  callLogId?: string | null;
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
  const scoresQuery = useContactCallScores(contactId);

  const scoresByCallLog = useMemo(() => {
    const map = new Map<string, any>();
    (scoresQuery.data ?? []).forEach((s: any) => {
      if (s.call_log_id && !map.has(s.call_log_id)) map.set(s.call_log_id, s);
    });
    return map;
  }, [scoresQuery.data]);

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
        callLogId: call.id,
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
                        {entry.kind === "call" && entry.callLogId && scoresByCallLog.has(entry.callLogId) && (
                          <CallCoachingCard score={scoresByCallLog.get(entry.callLogId)} />
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