import type { AppointmentOutcomeValue } from "@/lib/appointments";
import type { BookedAppointmentReportItem, PipelineStatus } from "@/hooks/usePipelineItems";

/**
 * Reporting reads bookings from the dialer (`pipeline_items` of type booked).
 * Some cold-call meetings only exist in the GHL calendar stream — a setter
 * booked the slot in GHL but the dialer call was logged as something else, so
 * no pipeline row was ever created. Those meetings (and their closes) were
 * invisible to every funnel and the Custom Monitor.
 *
 * This merges GHL-stream rows from `v_meetings_unified` into the booking list
 * when they are cold-call meetings with no dialer twin. Ads / inbound bookings
 * are left out on purpose: they are not setter activity and the dial funnel
 * would be inflated by self-bookings.
 */

export interface UnifiedMeetingLite {
  id: string | null;
  stream: string | null;
  contact_id: string | null;
  start_time: string | null;
  booked_at: string | null;
  rep_user_id: string | null;
  resolved_outcome: string | null;
  outcome_reason: string | null;
  reschedule_count: number | null;
  mrr: number | null;
  led_to_deal: boolean | null;
  channel: string | null;
  is_linked: boolean | null;
  meeting_type?: string | null;
  title?: string | null;
}

/** Onboarding / kickoff calls with a new client are not sales sittings. */
export function isSalesMeeting(row: Pick<UnifiedMeetingLite, "meeting_type" | "title">): boolean {
  const text = `${row.meeting_type ?? ""} ${row.title ?? ""}`.toLowerCase();
  return !/onboard|kick-?off/.test(text);
}

export const COLD_CALL_CHANNEL = "Cold Call";

export function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Map the GHL stream's (resolved_outcome, outcome_reason) onto the dialer's
 * appointment_outcome enum. `"skip"` means the row should not be reported at
 * all (spam / duplicate self-bookings marked invalid).
 */
export function mapGhlOutcome(
  resolved: string | null,
  reason: string | null,
): AppointmentOutcomeValue | null | "skip" {
  switch (resolved) {
    case "invalid":
      return "skip";
    case "showed":
      switch (reason) {
        case "showed_closed":
          return "showed_closed";
        case "showed_verbal":
          return "showed_verbal_commitment";
        case "showed_follow_up":
          return "second_meeting_booked";
        case "showed_proposal":
          return "no_close_follow_up";
        default:
          return "showed_no_close";
      }
    case "noshow":
      return "no_show";
    case "cancelled":
      return "cancelled";
    case "rescheduled":
      return "rescheduled";
    default:
      // pending / upcoming — no outcome yet
      return null;
  }
}

function statusFor(outcome: AppointmentOutcomeValue | null): PipelineStatus {
  if (outcome === "cancelled") return "canceled";
  return outcome ? "completed" : "open";
}

export function ghlMeetingToBookingItem(
  row: UnifiedMeetingLite,
  createdBy: string | null,
  contacts: BookedAppointmentReportItem["contacts"] | undefined,
): BookedAppointmentReportItem | null {
  if (!row.id || !row.contact_id || !row.start_time) return null;
  const outcome = mapGhlOutcome(row.resolved_outcome, row.outcome_reason);
  if (outcome === "skip") return null;
  return {
    id: row.id,
    contact_id: row.contact_id,
    created_at: row.booked_at ?? row.start_time,
    created_by: createdBy ?? row.rep_user_id ?? "",
    assigned_user_id: row.rep_user_id ?? "",
    scheduled_for: row.start_time,
    appointment_outcome: outcome,
    outcome_recorded_at: null,
    status: statusFor(outcome),
    deal_value: null,
    // The view carries the contact's live MRR; only credit it to this meeting
    // when a deal was dated on/after the booking.
    monthly_recurring_value: row.led_to_deal && row.mrr ? row.mrr : null,
    reschedule_count: row.reschedule_count ?? 0,
    is_qualified: null,
    stream: "ghl",
    contacts: contacts ?? null,
  };
}

