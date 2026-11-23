import { supersededSecondMeetings } from "@/lib/funnelTracker";

/**
 * Pipelines > Completed: filter by outcome, by the reason logged on the
 * meeting (objection, DQ, no-show or cancel) and by the qualified mark.
 * The grouped outcomes use the same rules as the trackers:
 * - "didnt_close": sat and didn't close (no close + no close follow-up).
 * - "still_in_play": second meeting booked and the next meeting hasn't happened.
 * - "second_done": second meeting booked, next meeting already happened.
 * "none" finds meetings with no reason recorded. A DQ can carry its reason in dq_reason only.
 */
export type CompletedRow = {
  id: string;
  contact_id: string;
  scheduled_for: string | null;
  appointment_outcome?: string | null;
  outcome_reason?: string | null;
  dq_reason?: string | null;
  is_qualified?: boolean | null;
};

export const DIDNT_CLOSE_OUTCOMES = new Set(["showed_no_close", "no_close_follow_up"]);

export function filterCompleted<T extends CompletedRow>(
  items: T[],
  outcome: string,
  reason: string,
  qualified: "all" | "yes" | "no" | "unmarked" = "all",
): T[] {
  const superseded = outcome === "still_in_play" || outcome === "second_done" ? supersededSecondMeetings(items) : null;
  return items.filter((item) => {
    const o = item.appointment_outcome ?? null;
    if (outcome === "didnt_close") {
      if (!o || !DIDNT_CLOSE_OUTCOMES.has(o)) return false;
    } else if (outcome === "still_in_play") {
      if (o !== "second_meeting_booked" || superseded!.has(item.id)) return false;
    } else if (outcome === "second_done") {
      if (o !== "second_meeting_booked" || !superseded!.has(item.id)) return false;
    } else if (outcome !== "all" && o !== outcome) return false;

    if (qualified === "yes" && item.is_qualified !== true) return false;
    if (qualified === "no" && item.is_qualified !== false) return false;
    if (qualified === "unmarked" && item.is_qualified != null) return false;

    if (reason === "all") return true;
    const r = item.outcome_reason || item.dq_reason || null;
    return reason === "none" ? !r : r === reason;
  });
}
