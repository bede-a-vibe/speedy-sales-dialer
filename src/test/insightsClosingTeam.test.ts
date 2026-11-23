import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { computeStats, UNMAPPED } from "@/components/insights/ClosingTracker";
import { latestScorePerCall } from "@/components/insights/TeamCoachingPanel";
import { getRepPerformance } from "@/lib/analyticsMetrics";
import { scorecardBookings } from "@/lib/repCoachingMetrics";
import type { BookedAppointmentReportItem } from "@/hooks/usePipelineItems";

// 01:00Z is midday in Melbourne, so the day key is the same in any test timezone.
const at = (day: string, hh = "01") => `${day}T${hh}:00:00Z`;
const DAY = "2026-11-10";
const DAYS = new Set([DAY]);

let seq = 0;
function item(extra: Partial<BookedAppointmentReportItem> = {}): BookedAppointmentReportItem {
  seq += 1;
  return {
    id: `item-${seq}`,
    contact_id: `contact-${seq}`,
    created_at: at("2026-11-05"),
    created_by: "ben",
    assigned_user_id: "bede",
    scheduled_for: at(DAY),
    appointment_outcome: null,
    outcome_recorded_at: null,
    status: "open",
    deal_value: null,
    monthly_recurring_value: null,
    reschedule_count: 0,
    move_count: 0,
    resolved_bucket: null,
    is_follow_up: false,
    ...extra,
  } as BookedAppointmentReportItem;
}