/**
 * Append GHL-only cold-call meetings to the dialer booking list.
 * A GHL row is a twin (and dropped) when the same contact already has a dialer
 * booking on the same local calendar day — the two systems disagree on the
 * exact time often enough that a time match is unreliable.
 */
export function mergeGhlOnlyMeetings(
  dialerItems: BookedAppointmentReportItem[],
  ghlRows: UnifiedMeetingLite[],
  bookerByContact: Map<string, string>,
  contactsById: Map<string, NonNullable<BookedAppointmentReportItem["contacts"]>>,
): BookedAppointmentReportItem[] {
  const dialerKeys = new Set<string>();
  for (const item of dialerItems) {
    if (item.scheduled_for) dialerKeys.add(`${item.contact_id}|${localDateKey(item.scheduled_for)}`);
  }
  const merged: BookedAppointmentReportItem[] = dialerItems.map((item) => ({ ...item, stream: item.stream ?? "dialer" }));
  for (const row of ghlRows) {
    if (row.stream !== "ghl" || row.channel !== COLD_CALL_CHANNEL || !row.is_linked) continue;
    if (!isSalesMeeting(row)) continue;
    if (!row.contact_id || !row.start_time) continue;
    if (dialerKeys.has(`${row.contact_id}|${localDateKey(row.start_time)}`)) continue;
    const item = ghlMeetingToBookingItem(row, bookerByContact.get(row.contact_id) ?? null, contactsById.get(row.contact_id));
    if (item) merged.push(item);
  }
  return merged;
}

/**
 * Who booked a GHL-only meeting? The dialer has no record, so use the rep who
 * made the last call to that contact at or before the booking time (falling
 * back to their most recent call at all).
 */
export function inferBookers(
  calls: Array<{ contact_id: string | null; user_id: string | null; created_at: string }>,
  bookedAtByContact: Map<string, string>,
): Map<string, string> {
  const sorted = [...calls].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const result = new Map<string, string>();
  const anyCall = new Map<string, string>();
  for (const c of sorted) {
    if (!c.contact_id || !c.user_id) continue;
    if (!anyCall.has(c.contact_id)) anyCall.set(c.contact_id, c.user_id);
    const bookedAt = bookedAtByContact.get(c.contact_id);
    if (bookedAt && c.created_at <= bookedAt && !result.has(c.contact_id)) result.set(c.contact_id, c.user_id);
  }
  for (const [contactId, userId] of anyCall) if (!result.has(contactId)) result.set(contactId, userId);
  return result;
}

const SHOWED_SET = new Set(["showed_closed", "showed_no_close", "showed_verbal_commitment", "second_meeting_booked", "no_close_follow_up"]);

export interface BookingHistoryRow {
  id: string;
  contact_id: string;
  scheduled_for: string | null;
  appointment_outcome: string | null;
}

/**
 * Mark each booking as a follow-up meeting when the same contact already SAT
 * and showed at an earlier booking (an earlier calendar day). A reschedule is
 * the same first meeting moved, so it is not a follow-up; the prior sitting
 * must actually have showed. `history` should include every booking for the
 * contacts in `items`, not just the ones in the reporting window.
 */
export function markFollowUpMeetings<T extends BookingHistoryRow>(items: T[], history: BookingHistoryRow[]): (T & { is_follow_up: boolean })[] {
  const showedDaysByContact = new Map<string, Set<string>>();
  const note = (row: BookingHistoryRow) => {
    if (!row.scheduled_for || !row.appointment_outcome || !SHOWED_SET.has(row.appointment_outcome)) return;
    const set = showedDaysByContact.get(row.contact_id) ?? new Set<string>();
    set.add(localDateKey(row.scheduled_for));
    showedDaysByContact.set(row.contact_id, set);
  };
  history.forEach(note);
  items.forEach(note);
  return items.map((item) => {
    if (!item.scheduled_for) return { ...item, is_follow_up: false };
    const day = localDateKey(item.scheduled_for);
    const days = showedDaysByContact.get(item.contact_id);
    const hasEarlierShow = !!days && [...days].some((d) => d < day);
    return { ...item, is_follow_up: hasEarlierShow };
  });
}
