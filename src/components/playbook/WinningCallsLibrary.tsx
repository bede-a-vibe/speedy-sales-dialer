import { useMemo, useState } from "react";
import { Trophy, ChevronDown, ChevronRight, Clock, Video, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { useWinningCalls, type WinningCallResult } from "@/hooks/useWinningCalls";
import { formatTalk } from "@/hooks/useDialpadCallStats";

interface ClientMeeting {
  id: string;
  title: string;
  meeting_date: string | null;
  fathom_url: string;
  kind: string;
  contact: { business_name: string | null } | null;
}

function useClientMeetings() {
  return useQuery({
    queryKey: ["client-meetings"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_meetings")
        .select("id, title, meeting_date, fathom_url, kind, contact:contacts(business_name)")
        .order("meeting_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientMeeting[];
    },
  });
}

const RESULT_CONFIG: Record<WinningCallResult, { label: string; className: string }> = {
  showed_closed: { label: "Showed & Closed 🏆", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  showed: { label: "Showed", className: "border-primary/40 bg-primary/10 text-primary" },
  pending: { label: "Appointment pending", className: "border-border bg-muted text-muted-foreground" },
  no_show: { label: "No-show", className: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
};

const FILTERS: { value: WinningCallResult | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "showed_closed", label: "Showed & closed" },
  { value: "showed", label: "Showed" },
  { value: "pending", label: "Pending" },
  { value: "no_show", label: "No-show" },
];

/**
 * Real booking-call transcripts, sorted by what the booking became.
 * The "Showed & Closed" ones are the gold-standard calls to study.
 */
export function WinningCallsLibrary() {
  const { data: calls = [], isLoading } = useWinningCalls();
  const { data: meetings = [] } = useClientMeetings();
  const { data: reps = [] } = useSalesReps();
  const [filter, setFilter] = useState<WinningCallResult | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const repName = useMemo(() => {
    const m = new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Rep"]));
    return (uid: string) => m.get(uid) ?? "Rep";
  }, [reps]);

  const filtered = filter === "all" ? calls : calls.filter((c) => c.result === filter);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-primary" /> Winning Calls
        </CardTitle>
        <CardDescription>
          Real transcripts of calls that booked an appointment — study the ones that showed and closed.
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                filter === f.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-muted-foreground/50",
              )}
            >
              {f.label}
              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                {f.value === "all" ? calls.length : calls.filter((c) => c.result === f.value).length}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No booked-call transcripts here yet — they appear automatically as booked calls are transcribed.
          </p>
        )}
        {filtered.map((c) => {
          const cfg = RESULT_CONFIG[c.result];
          const isOpen = openId === c.callLogId;
          return (
            <div key={c.callLogId} className="rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : c.callLogId)}
                className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.businessName}</span>
                <Badge variant="outline" className={cn("text-[10px]", cfg.className)}>{cfg.label}</Badge>
                {c.talkSeconds != null && (
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" /> {formatTalk(c.talkSeconds)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {repName(c.repUserId)} · {new Date(c.calledAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-border px-4 py-3">
                  <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
                    {c.transcript}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        {meetings.length > 0 && (
          <div className="pt-4">
            <div className="mb-2 flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-semibold text-foreground">Closing sessions on Fathom</h4>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Full video recordings of the strategy sessions and onboardings behind signed clients.
            </p>
            <div className="space-y-1.5">
              {meetings.map((m) => (
                <a
                  key={m.id}
                  href={m.fathom_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-sm transition-colors hover:border-primary/40"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                  <Badge variant="outline" className={cn("text-[10px]", m.kind === "sales_call" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground")}>
                    {m.kind === "sales_call" ? "Sales call" : "Onboarding"}
                  </Badge>
                  {m.meeting_date && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(m.meeting_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
