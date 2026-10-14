import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClosedDealCall {
  pipelineItemId: string;
  contactId: string;
  businessName: string;
  state: string | null;
  /** When the meeting that closed was held. */
  metAt: string;
  mrr: number | null;
  dealValue: number | null;
  /** The cold call that booked it. */
  setting: {
    callLogId: string;
    calledAt: string;
    setterName: string | null;
    dialpadCallId: string | null;
    talkSeconds: number | null;
    transcript: string | null;
  } | null;
  /** The meeting itself. Fathom share link, or the older recording_url column. */
  meetingRecordingUrl: string | null;
  meetingRecordingSource: "fathom" | "link" | null;
  /** Days between the booking call and the meeting. */
  daysToMeeting: number | null;
}

const MS_PER_DAY = 86_400_000;

/**
 * Every deal that closed, with the two recordings that explain it: the cold
 * call that booked the meeting, and the meeting itself.
 *
 * This is the review material a setter actually needs — not "a good call", but
 * the specific sets that went the whole way to money. Coverage is partial and
 * deliberately exposed as nulls rather than hidden, because a library that
 * silently drops half the closes teaches the wrong lesson about what works.
 */
export function useClosedDealCalls() {
  return useQuery({
    queryKey: ["closed-deal-calls"],
    staleTime: 60_000,
    queryFn: async (): Promise<ClosedDealCall[]> => {
      const { data: items, error } = await supabase
        .from("pipeline_items")
        .select(
          "id, contact_id, scheduled_for, monthly_recurring_value, deal_value, recording_url, contacts:contacts!pipeline_items_contact_id_fkey(business_name, state)",
        )
        .eq("pipeline_type", "booked")
        .eq("appointment_outcome", "showed_closed")
        .order("scheduled_for", { ascending: false });
      if (error) throw error;
      const rows = (items ?? []) as Array<{
        id: string;
        contact_id: string;
        scheduled_for: string | null;
        monthly_recurring_value: number | null;
        deal_value: number | null;
        recording_url: string | null;
        contacts: { business_name: string | null; state: string | null } | null;
      }>;
      if (rows.length === 0) return [];

      const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
      const itemIds = rows.map((r) => r.id);

      const [callsRes, fathomRes] = await Promise.all([
        // The booking call for each of these contacts.
        supabase
          .from("call_logs")
          .select("id, contact_id, created_at, user_id, dialpad_call_id, dialpad_talk_time_seconds, dialpad_transcript")
          .in("contact_id", contactIds)
          .eq("outcome", "booked")
          .order("created_at", { ascending: true }),
        supabase
          .from("fathom_meetings")
          .select("pipeline_item_id, share_url, start_at")
          .in("pipeline_item_id", itemIds),
      ]);
      if (callsRes.error) throw callsRes.error;
      if (fathomRes.error) throw fathomRes.error;

      const setterIds = [...new Set((callsRes.data ?? []).map((c) => c.user_id).filter(Boolean))] as string[];
      const { data: profiles } = setterIds.length
        ? await supabase.from("profiles").select("user_id, display_name, email").in("user_id", setterIds)
        : { data: [] as Array<{ user_id: string; display_name: string | null; email: string | null }> };
      const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name || p.email || null]));

      // Earliest booking call per contact — the one that created the meeting.
      const callByContact = new Map<string, (typeof callsRes.data)[number]>();
      for (const c of callsRes.data ?? []) {
        if (c.contact_id && !callByContact.has(c.contact_id)) callByContact.set(c.contact_id, c);
      }
      const fathomByItem = new Map((fathomRes.data ?? []).map((f) => [f.pipeline_item_id as string, f.share_url as string | null]));

      return rows
        .filter((r) => !!r.scheduled_for)
        .map((r) => {
          const call = callByContact.get(r.contact_id);
          const fathom = fathomByItem.get(r.id) ?? null;
          const daysToMeeting =
            call && r.scheduled_for
              ? Math.round((new Date(r.scheduled_for).getTime() - new Date(call.created_at).getTime()) / MS_PER_DAY)
              : null;
          return {
            pipelineItemId: r.id,
            contactId: r.contact_id,
            businessName: r.contacts?.business_name ?? "Unknown business",
            state: r.contacts?.state ?? null,
            metAt: r.scheduled_for as string,
            mrr: r.monthly_recurring_value,
            dealValue: r.deal_value,
            setting: call
              ? {
                  callLogId: call.id,
                  calledAt: call.created_at,
                  setterName: call.user_id ? nameByUser.get(call.user_id) ?? null : null,
                  dialpadCallId: call.dialpad_call_id,
                  talkSeconds: call.dialpad_talk_time_seconds,
                  transcript: call.dialpad_transcript,
                }
              : null,
            meetingRecordingUrl: fathom ?? r.recording_url ?? null,
            meetingRecordingSource: fathom ? "fathom" : r.recording_url ? "link" : null,
            daysToMeeting,
          };
        });
    },
  });
}
