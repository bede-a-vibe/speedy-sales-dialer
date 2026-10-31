import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentOutcomeValue } from "@/lib/appointments";

/** How a booked slot ended, collapsed to what a rep wants to compare. */
export type LibraryBucket =
  | "closed"
  | "verbal"
  | "no_close"
  | "dq"
  | "second_meeting"
  | "no_show"
  | "cancelled"
  | "pending";

export interface LibraryCall {
  pipelineItemId: string;
  contactId: string;
  businessName: string;
  contactPerson: string | null;
  state: string | null;
  industry: string | null;
  /** When the meeting was (or was meant to be) held. */
  metAt: string;
  bucket: LibraryBucket;
  outcome: AppointmentOutcomeValue | null;
  outcomeReason: string | null;
  isQualified: boolean | null;
  /** The lead had already sat on an earlier day: this is the closer's second meeting. */
  isFollowUp: boolean;
  rescheduleCount: number;
  mrr: number | null;
  dealValue: number | null;
  setterName: string | null;
  closerName: string | null;
  /** The cold call that booked it. */
  setting: {
    callLogId: string;
    calledAt: string;
    dialpadCallId: string | null;
    /**
     * Whether Dialpad has anything to play for that id. A linked call that never
     * connected (a two-second failed dial) has no recording, and the Listen
     * button would only fail. Unknown (no synced Dialpad row) is taken as true.
     */
    hasAudio: boolean;
    talkSeconds: number | null;
    transcript: string | null;
    summary: string | null;
  } | null;
  /** Days from the booking call to this slot. */
  daysOut: number | null;
  /** The meeting itself. Fathom share link, or the older recording_url column. */
  meetingRecordingUrl: string | null;
  meetingRecordingSource: "fathom" | "link" | null;
}

const MS_PER_DAY = 86_400_000;

const SHOWED = new Set<AppointmentOutcomeValue>([
  "showed_closed",
  "showed_no_close",
  "showed_verbal_commitment",
  "second_meeting_booked",
  "no_close_follow_up",
  "disqualified",
]);

export function bucketFor(outcome: AppointmentOutcomeValue | null, status: string, scheduledFor: string | null): LibraryBucket {
  if (status === "canceled" || outcome === "cancelled") return "cancelled";
  switch (outcome) {
    case "showed_closed":
      return "closed";
    case "showed_verbal_commitment":
      return "verbal";
    case "showed_no_close":
    case "no_close_follow_up":
      return "no_close";
    case "disqualified":
      return "dq";
    case "second_meeting_booked":
      return "second_meeting";
    case "no_show":
      return "no_show";
    default:
      return "pending";
  }
}

export const SHOWED_BUCKETS = new Set<LibraryBucket>(["closed", "verbal", "no_close", "dq", "second_meeting"]);

/** The booking call can be played: it is linked to a Dialpad call that has audio. */
export const hasSetAudio = (call: Pick<LibraryCall, "setting">): boolean =>
  Boolean(call.setting?.dialpadCallId && call.setting.hasAudio);

/**
 * Has something to listen to: the booking call's Dialpad audio or the meeting
 * recording. The Classroom's call library only lists these (Bede, 31 Oct 2026:
 * a slot with neither has nothing to learn from in a listening library). A
 * transcript on its own does not count; the library is for hearing the call.
 */
export const hasRecording = (call: Pick<LibraryCall, "setting" | "meetingRecordingUrl">): boolean =>
  hasSetAudio(call) || Boolean(call.meetingRecordingUrl);

/** Dialpad's view of a call: did it connect, or does it carry a recording? */
export function dialpadCallHasAudio(row: {
  is_connected: boolean | null;
  talk_time_seconds: number | null;
  recording_id: string | null;
  recording_url: string | null;
  recording_share_link: string | null;
} | null | undefined): boolean {
  if (!row) return true;
  return Boolean(row.is_connected || (row.talk_time_seconds ?? 0) > 0 || row.recording_id || row.recording_url || row.recording_share_link);
}

/**
 * Every booked slot since the given date, with the two recordings that explain it:
 * the cold call that booked the meeting and the meeting itself. The hook returns
 * every slot; the library hides the ones with nothing to hear (see `hasRecording`)
 * and says how many it hid, so the survivorship bias stays visible.
 */
