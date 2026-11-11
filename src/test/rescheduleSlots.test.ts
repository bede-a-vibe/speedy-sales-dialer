import { describe, expect, it } from "vitest";
import { getReportMetrics } from "@/lib/reportMetrics";

/**
 * Bede, 11 Nov 2026: "if a meeting is rescheduled it still takes away from the
 * show-up rate". A move used to overwrite the booking, so the missed slot
 * vanished from its week and the reschedule only counted until the new meeting
 * got an outcome. Each missed slot now arrives as its own item
 * (public.meeting_reschedules, kind 'move') and counts as "rescheduled" on the
 * day it was missed. It is never a booking made, an appointment scheduled or a
 * sitting.
 */
const base = {
  contact_id: "c1",
  created_by: "setter",
  assigned_user_id: "closer",
  outcome_recorded_at: null,
  deal_value: null,
  monthly_recurring_value: null,
  is_qualified: null,
  contacts: null,
};

// The meeting itself: booked 2 Nov, moved from 11 Nov to 17 Nov, sat on 17 Nov.
const meeting = {
  ...base,
  id: "m1",
  created_at: "2026-11-02T01:00:00Z",
  scheduled_for: "2026-11-17T06:00:00Z",
  appointment_outcome: "showed_no_close",
  status: "completed",
  reschedule_count: 1,
  resolved_bucket: "showed",
} as never;

// The slot it missed on 11 Nov.
const missedSlot = {
  ...base,
  id: "reschedule:r1",
  created_at: "2026-11-02T01:00:00Z",
  scheduled_for: "2026-11-11T06:00:00Z",
  appointment_outcome: "rescheduled",
  status: "completed",
  reschedule_count: 0,
  resolved_bucket: "rescheduled",
  is_reschedule_slot: true,
} as never;

const other = (id: string, bucket: string, day: string) =>
  ({
    ...base,
    contact_id: `c-${id}`,
    id,
    created_at: "2026-11-03T01:00:00Z",
    scheduled_for: `${day}T03:00:00Z`,
    appointment_outcome: bucket === "showed" ? "showed_no_close" : "no_show",
    status: "completed",
    reschedule_count: 0,
    resolved_bucket: bucket,
  }) as never;

const run = (from: string, to: string, opts: { slots?: unknown[]; mixed?: boolean; repUserId?: string } = {}) => {
  const booked = [meeting, other("a", "showed", "2026-11-11"), other("b", "noshow", "2026-11-11")];
  return getReportMetrics({
    callLogs: [],
    bookedItems: (opts.mixed ? [...booked, ...(opts.slots ?? [])] : booked) as never[],
    rescheduleSlots: (opts.mixed ? [] : (opts.slots ?? [])) as never[],
    from,
    to,
    repUserId: opts.repUserId,
    contacts: [],
  });
};

describe("a moved meeting keeps its missed slot in the show-up rate", () => {
  it("counts the missed slot as rescheduled on the day it was missed", () => {
    const m = run("2026-11-11", "2026-11-11", { slots: [missedSlot] }).appointmentPerformance.setter;
    // 11 Nov: one showed, one no-show, one missed slot. 1 of 3, not 1 of 2.
    expect(m.showed).toBe(1);
    expect(m.noShows).toBe(1);
    expect(m.rescheduled).toBe(1);
    expect(m.showUpRate).toBe(33);
    expect(m.rescheduleRate).toBe(33);
  });

  it("is never an appointment scheduled or a booking made", () => {
    const m = run("2026-11-02", "2026-11-11", { slots: [missedSlot] });
    expect(m.appointmentPerformance.setter.appointmentsScheduled).toBe(2);
    expect(m.bookingsMade.totalBookingsMade).toBe(3);
  });

  it("stays counted after the new meeting happens", () => {
    const week = run("2026-11-11", "2026-11-17", { slots: [missedSlot] }).appointmentPerformance.setter;
    // The 17 Nov sitting is a show; the 11 Nov slot is still a reschedule.
    expect(week.showed).toBe(2);
    expect(week.rescheduled).toBe(1);
    expect(week.showUpRate).toBe(50);
  });

  it("does not count as a sitting in the moved-meeting splits", () => {
    const m = run("2026-11-11", "2026-11-17", { slots: [missedSlot] }).appointmentPerformance.setter;
    // The meeting moved once and then sat: 1 of 1 moved slots showed.
    expect(m.rescheduledSittings).toBe(1);
    expect(m.rescheduledShowUpRate).toBe(100);
  });

  it("works when the slots are mixed into the booked list (breakdowns, trend chart)", () => {
    const m = run("2026-11-11", "2026-11-11", { slots: [missedSlot], mixed: true });
    expect(m.appointmentPerformance.setter.rescheduled).toBe(1);
    expect(m.appointmentPerformance.setter.showUpRate).toBe(33);
    expect(m.bookingsMade.totalBookingsMade).toBe(0);
  });

  it("goes to the setter who booked it and the closer it was with", () => {
    const setter = run("2026-11-11", "2026-11-11", { slots: [missedSlot], repUserId: "setter" }).appointmentPerformance;
    expect(setter.setter.rescheduled).toBe(1);
    expect(setter.closer.rescheduled).toBe(0);
    const closer = run("2026-11-11", "2026-11-11", { slots: [missedSlot], repUserId: "closer" }).appointmentPerformance;
    expect(closer.closer.rescheduled).toBe(1);
  });

  it("splits reschedules by who moved them and tracks show-up after a move", () => {
    const ours = { ...(missedSlot as object), id: "reschedule:r2", contact_id: "c9", outcome_reason: "rs_clash" } as never;
    const theirs = { ...(missedSlot as object), outcome_reason: "rs_prospect" } as never;
    const m = run("2026-11-11", "2026-11-17", { slots: [theirs, ours] }).appointmentPerformance.setter;
    expect(m.reschedulesByProspect).toBe(1);
    expect(m.reschedulesByUs).toBe(1);
    expect(m.reschedulesNoReason).toBe(0);
    expect(m.movedByUsRate).toBe(50);
    // The moved meeting sat on 17 Nov: 1 of 1 moved-once meetings showed.
    expect(m.movedOnceShowUpRate).toBe(100);
  });

  it("counts cancellation reasons on first meetings", () => {
    const cancel = (id: string, reason: string | null) =>
      ({ ...(other(id, "cancelled", "2026-11-11") as object), appointment_outcome: "cancelled", outcome_reason: reason }) as never;
    const m = getReportMetrics({
      callLogs: [],
      bookedItems: [cancel("x", "cx_not_interested"), cancel("y", "cx_not_interested"), cancel("z", null)],
      from: "2026-11-11",
      to: "2026-11-11",
      contacts: [],
    }).appointmentPerformance.setter;
    expect(m.cancellationReasons).toEqual({ cx_not_interested: 2, unrecorded: 1 });
    expect(m.cancellationRate).toBe(100);
  });

  it("without slots, a moved meeting no longer reads as rescheduled before its new time", () => {
    // The database now calls a moved, not-yet-held booking "upcoming".
    const moved = { ...(meeting as object), appointment_outcome: "rescheduled", status: "open", resolved_bucket: "upcoming" } as never;
    const m = getReportMetrics({ callLogs: [], bookedItems: [moved], from: "2026-11-17", to: "2026-11-17", contacts: [] })
      .appointmentPerformance.setter;
    expect(m.rescheduled).toBe(0);
    expect(m.firstMeetingSat).toBe(0);
  });
});
