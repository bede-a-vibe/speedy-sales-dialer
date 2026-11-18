import { dayKeyOf } from "@/lib/funnelTracker";

/**
 * The start date of the revenue record a close opens: the meeting's day in
 * Melbourne (or today, if the meeting has no time). Using the UTC date put
 * every close from a meeting before 11am on the previous day (Ozelect, 19 Nov).
 */
export function closeStartDate(scheduledFor: string | null | undefined): string {
  return dayKeyOf(scheduledFor ?? new Date().toISOString());
}