export function useCallLibrary(sinceIso: string) {
  return useQuery({
    queryKey: ["call-library", sinceIso],
    staleTime: 60_000,
    queryFn: async (): Promise<LibraryCall[]> => {
      const { data: items, error } = await supabase
        .from("pipeline_items")
        .select(
          "id, contact_id, scheduled_for, status, appointment_outcome, outcome_reason, is_qualified, reschedule_count, monthly_recurring_value, deal_value, recording_url, created_by, assigned_user_id, contacts:contacts!pipeline_items_contact_id_fkey(business_name, contact_person, dm_name, state, industry)",
        )
        .eq("pipeline_type", "booked")
        .gte("scheduled_for", sinceIso)
        .lte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: false });
      if (error) throw error;
      const rows = (items ?? []) as unknown as Array<{
        id: string;
        contact_id: string;
        scheduled_for: string | null;
        status: string;
        appointment_outcome: AppointmentOutcomeValue | null;
        outcome_reason: string | null;
        is_qualified: boolean | null;
        reschedule_count: number | null;
        monthly_recurring_value: number | null;
        deal_value: number | null;
        recording_url: string | null;
        created_by: string;
        assigned_user_id: string;
        contacts: { business_name: string | null; contact_person: string | null; dm_name: string | null; state: string | null; industry: string | null } | null;
      }>;
      if (rows.length === 0) return [];

      const contactIds = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))];
      const itemIds = rows.map((r) => r.id);
      const userIds = [...new Set(rows.flatMap((r) => [r.created_by, r.assigned_user_id]).filter(Boolean))];

      const [callsRes, fathomRes, historyRes, profilesRes] = await Promise.all([
        supabase
          .from("call_logs")
          .select("id, contact_id, created_at, dialpad_call_id, dialpad_talk_time_seconds, dialpad_transcript, dialpad_summary")
          .in("contact_id", contactIds)
          .eq("outcome", "booked")
          .order("created_at", { ascending: true }),
        supabase.from("fathom_meetings").select("pipeline_item_id, share_url").in("pipeline_item_id", itemIds),
        // Every showed slot per contact, to tell a first meeting from a follow-up.
        supabase
          .from("pipeline_items")
          .select("contact_id, scheduled_for, appointment_outcome")
          .eq("pipeline_type", "booked")
          .in("contact_id", contactIds),
        supabase.from("profiles").select("user_id, display_name, email").in("user_id", userIds),
      ]);
      if (callsRes.error) throw callsRes.error;
      if (fathomRes.error) throw fathomRes.error;
      if (historyRes.error) throw historyRes.error;
      if (profilesRes.error) throw profilesRes.error;

      // Dialpad's own record of each booking call, to tell a playable call from a
      // linked two-second failed dial. Fetched after the call logs because the ids
      // come from them; missing rows are treated as playable rather than hidden.
      const dialpadIds = [...new Set((callsRes.data ?? []).map((c) => c.dialpad_call_id).filter((id): id is string => Boolean(id)))];
      const dialpadRows = dialpadIds.length
        ? await supabase
            .from("dialpad_calls")
            .select("dialpad_call_id, is_connected, talk_time_seconds, recording_id, recording_url, recording_share_link")
            .in("dialpad_call_id", dialpadIds)
        : { data: [], error: null };
      if (dialpadRows.error) throw dialpadRows.error;
      const dialpadById = new Map((dialpadRows.data ?? []).map((d) => [d.dialpad_call_id, d]));

      const nameByUser = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p.display_name || p.email?.split("@")[0] || null]));
      const fathomByItem = new Map((fathomRes.data ?? []).map((f) => [f.pipeline_item_id as string, f.share_url as string | null]));

      // The booking call is the last "booked" call before the slot; fall back to the earliest.
      const callsByContact = new Map<string, NonNullable<typeof callsRes.data>>();
      for (const c of callsRes.data ?? []) {
        if (!c.contact_id) continue;
        const list = callsByContact.get(c.contact_id) ?? [];
        list.push(c);
        callsByContact.set(c.contact_id, list);
      }
      const showedDaysByContact = new Map<string, string[]>();
      for (const h of historyRes.data ?? []) {
        if (!h.contact_id || !h.scheduled_for || !h.appointment_outcome || !SHOWED.has(h.appointment_outcome as AppointmentOutcomeValue)) continue;
        const list = showedDaysByContact.get(h.contact_id) ?? [];
        list.push(h.scheduled_for);
        showedDaysByContact.set(h.contact_id, list);
      }

      return rows
        .filter((r) => !!r.scheduled_for)
        .map((r) => {
          const metAt = r.scheduled_for as string;
          const metMs = new Date(metAt).getTime();
          const calls = callsByContact.get(r.contact_id) ?? [];
          const before = calls.filter((c) => new Date(c.created_at).getTime() <= metMs);
          const call = before[before.length - 1] ?? calls[0] ?? null;
          const fathom = fathomByItem.get(r.id) ?? null;
          const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { timeZone: "Australia/Melbourne" });
          const isFollowUp = (showedDaysByContact.get(r.contact_id) ?? []).some(
            (t) => new Date(t).getTime() < metMs && dayKey(t) !== dayKey(metAt),
          );
          return {
            pipelineItemId: r.id,
            contactId: r.contact_id,
            businessName: r.contacts?.business_name ?? "Unknown business",
            contactPerson: r.contacts?.contact_person || r.contacts?.dm_name || null,
            state: r.contacts?.state ?? null,
            industry: r.contacts?.industry ?? null,
            metAt,
            bucket: bucketFor(r.appointment_outcome, r.status, r.scheduled_for),
            outcome: r.appointment_outcome,
            outcomeReason: r.outcome_reason,
            isQualified: r.is_qualified,
            isFollowUp,
            rescheduleCount: r.reschedule_count ?? 0,
            mrr: r.monthly_recurring_value,
            dealValue: r.deal_value,
            setterName: nameByUser.get(r.created_by) ?? null,
            closerName: nameByUser.get(r.assigned_user_id) ?? null,
            setting: call
              ? {
                  callLogId: call.id,
                  calledAt: call.created_at,
                  dialpadCallId: call.dialpad_call_id,
                  hasAudio: call.dialpad_call_id ? dialpadCallHasAudio(dialpadById.get(call.dialpad_call_id)) : false,
                  talkSeconds: call.dialpad_talk_time_seconds,
                  transcript: call.dialpad_transcript,
                  summary: call.dialpad_summary,
                }
              : null,
            daysOut: call ? Math.round((metMs - new Date(call.created_at).getTime()) / MS_PER_DAY) : null,
            meetingRecordingUrl: fathom ?? r.recording_url ?? null,
            meetingRecordingSource: fathom ? "fathom" : r.recording_url ? "link" : null,
          };
        });
    },
  });
}
