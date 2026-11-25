/**
 * The rep's To do list: one row per lead that needs a call, built from two
 * places that used to be separate tabs (the rebook queue and follow-ups).
 *
 * Ownership: a no-show or a cancellation belongs to whoever SET the meeting,
 * because the setter rebooks it. A follow-up belongs to whoever it is assigned
 * to. A lead that is both shows once, as the no-show or cancellation.
 *
 * A no-show or cancellation stays due, however old, until the lead rebooks or
 * says no. A no sends it back to the dialer queue (backToDialer), so a lead is
 * in one place or the other and never both.
 */

export type TodoKind = "no_show" | "cancelled" | "moved" | "follow_up";
export type TodoWhen = "due" | "later" | "old";

export interface TodoContact {
  id: string;
  business_name: string | null;
  contact_person?: string | null;
  dm_name?: string | null;
  phone?: string | null;
  phone_type?: string | null;
  dm_phone?: string | null;
  dm_phone_verified?: boolean | null;
  dm_phone_preferred?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  ghl_contact_id?: string | null;
  website?: string | null;
  status?: string | null;
  is_dnc?: boolean | null;
  lifecycle_stage?: string | null;
  meeting_booked_date?: string | null;
  key_quote?: string | null;
}

export interface TodoBookingRow {
  id: string;
  contact_id: string;
  status: string;
  scheduled_for: string | null;
  appointment_outcome: string | null;
  outcome_reason: string | null;
  outcome_notes?: string | null;
  outcome_recorded_at: string | null;
  reschedule_count: number | null;
  created_by: string;
  created_at: string;
  contacts: TodoContact | null;
}

export interface TodoFollowUpRow {
  id: string;
  contact_id: string;
  assigned_user_id: string;
  created_by: string;
  scheduled_for: string | null;
  created_at: string;
  notes?: string | null;
  follow_up_method?: string | null;
  contacts: TodoContact | null;
}

export interface TodoItem {
  /** Stable row key. */
  key: string;
  kind: TodoKind;
  when: TodoWhen;
  contact: TodoContact;
  ownerId: string;
  /** The missed, cancelled or moved slot, or the follow-up's due time. */
  at: string | null;
  /** When this is next due, if it has been pushed back. */
  dueAt: string | null;
  booking: TodoBookingRow | null;
  /** The open follow-up behind this row, if there is one. */
  followUp: TodoFollowUpRow | null;
}

/** Follow-ups this late drop out of the due count. No-shows and cancellations never do. */
export const TODO_OLD_DAYS = 30;
const DAY = 86_400_000;

/** A note with this prefix takes a lead off the list without touching the booking's own record. */
export const DROP_NOTE_PREFIX = "Not chasing:";

const DEAD = new Set(["closed", "client", "dnc", "do_not_call", "disqualified", "lost"]);
const REAL_NO = new Set(["cx_not_interested", "cx_competitor"]);

/** The claim rules the dialer queue applies to status, meeting date and stage. */
export function inDialerQueue(c: Pick<TodoContact, "status" | "lifecycle_stage" | "meeting_booked_date">): boolean {
  return c.status === "uncalled" && !c.meeting_booked_date && !["won", "lost", "booked"].includes(c.lifecycle_stage ?? "");
}

/**
 * The contact fields that make a lead claimable again. All of them are needed:
 * the queue skips a lead with a meeting date or a booked/lost stage, whatever
 * its status. Writing the stage in the same update also stops the database's
 * status trigger moving it to "lost".
 */
export const backToDialer = {
  status: "uncalled",
  lifecycle_stage: "connected",
  lifecycle_reason: null,
  meeting_booked_date: null,
  next_followup_date: null,
  follow_up_note: null,
} as const;

/**
 * Logging a meeting as Cancelled makes the database mark the contact
 * "not_interested", so that status alone does not mean the lead said no. A
 * cancellation stays on the list unless the recorded reason is a real no.
 */
export function rebookKind(
  latest: Pick<TodoBookingRow, "status" | "scheduled_for" | "appointment_outcome" | "outcome_reason" | "reschedule_count">,
  contact: Pick<TodoContact, "status" | "is_dnc" | "lifecycle_stage" | "meeting_booked_date">,
  now: number,
): Exclude<TodoKind, "follow_up"> | null {
  const status = String(contact.status ?? "").toLowerCase();
  if (contact.is_dnc || DEAD.has(status)) return null;
  if (inDialerQueue(contact)) return null;
  if (latest.status === "canceled" || latest.appointment_outcome === "cancelled") {
    if (REAL_NO.has(latest.outcome_reason ?? "")) return null;
    // Only the dialer's Cancelled outcome sets not_interested by itself. A GHL
    // cancellation does not, so there the status is somebody's decision.
    if (status === "not_interested" && latest.appointment_outcome !== "cancelled") return null;
    return "cancelled";
  }
  if (status === "not_interested") return null;
  if (latest.appointment_outcome === "no_show") return "no_show";
  const when = latest.scheduled_for ? Date.parse(latest.scheduled_for) : null;
  if (
    when !== null && when >= now && latest.status === "open"
    && (latest.appointment_outcome === "rescheduled" || (latest.reschedule_count ?? 0) > 0)
  ) return "moved";
  return null;
}

