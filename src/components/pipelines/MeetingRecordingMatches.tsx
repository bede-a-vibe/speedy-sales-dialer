import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ListenButton } from "@/components/calls/ListenButton";

/** How far either side of the booked time a call counts as "the meeting". */
const WINDOW_HOURS = 4;

export function ghlConversationUrl(locationId: string | null | undefined, conversationId: string | null | undefined) {
  if (!locationId || !conversationId) return null;
  return `https://app.gohighlevel.com/v2/location/${locationId}/conversations/conversations/${conversationId}`;
}

export interface GhlCallMatch {
  id: string;
  occurred_at: string;
  duration_seconds: number | null;
  url: string | null;
}

export function useMeetingCallMatches(contactId: string | null, ghlContactId: string | null | undefined, scheduledFor: string | null) {
  return useQuery({
    queryKey: ["meeting-call-matches", contactId, ghlContactId, scheduledFor],
    enabled: !!scheduledFor && (!!contactId || !!ghlContactId),
    staleTime: 60_000,
    queryFn: async () => {
      const at = new Date(scheduledFor!).getTime();
      const from = new Date(at - WINDOW_HOURS * 3600_000).toISOString();
      const to = new Date(at + WINDOW_HOURS * 3600_000).toISOString();

      const [dialpad, ghl] = await Promise.all([
        contactId
          ? supabase
              .from("dialpad_calls")
              .select("dialpad_call_id, started_at, talk_time_seconds")
              .eq("contact_id", contactId)
              .gte("started_at", from)
              .lte("started_at", to)
              .gte("talk_time_seconds", 60)
              .order("started_at")
          : Promise.resolve({ data: [] as any[] }),
        ghlContactId
          ? supabase
              .from("ghl_calls")
              .select("id, occurred_at, duration_seconds, conversation_id, raw")
              .eq("ghl_contact_id", ghlContactId)
              .gte("occurred_at", from)
              .lte("occurred_at", to)
              .order("occurred_at")
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const ghlCalls: GhlCallMatch[] = ((ghl.data ?? []) as any[]).map((c) => ({
        id: c.id,
        occurred_at: c.occurred_at,
        duration_seconds: c.duration_seconds,
        url: ghlConversationUrl(c.raw?.locationId, c.conversation_id),
      }));
      return {
        dialpad: (dialpad.data ?? []) as { dialpad_call_id: string; started_at: string; talk_time_seconds: number | null }[],
        ghl: ghlCalls,
      };
    },
  });
}

const mins = (s: number | null | undefined) => `${Math.round((s ?? 0) / 60)} min`;

export function MeetingRecordingMatches({
  contactId,
  ghlContactId,
  scheduledFor,
  onUseGhlCall,
}: {
  contactId: string | null;
  ghlContactId: string | null | undefined;
  scheduledFor: string | null;
  onUseGhlCall: (url: string) => void;
}) {
  const { data, isLoading } = useMeetingCallMatches(contactId, ghlContactId, scheduledFor);
  if (isLoading) return <p className="text-[11px] text-muted-foreground">Looking for calls around the meeting time…</p>;
  const total = (data?.dialpad.length ?? 0) + (data?.ghl.length ?? 0);
  if (!total) {
    return (
      <p className="text-[11px] text-muted-foreground">
        No phone calls found within {WINDOW_HOURS} hours of the meeting. Paste a link above if it was recorded elsewhere.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-foreground">Matched calls around the meeting time</p>
      {data?.ghl.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          <span>GHL call · {format(new Date(c.occurred_at), "d MMM h:mm a")} · {mins(c.duration_seconds)}</span>
          {c.url ? (
            <>
              <a href={c.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open in GHL</a>
              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onUseGhlCall(c.url!)}>
                Use as phone link
              </Button>
            </>
          ) : null}
        </div>
      ))}
      {data?.dialpad.map((c) => (
        <div key={c.dialpad_call_id} className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          <span>Dialpad call · {format(new Date(c.started_at), "d MMM h:mm a")} · {mins(c.talk_time_seconds)}</span>
          <ListenButton dialpadCallId={c.dialpad_call_id} autoPlay={false} />
        </div>
      ))}
    </div>
  );
}
