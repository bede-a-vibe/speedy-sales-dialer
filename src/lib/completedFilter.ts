/**
 * Pipelines > Completed: filter by outcome and by the reason logged on the
 * meeting (objection, DQ, no-show or cancel). "none" finds meetings with no
 * reason recorded. A DQ can carry its reason in dq_reason only.
 */
export function filterCompleted<T extends { appointment_outcome?: string | null; outcome_reason?: string | null; dq_reason?: string | null }>(
  items: T[],
  outcome: string,
  reason: string,
): T[] {
  return items.filter((item) => {
    if (outcome !== "all" && item.appointment_outcome !== outcome) return false;
    if (reason === "all") return true;
    const r = item.outcome_reason || item.dq_reason || null;
    return reason === "none" ? !r : r === reason;
  });
}
