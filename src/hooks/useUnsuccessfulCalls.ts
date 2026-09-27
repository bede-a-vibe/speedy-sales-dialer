import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CoachingJson } from "@/hooks/useCallCoaching";

/**
 * Long cold calls that did NOT book, with the coach's read of where they
 * broke. The winning-calls library shows what good looks like; this is the
 * other half — a real conversation, two minutes or more, that went somewhere
 * and then didn't. Most of the learning is in these.
 */
export interface UnsuccessfulCall {
  callLogId: string;
  businessName: string;
  industry: string | null;
  repUserId: string;
  outcome: string;
  calledAt: string;
  talkSeconds: number;
  transcript: string;
  dialpadCallId: string | null;
  coaching: CoachingJson | null;
  /** The stage the rep logged the call as ending at, if they tagged it. */
  exitStage: "connection" | "problem" | "solution" | "commitment" | "booking" | null;
  exitReason: string | null;
}

const MIN_SECONDS = 120;

export function useUnsuccessfulCalls() {
  return useQuery({
    queryKey: ["unsuccessful-calls", MIN_SECONDS],
    staleTime: 120_000,
    queryFn: async (): Promise<UnsuccessfulCall[]> => {
      const { data: logs, error } = await supabase
        .from("call_logs")
        .select(
          "id, user_id, outcome, created_at, dialpad_call_id, dialpad_talk_time_seconds, dialpad_transcript, " +
            "exit_reason_connection, exit_reason_problem, exit_reason_solution, exit_reason_commitment, exit_reason_booking, " +
            "contacts(business_name, industry)",
        )
        .neq("outcome", "booked")
        .not("dialpad_transcript", "is", null)
        .gte("dialpad_talk_time_seconds", MIN_SECONDS)
        .order("dialpad_talk_time_seconds", { ascending: false })
        .limit(150);
      if (error) throw error;
      type Row = {
        id: string; user_id: string; outcome: string; created_at: string;
        dialpad_call_id: string | null; dialpad_talk_time_seconds: number | null; dialpad_transcript: string | null;
        exit_reason_connection: string | null; exit_reason_problem: string | null; exit_reason_solution: string | null;
        exit_reason_commitment: string | null; exit_reason_booking: string | null;
        contacts: { business_name: string | null; industry: string | null } | null;
      };
      const rows = (logs ?? []) as unknown as Row[];
      if (rows.length === 0) return [];

      const { data: coached, error: cErr } = await supabase
        .from("call_coaching")
        .select("call_log_id, coaching")
        .in("call_log_id", rows.map((r) => r.id));
      if (cErr) throw cErr;
      const coachingByLog = new Map(
        (coached ?? []).map((c) => [c.call_log_id as string, c.coaching as unknown as CoachingJson] as const),
      );

      return rows.map((r) => {
        const exit =
          r.exit_reason_booking ? (["booking", r.exit_reason_booking] as const) :
          r.exit_reason_commitment ? (["commitment", r.exit_reason_commitment] as const) :
          r.exit_reason_solution ? (["solution", r.exit_reason_solution] as const) :
          r.exit_reason_problem ? (["problem", r.exit_reason_problem] as const) :
          r.exit_reason_connection ? (["connection", r.exit_reason_connection] as const) : null;
        return {
          callLogId: r.id,
          businessName: r.contacts?.business_name ?? "Unknown business",
          industry: r.contacts?.industry ?? null,
          repUserId: r.user_id,
          outcome: r.outcome,
          calledAt: r.created_at,
          talkSeconds: r.dialpad_talk_time_seconds ?? 0,
          transcript: r.dialpad_transcript ?? "",
          dialpadCallId: r.dialpad_call_id ?? null,
          coaching: coachingByLog.get(r.id) ?? null,
          exitStage: exit ? exit[0] : null,
          exitReason: exit ? exit[1] : null,
        };
      });
    },
  });
}
