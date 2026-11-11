import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { MessagesSquare, Quote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { formatTalk } from "@/hooks/useDialpadCallStats";
import { OUTCOME_CONFIG } from "@/data/constants";
import type { CallOutcome } from "@/data/mockData";
import { cn } from "@/lib/utils";

/** A call counts as a conversation when the prospect was reached or it ran 30s+. */
const MIN_TALK_SECONDS = 30;
/** Skip the call the rep is on right now, which may already be logged. */
const SELF_NOISE_MINUTES = 10;

interface ConversationRow {
  id: string;
  created_at: string;
  user_id: string | null;
  outcome: CallOutcome;
  dialpad_talk_time_seconds: number | null;
  notes: string | null;
}

interface LeadIntel {
  call_intel_summary: string | null;
  call_intel_at: string | null;
  key_quote: string | null;
  key_objection: string | null;
  objection_notes: string | null;
  agreed_next_steps: string | null;
  marketing_pain_points: string | null;
  buying_timeline: string | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Melbourne",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm leading-snug">
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label} </span>
      <span className="text-foreground">{children}</span>
    </div>
  );
}

/**
 * Who last spoke to this lead, when, what it was about and what they said, so
 * a rep picks up where the last conversation left off. The summary, quote and
 * objection come from the call-intel backfill; the latest call's own notes
 * fill in when that summary predates it.
 */
export function LastConversationCard({ contactId }: { contactId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data: reps = [] } = useSalesReps();

  const { data } = useQuery({
    queryKey: ["last-conversation", contactId],
    staleTime: 60_000,
    queryFn: async () => {
      const cutoff = new Date(Date.now() - SELF_NOISE_MINUTES * 60_000).toISOString();
      const [convos, dials, intel] = await Promise.all([
        supabase
          .from("call_logs")
          .select("id, created_at, user_id, outcome, dialpad_talk_time_seconds, notes")
          .eq("contact_id", contactId)
          .lt("created_at", cutoff)
          .or(`reached_connection.eq.true,dialpad_talk_time_seconds.gte.${MIN_TALK_SECONDS}`)
          .order("created_at", { ascending: false })
          .limit(4),
        supabase
          .from("call_logs")
          .select("id", { count: "exact", head: true })
          .eq("contact_id", contactId)
          .lt("created_at", cutoff),
        supabase
          .from("contacts")
          .select("call_intel_summary, call_intel_at, key_quote, key_objection, objection_notes, agreed_next_steps, marketing_pain_points, buying_timeline")
          .eq("id", contactId)
          .maybeSingle(),
      ]);
      if (convos.error) throw convos.error;
      return {
        conversations: (convos.data ?? []) as ConversationRow[],
        dialCount: dials.count ?? 0,
        intel: (intel.data ?? null) as LeadIntel | null,
      };
    },
  });

  const conversations = data?.conversations ?? [];
  if (conversations.length === 0) return null;

  const repName = (id: string | null) => {
    const rep = reps.find((r) => r.user_id === id);
    return rep?.display_name || rep?.email?.split("@")[0] || "Unknown rep";
  };
  const last = conversations[0];
  const intel = data?.intel;
  // The brief covers every call up to call_intel_at. When the latest
  // conversation came after it, lead with that call's own notes instead.
  const summaryCoversLast = Boolean(intel?.call_intel_at && intel.call_intel_at >= last.created_at);
  const summary = intel?.call_intel_summary?.trim() || null;
  const lastNotes = last.notes?.trim() || null;
  const outcomeLabel = OUTCOME_CONFIG[last.outcome]?.label ?? last.outcome;
  const earlier = conversations.slice(1);

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3" data-coach-step="last-conversation">
      <div className="flex items-start gap-2.5">
        <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-primary">Last conversation</p>
            <p className="text-sm">
              <span className="font-semibold">{repName(last.user_id)}</span>
              {" spoke to them "}
              <span className="font-semibold">{when(last.created_at)}</span>
              <span className="text-muted-foreground">
                {" "}({formatDistanceToNowStrict(new Date(last.created_at), { addSuffix: true })})
                {last.dialpad_talk_time_seconds ? ` · ${formatTalk(last.dialpad_talk_time_seconds)} talk` : ""}
                {` · ${outcomeLabel}`}
              </span>
            </p>
          </div>

          {(lastNotes && !summaryCoversLast) && <Detail label="Rep's notes">{lastNotes}</Detail>}
          {summary && (
            <div className="text-sm leading-snug">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {summaryCoversLast ? "What they spoke about " : "From earlier calls "}
              </span>
              <span className={cn("whitespace-pre-line text-foreground", !expanded && "line-clamp-3")}>{summary}</span>
              {summary.length > 220 && (
                <button type="button" className="ml-1 text-xs font-medium text-primary hover:underline" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? "Less" : "More"}
                </button>
              )}
            </div>
          )}
          {lastNotes && summaryCoversLast && <Detail label="Rep's notes">{lastNotes}</Detail>}

          {intel?.key_quote && (
            <p className="flex gap-1.5 text-sm italic text-foreground">
              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>"{intel.key_quote}"</span>
            </p>
          )}

          {(intel?.key_objection || intel?.agreed_next_steps || intel?.marketing_pain_points || intel?.buying_timeline) && (
            <div className="space-y-1">
              {intel?.key_objection && intel.key_objection !== "No Objection" && (
                <Detail label="Objection">
                  {intel.key_objection}
                  {intel.objection_notes ? `: ${intel.objection_notes}` : ""}
                </Detail>
              )}
              {intel?.marketing_pain_points && <Detail label="Pain">{intel.marketing_pain_points}</Detail>}
              {intel?.buying_timeline && <Detail label="Timeline">{intel.buying_timeline}</Detail>}
              {intel?.agreed_next_steps && <Detail label="Agreed next step">{intel.agreed_next_steps}</Detail>}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {conversations.length === 1 ? "1 conversation" : `${conversations.length}${conversations.length === 4 ? "+" : ""} conversations`}
            {` across ${data?.dialCount ?? 0} dial${data?.dialCount === 1 ? "" : "s"}`}
            {earlier.length > 0 && (
              <>
                {" · before that: "}
                {earlier.map((c) => `${repName(c.user_id)} ${new Date(c.created_at).toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short" })}`).join(", ")}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