describe("Closing tracker: moved meetings (finding 1)", () => {
  it("treats a date-typo fix as never moved, and a real move as moved", () => {
    const typoFixed = item({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", reschedule_count: 1, move_count: 0 });
    const reallyMoved = item({ resolved_bucket: "noshow", appointment_outcome: "no_show", reschedule_count: 2, move_count: 1 });
    const s = computeStats([typoFixed, reallyMoved], DAYS, new Map());
    expect(s.movedResolved).toBe(1);
    expect(s.movedShowed).toBe(0);
    expect(s.neverMovedResolved).toBe(1);
    expect(s.neverMovedShowed).toBe(1);
  });

  it("falls back to reschedule_count only when move_count is missing (GHL rows)", () => {
    const ghl = item({ resolved_bucket: "showed", reschedule_count: 1, move_count: null });
    const s = computeStats([ghl], DAYS, new Map());
    expect(s.movedResolved).toBe(1);
  });
});

describe("Closing tracker: rep filter (finding 3)", () => {
  it("counts bookings made by setter and meetings by closer", () => {
    const all = [
      // Ben set it, Bede runs it.
      item({ created_at: at(DAY), created_by: "ben", assigned_user_id: "bede", resolved_bucket: "showed" }),
      // Ben set it, Ben runs it.
      item({ created_at: at(DAY), created_by: "ben", assigned_user_id: "ben", resolved_bucket: "noshow" }),
      // Lachlan set it, Bede runs it.
      item({ created_at: at(DAY), created_by: "lachlan", assigned_user_id: "bede", resolved_bucket: "showed" }),
    ];
    const asCloser = (rep: string) => all.filter((i) => i.assigned_user_id === rep);
    const asSetter = (rep: string) => all.filter((i) => i.created_by === rep);

    const ben = computeStats(asCloser("ben"), DAYS, new Map(), asSetter("ben"));
    expect(ben.booked).toBe(2);
    expect(ben.due).toBe(1);
    expect(ben.showed).toBe(0);

    const bede = computeStats(asCloser("bede"), DAYS, new Map(), asSetter("bede"));
    expect(bede.booked).toBe(0);
    expect(bede.due).toBe(2);
    expect(bede.showed).toBe(2);

    // Team-wide, slots are the same whoever is picked.
    expect(ben.availableSlots).toBe(bede.availableSlots);
  });
});

describe("Closing tracker: other corrections", () => {
  it("only adds Fathom minutes for sittings that showed (finding 5)", () => {
    const sat = item({ resolved_bucket: "showed" });
    const noShow = item({ resolved_bucket: "noshow" });
    const s = computeStats([sat, noShow], DAYS, new Map([[sat.id, 40], [noShow.id, 72]]));
    expect(s.meetingMinutes).toBe(40);
  });

  it("puts unlabelled DQ and objection reasons in Other / unmapped (finding 7)", () => {
    const s = computeStats(
      [
        item({ resolved_bucket: "showed", appointment_outcome: "disqualified", dq_reason: "Not viable for now" }),
        item({ resolved_bucket: "showed", appointment_outcome: "disqualified", dq_reason: "dq_too_small" }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", outcome_reason: "free text", pitched: true }),
      ],
      DAYS,
      new Map(),
    );
    expect(s.dq).toBe(2);
    expect(s.dqReasons[UNMAPPED]).toBe(1);
    expect(s.dqReasons.dq_too_small).toBe(1);
    expect(s.obj[UNMAPPED]).toBe(1);
  });

  it("makes the not-closed breakdown add up to pitched minus closed (finding 8)", () => {
    const s = computeStats(
      [
        item({ resolved_bucket: "showed", appointment_outcome: "showed_closed", monthly_recurring_value: 2000 }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_verbal_commitment" }),
        item({ resolved_bucket: "showed", appointment_outcome: "second_meeting_booked", pitched: true }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", outcome_reason: "price_budget" }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_no_close" }),
      ],
      DAYS,
      new Map(),
    );
    expect(s.pitched).toBe(5);
    expect(s.notClosed).toBe(4);
    const objectionRows = Object.values(s.obj).reduce((a, b) => a + b, 0);
    expect(s.notClosedVerbal).toBe(2);
    expect(objectionRows + s.notClosedVerbal).toBe(s.notClosed);
  });

  it("uses is_qualified === true for the qualified close rate denominator (finding 10)", () => {
    const s = computeStats(
      [
        item({ resolved_bucket: "showed", appointment_outcome: "showed_closed", is_qualified: true }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", is_qualified: null }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", is_qualified: false }),
      ],
      DAYS,
      new Map(),
    );
    expect(s.pitched).toBe(3);
    expect(s.pitchedQualified).toBe(1);
  });

  it("leaves cancelled meetings out of double booked (finding 11)", () => {
    const slot = at(DAY, "06");
    const s = computeStats(
      [
        item({ scheduled_for: slot, resolved_bucket: "showed" }),
        item({ scheduled_for: slot, resolved_bucket: "cancelled" }),
      ],
      DAYS,
      new Map(),
    );
    expect(s.doubleBooked).toBe(0);
    const t = computeStats(
      [item({ scheduled_for: slot, resolved_bucket: "showed" }), item({ scheduled_for: slot, resolved_bucket: "noshow" })],
      DAYS,
      new Map(),
    );
    expect(t.doubleBooked).toBe(1);
  });
});

type Booking = Parameters<typeof getRepPerformance>[1][number];
function booking(extra: Partial<Booking>): Booking {
  seq += 1;
  return {
    id: `b-${seq}`,
    contact_id: `c-${seq}`,
    created_at: at(DAY),
    created_by: "ben",
    assigned_user_id: "bede",
    scheduled_for: at("2026-11-12"),
    appointment_outcome: null,
    deal_value: null,
    monthly_recurring_value: null,
    resolved_bucket: null,
    is_follow_up: false,
    ...extra,
  };
}
const FROM = "2026-11-09";
const TO = "2026-11-17";
const rowFor = (rows: ReturnType<typeof getRepPerformance>, rep: string) => rows.find((r) => r.repUserId === rep);

describe("Team leaderboard: Showed (finding 1)", () => {
  it("counts first meetings that sat by resolved_bucket, not cancelled outcomes", () => {
    const rows = getRepPerformance(
      [],
      [
        booking({ resolved_bucket: "showed", appointment_outcome: "showed_no_close" }),
        booking({ resolved_bucket: "cancelled", appointment_outcome: "cancelled" }),
        booking({ resolved_bucket: "noshow", appointment_outcome: "no_show" }),
        // Second meeting that sat: a sitting, not a first-meeting show.
        booking({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", is_follow_up: true }),
      ],
      FROM,
      TO,
    );
    const ben = rowFor(rows, "ben")!;
    expect(ben.showed).toBe(1);
    expect(ben.showRate).toBeCloseTo(33.3, 1);
  });
});

describe("Team leaderboard: Book (finding 2)", () => {
  it("leaves second meetings out so rows sum to the team's bookings made", () => {
    const rows = getRepPerformance(
      [],
      [
        booking({ created_by: "ben" }),
        booking({ created_by: "ben", is_follow_up: true }),
        booking({ created_by: "lachlan" }),
        booking({ created_by: "lachlan" }),
        booking({ created_by: "lachlan", created_at: at("2026-10-20") }), // booked before the window
      ],
      FROM,
      TO,
    );
    expect(rowFor(rows, "ben")!.bookings).toBe(1);
    expect(rowFor(rows, "lachlan")!.bookings).toBe(2);
    expect(rows.reduce((s, r) => s + r.bookings, 0)).toBe(3);
  });
});

describe("Team leaderboard: close attribution (findings 4 and 6)", () => {
  // Ben set the lead on 4 Nov; Bede logged the follow-up; Ben is the assigned closer.
  const firstMeeting = booking({
    contact_id: "sean", created_at: at("2026-11-04"), created_by: "ben", assigned_user_id: "bede",
    scheduled_for: at("2026-11-06"), resolved_bucket: "showed", appointment_outcome: "second_meeting_booked",
  });
  const closingMeeting = booking({
    contact_id: "sean", created_at: at("2026-11-06"), created_by: "bede", assigned_user_id: "ben",
    scheduled_for: at("2026-11-10"), resolved_bucket: "showed", appointment_outcome: "showed_closed",
    monthly_recurring_value: 2000, is_follow_up: true,
  });

  it("credits the setter of the lead's first booking, from full history", () => {
    // The first booking is outside the window and not in the list; the lookup carries it.
    const rows = getRepPerformance([], [closingMeeting], FROM, TO, new Map([["sean", "ben"]]));
    expect(rowFor(rows, "ben")!.closed).toBe(1);
    expect(rowFor(rows, "bede")?.closed ?? 0).toBe(0);
  });

  it("falls back to the earliest booking in the list", () => {
    const rows = getRepPerformance([], [firstMeeting, closingMeeting], FROM, TO);
    expect(rowFor(rows, "ben")!.closed).toBe(1);
    expect(rowFor(rows, "bede")!.closed).toBe(0);
  });

  it("adds closer columns keyed on assigned_user_id", () => {
    const rows = getRepPerformance([], [closingMeeting], FROM, TO, new Map([["sean", "lachlan"]]));
    const ben = rowFor(rows, "ben")!;
    expect(ben.closerSat).toBe(1);
    expect(ben.closerClosed).toBe(1);
    expect(ben.closerMrr).toBe(2000);
    expect(rowFor(rows, "lachlan")!.closed).toBe(1);
  });

  it("uses first collection, not a 12-month projection, for $ and $/Dial", () => {
    const dials = Array.from({ length: 26 }, (_, i) => ({
      id: `log-${i}`, contact_id: "x", user_id: "ben", outcome: "no_answer", created_at: at(DAY),
      dialpad_talk_time_seconds: 0, dialpad_total_duration_seconds: 0, reached_connection: false,
    }));
    const rows = getRepPerformance(dials as never, [closingMeeting], FROM, TO, new Map([["sean", "ben"]]));
    const ben = rowFor(rows, "ben")!;
    expect(ben.firstCollection).toBe(2000);
    expect(ben.revenuePerDial).toBeCloseTo(76.92, 2);
    expect(ben.firstYearValue).toBe(24000);
  });
});

describe("Coaching scorecards: bookings in the window (finding 3)", () => {
  it("keeps only first meetings booked inside the window", () => {
    const kept = scorecardBookings(
      [
        { id: "a", created_at: at(DAY) },
        { id: "b", created_at: at("2026-10-20") },
        { id: "c", created_at: at(DAY), is_follow_up: true },
        { id: "d", created_at: at(DAY), is_reschedule_slot: true },
      ],
      FROM,
      TO,
    );
    expect(kept.map((k) => k.id)).toEqual(["a"]);
  });
});

describe("Team coaching: one score per call (finding 7)", () => {
  it("keeps the latest score for each call", () => {
    const rows = [
      { id: "1", call_log_id: "call-a", created_at: "2026-11-10T01:00:00Z", v: 1 },
      { id: "2", call_log_id: "call-a", created_at: "2026-11-12T01:00:00Z", v: 2 },
      { id: "3", call_log_id: "call-b", created_at: "2026-11-10T01:00:00Z", v: 3 },
      { id: "4", call_log_id: null, created_at: "2026-11-10T01:00:00Z", v: 4 },
    ];
    const latest = latestScorePerCall(rows);
    expect(latest.map((r) => r.v).sort()).toEqual([2, 3]);
  });
});

describe("Closing tracker: qualified live calls", () => {
  it("counts marked sittings only, so an unmarked one never counts against the rate", () => {
    const s = computeStats(
      [
        item({ resolved_bucket: "showed", appointment_outcome: "showed_closed", is_qualified: true }),
        item({ resolved_bucket: "showed", appointment_outcome: "disqualified", is_qualified: false }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", is_qualified: null }),
        item({ resolved_bucket: "noshow", appointment_outcome: "no_show", is_qualified: true }),
      ],
      DAYS,
      new Map(),
    );
    expect(s.qualifiedLive).toBe(1);
    expect(s.notQualifiedLive).toBe(1);
    // The close came from a qualified sitting: 1 of 1 qualified live calls closed.
    expect(s.closedQualifiedLive).toBe(1);
  });
});

describe("Closing tracker: why they didn't close", () => {
  it("counts every sitting that didn't close by its objection, pitched or not, and keeps verbal yeses and DQs out", () => {
    const s = computeStats(
      [
        item({ resolved_bucket: "showed", appointment_outcome: "showed_no_close", outcome_reason: "price_budget" }),
        item({ resolved_bucket: "showed", appointment_outcome: "second_meeting_booked", outcome_reason: "think_partner" }),
        item({ resolved_bucket: "showed", appointment_outcome: "no_close_follow_up", outcome_reason: "timing" }),
        item({ resolved_bucket: "showed", appointment_outcome: "no_close_follow_up", outcome_reason: "dq_too_small" }),
        item({ resolved_bucket: "showed", appointment_outcome: "no_close_follow_up", outcome_reason: null }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_verbal_commitment" }),
        item({ resolved_bucket: "showed", appointment_outcome: "disqualified", dq_reason: "dq_wrong_fit" }),
        item({ resolved_bucket: "showed", appointment_outcome: "showed_closed" }),
      ],
      DAYS,
      new Map(),
    );
    // The second meeting is still in play, not a no-close. The DQ-reason no-close is in the DQ pile.
    expect(s.didntClose).toBe(3);
    expect(s.why).toEqual({ price_budget: 1, timing: 1, unrecorded: 1 });
    expect(s.stillInPlay).toBe(1);
    expect(s.nextStep).toEqual({ think_partner: 1 });
  });
});

describe("Closing tracker: a second meeting stops counting once the next meeting happens", () => {
  it("keeps it in play only while the next meeting is still ahead", () => {
    const s = computeStats(
      [
        // Lead A: second meeting booked, then closed on the next one. Counts once, as a close.
        item({ contact_id: "A", resolved_bucket: "showed", appointment_outcome: "second_meeting_booked", outcome_reason: "think_partner" }),
        item({ contact_id: "A", scheduled_for: at("2026-11-12"), resolved_bucket: "showed", appointment_outcome: "showed_closed", status: "completed" }),
        // Lead B: second meeting booked, next meeting not held yet. Still in play.
        item({ contact_id: "B", resolved_bucket: "showed", appointment_outcome: "second_meeting_booked", outcome_reason: "think_partner" }),
        item({ contact_id: "B", scheduled_for: at("2026-11-20"), resolved_bucket: "upcoming", appointment_outcome: null }),
      ],
      DAYS,
      new Map(),
    );
    expect(s.stillInPlay).toBe(1);
    expect(s.nextStep).toEqual({ think_partner: 1 });
  });
});