/** The no-show trigger writes a follow-up due exactly two days out. Nobody chose that date. */
export function isUntouchedAuto(f: Pick<TodoFollowUpRow, "notes" | "scheduled_for" | "created_at">): boolean {
  if (!f.notes?.startsWith("Auto follow-up:") || !f.scheduled_for) return false;
  return Math.abs(Date.parse(f.scheduled_for) - Date.parse(f.created_at) - 2 * DAY) < 5_000;
}

function endOfDay(now: number) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function buildTodo({
  bookings,
  followUps,
  droppedAt = new Map(),
  ownerId,
  now = Date.now(),
}: {
  bookings: TodoBookingRow[];
  followUps: TodoFollowUpRow[];
  /** Latest drop note per contact. */
  droppedAt?: Map<string, string>;
  /** Null means everyone. */
  ownerId: string | null;
  now?: number;
}): TodoItem[] {
  const latestBooking = new Map<string, TodoBookingRow>();
  const newestCreated = new Map<string, number>();
  for (const b of bookings) {
    const current = latestBooking.get(b.contact_id);
    if (!current || (b.scheduled_for ?? "") > (current.scheduled_for ?? "")) latestBooking.set(b.contact_id, b);
    newestCreated.set(b.contact_id, Math.max(newestCreated.get(b.contact_id) ?? 0, Date.parse(b.created_at)));
  }

  // A follow-up from before a newer booking was made has been answered by it.
  const live = followUps.filter((f) => Date.parse(f.created_at) >= (newestCreated.get(f.contact_id) ?? 0));
  const liveBy = new Map<string, TodoFollowUpRow[]>();
  for (const f of live) liveBy.set(f.contact_id, [...(liveBy.get(f.contact_id) ?? []), f]);

  const tonight = endOfDay(now);
  const oldBefore = now - TODO_OLD_DAYS * DAY;
  const items: TodoItem[] = [];
  const rebooking = new Set<string>();

  for (const b of latestBooking.values()) {
    if (!b.contacts) continue;
    const kind = rebookKind(b, b.contacts, now);
    if (!kind) continue;
    const dropped = droppedAt.get(b.contact_id);
    if (dropped && dropped > (b.outcome_recorded_at ?? b.created_at)) continue;
    // A moved meeting is only a reminder; its own follow-ups still count.
    if (kind !== "moved") rebooking.add(b.contact_id);
    if (ownerId && b.created_by !== ownerId) continue;

    const mine = liveBy.get(b.contact_id) ?? [];
    const followUp = mine.find((f) => !isUntouchedAuto(f)) ?? mine[0] ?? null;
    const pushed = followUp?.scheduled_for && !isUntouchedAuto(followUp) ? followUp.scheduled_for : null;
    const when: TodoWhen = kind === "moved" || (pushed && Date.parse(pushed) > tonight) ? "later" : "due";
    items.push({
      key: `b:${b.id}`, kind, when, contact: b.contacts, ownerId: b.created_by,
      at: b.scheduled_for, dueAt: pushed, booking: b, followUp,
    });
  }

  for (const f of live) {
    if (!f.contacts || rebooking.has(f.contact_id)) continue;
    if (ownerId && f.assigned_user_id !== ownerId) continue;
    const status = String(f.contacts.status ?? "").toLowerCase();
    if (f.contacts.is_dnc || status === "dnc" || status === "do_not_call") continue;
    const due = f.scheduled_for ? Date.parse(f.scheduled_for) : now;
    items.push({
      key: `f:${f.id}`, kind: "follow_up",
      when: due > tonight ? "later" : due < oldBefore ? "old" : "due",
      contact: f.contacts, ownerId: f.assigned_user_id,
      at: f.scheduled_for, dueAt: f.scheduled_for, booking: null, followUp: f,
    });
  }

  const order: Record<TodoKind, number> = { no_show: 0, cancelled: 1, follow_up: 2, moved: 3 };
  return items.sort((a, b) => {
    // What is coming up reads soonest first; everything else freshest first.
    if (a.when === "later" && b.when === "later") return (a.dueAt ?? a.at ?? "").localeCompare(b.dueAt ?? b.at ?? "");
    if (a.kind !== b.kind) return order[a.kind] - order[b.kind];
    return (b.dueAt ?? b.at ?? "").localeCompare(a.dueAt ?? a.at ?? "");
  });
}

export const dueCount = (items: TodoItem[]) => items.filter((i) => i.when === "due").length;

/** 9am on the next working day, `days` from now at the earliest. */
export function workingMorning(days: number, now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
