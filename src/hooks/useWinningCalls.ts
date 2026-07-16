import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type WinningCallResult = "showed_closed" | "showed" | "no_show" | "pending";

export interface WinningCallScore {
  overallScore: number;
  bookingBlocker: string | null;
  brokeDownAt: string | null;
  /** Raw scorecard JSON from the NEPQ analysis — may include a `qualities` object. */
  scorecard: Record<string, unknown> | null;
}

export interface WinningCall {
  callLogId: string;
  contactId: string;
  businessName: string;
  state: string | null;
  repUserId: string;
  calledAt: string;
  talkSeconds: number | null;
  transcript: string;
  result: WinningCallResult;
  appointmentDate: string | null;
  score: WinningCallScore | null;
  /** Dialpad REST call id — used to fetch the audio recording share link. */
  dialpadCallId: string | null;
}

/**
 * Booked calls that have a full transcript, classified by what the booking
 * became: showed & closed (gold standard), showed, no-show, or pending.
 * This is the raw material for the winning-call training library.
 */
export function useWinningCalls() {
  return useQuery({
    queryKey: ["winning-calls"],
    staleTime: 60_000,
    queryFn: async (): Promise<WinningCall[]> => {
      const { data: logs, error } = await supabase
        .from("call_logs")
        .select("id, contact_id, user_id, created_at, dialpad_call_id, dialpad_talk_time_seconds, dialpad_transcript, contacts(business_name, state)")
        .eq("outcome", "booked")
        .not("dialpad_transcript", "is", null)
        .neq("dialpad_transcript", "")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const rows = (logs ?? []) as any[];
      if (rows.length === 0) return [];

      const contactIds = [...new Set(rows.map((r) => r.contact_id))];
      const callLogIds = rows.map((r) => r.id);
      const [{ data: items, error: pErr }, { data: scores, error: sErr }] = await Promise.all([
        supabase
          .from("pipeline_items")
          .select("contact_id, appointment_outcome, scheduled_for, created_at")
          .in("contact_id", contactIds),
        supabase
          .from("call_scores")
          .select("call_log_id, overall_score, booking_blocker, broke_down_at, scorecard")
          .in("call_log_id", callLogIds),
      ]);
      if (pErr) throw pErr;
      if (sErr) throw sErr;

      const scoreByLog = new Map(
        (scores ?? []).map((s: any) => [
          s.call_log_id,
          {
            overallScore: s.overall_score as number,
            bookingBlocker: s.booking_blocker as string | null,
            brokeDownAt: s.broke_down_at as string | null,
            scorecard: (s.scorecard ?? null) as Record<string, unknown> | null,
          },
        ]),
      );

      const byContact = new Map<string, any[]>();
      for (const it of items ?? []) {
        const arr = byContact.get(it.contact_id) ?? [];
        arr.push(it);
        byContact.set(it.contact_id, arr);
      }

      return rows.map((r) => {
        // The pipeline item this booking created: same contact, created on/after
        // the call (small clock-skew allowance). Falls back to the newest item.
        const candidates = (byContact.get(r.contact_id) ?? [])
          .filter((it) => new Date(it.created_at).getTime() >= new Date(r.created_at).getTime() - 3_600_000)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const item = candidates[0] ?? null;

        let result: WinningCallResult = "pending";
        if (item?.appointment_outcome === "showed_closed") result = "showed_closed";
        else if (item?.appointment_outcome === "showed_no_close" || item?.appointment_outcome === "showed_verbal_commitment") result = "showed";
        else if (item?.appointment_outcome === "no_show") result = "no_show";

        return {
          callLogId: r.id,
          contactId: r.contact_id,
          businessName: r.contacts?.business_name ?? "Unknown business",
          state: r.contacts?.state ?? null,
          repUserId: r.user_id,
          calledAt: r.created_at,
          talkSeconds: r.dialpad_talk_time_seconds,
          transcript: r.dialpad_transcript as string,
          result,
          appointmentDate: item?.scheduled_for ?? null,
          score: scoreByLog.get(r.id) ?? null,
          dialpadCallId: (r.dialpad_call_id as string | null) ?? null,
        };
      });
    },
  });
}
