import { describe, expect, it } from "vitest";
import {
  getBookingHeatMapData,
  getCloseRateHeatMapData,
  getHourlyMetrics,
  getShowUpHeatMapData,
  isHumanConnect,
  summariseTalkTime,
  todayLocalDateKey,
  type TalkTimeCallRow,
} from "@/lib/hourlyMetrics";

/** ISO for a LOCAL wall-clock time, so the tests hold in any machine timezone. */
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
/** The heat maps key cells as Mon=0 day-of-week and local hour. */
const dowOf = (iso: string) => (new Date(iso).getDay() + 6) % 7;

const RANGE = { dateFrom: "2026-11-09", dateTo: "2026-11-16" };

let seq = 0;
function meeting(overrides: Record<string, unknown>) {
  seq += 1;
  return {
    id: `m${seq}`,
    contact_id: `c${seq}`,
    created_at: at(2026, 11, 3, 10),
    created_by: "ben",
    assigned_user_id: "closer",
    scheduled_for: at(2026, 11, 11, 10),
    status: "completed",
    appointment_outcome: null,
    deal_value: null,
    reschedule_count: 0,
    resolved_bucket: null,
    is_follow_up: false,
    ...overrides,
  } as never;
}

const sumBase = (cells: Array<{ base: number }>) => cells.reduce((a, c) => a + c.base, 0);
const sumHits = (cells: Array<{ hits: number }>) => cells.reduce((a, c) => a + c.hits, 0);

describe("Close Rate heat map uses wasPitched (finding 6)", () => {
  const slot = at(2026, 11, 11, 14);
  const items = [
    // Closed: always a pitch.
    meeting({ scheduled_for: slot, appointment_outcome: "showed_closed", resolved_bucket: "showed", pitched: null }),
    // Closer said Not pitched: out, even though the outcome reads like a pitch.
    meeting({ scheduled_for: slot, appointment_outcome: "no_close_follow_up", resolved_bucket: "showed", pitched: false }),
    meeting({ scheduled_for: slot, appointment_outcome: "showed_no_close", resolved_bucket: "showed", pitched: false }),
    // Second meeting booked but the closer said Pitched: in.
    meeting({ scheduled_for: slot, appointment_outcome: "second_meeting_booked", resolved_bucket: "showed", pitched: true }),
    // Older row, no answer: falls back to the outcome.
    meeting({ scheduled_for: slot, appointment_outcome: "showed_verbal_commitment", resolved_bucket: "showed" }),
    // Not qualified: excluded.
    meeting({ scheduled_for: slot, appointment_outcome: "showed_no_close", resolved_bucket: "showed", pitched: true, is_qualified: false }),
    // Pitched but scheduled after the range: excluded.
    meeting({ scheduled_for: at(2026, 11, 20, 14), appointment_outcome: "showed_no_close", resolved_bucket: "showed", pitched: true }),
  ];

  it("counts closed / pitched on the closer's answer", () => {
    const cells = getCloseRateHeatMapData(items, undefined, RANGE);
    expect(sumBase(cells)).toBe(3);
    expect(sumHits(cells)).toBe(1);
    const cell = cells.find((c) => c.dayOfWeek === dowOf(slot) && c.hour === 14)!;
    expect(cell.base).toBe(3);
    expect(cell.rate).toBeCloseTo(1 / 3);
  });

  it("filters on the closer", () => {
    expect(sumBase(getCloseRateHeatMapData(items, "someone-else", RANGE))).toBe(0);
    expect(sumBase(getCloseRateHeatMapData(items, "closer", RANGE))).toBe(3);
  });
});

describe("Show-Up Rate heat map matches the Show-Up Rate rule (finding 5)", () => {
  const ten = at(2026, 11, 11, 10);
  const meetings = [
    meeting({ scheduled_for: ten, appointment_outcome: "showed_no_close", resolved_bucket: "showed" }),
    meeting({ scheduled_for: ten, appointment_outcome: "no_show", resolved_bucket: "noshow" }),
    meeting({ scheduled_for: ten, appointment_outcome: "cancelled", resolved_bucket: "cancelled" }),
    // Pending and upcoming are not resolved.
    meeting({ scheduled_for: ten, resolved_bucket: "pending" }),
    meeting({ scheduled_for: ten, resolved_bucket: "upcoming" }),
    // A follow-up is the closer's slot, not the setter's.
    meeting({ scheduled_for: ten, appointment_outcome: "showed_closed", resolved_bucket: "showed", is_follow_up: true }),
    // Cancelled but scheduled after the range: out.
    meeting({ scheduled_for: at(2026, 11, 18, 10), appointment_outcome: "cancelled", resolved_bucket: "cancelled" }),
  ];
  const movedFrom = at(2026, 11, 12, 15);
  const rescheduleSlots = [
    meeting({ id: "reschedule:r1", scheduled_for: movedFrom, appointment_outcome: "rescheduled", resolved_bucket: "rescheduled", is_reschedule_slot: true }),
    // Missed slot of a follow-up: out.
    meeting({ id: "reschedule:r2", scheduled_for: movedFrom, appointment_outcome: "rescheduled", resolved_bucket: "rescheduled", is_reschedule_slot: true, is_follow_up: true }),
    // Missed slot outside the range: out.
    meeting({ id: "reschedule:r3", scheduled_for: at(2026, 11, 2, 15), appointment_outcome: "rescheduled", resolved_bucket: "rescheduled", is_reschedule_slot: true }),
  ];

  it("is showed / (showed + noshow + cancelled + rescheduled), first meetings in range", () => {
    const cells = getShowUpHeatMapData(meetings, undefined, { ...RANGE, rescheduleSlots });
    expect(sumBase(cells)).toBe(4);
    expect(sumHits(cells)).toBe(1);
  });

  it("puts a moved meeting at the time it was moved from, as a miss", () => {
    const cells = getShowUpHeatMapData(meetings, undefined, { ...RANGE, rescheduleSlots });
    const cell = cells.find((c) => c.dayOfWeek === dowOf(movedFrom) && c.hour === 15)!;
    expect(cell.base).toBe(1);
    expect(cell.hits).toBe(0);
  });

  it("does not double count a slot that also arrives mixed into the bookings", () => {
    const cells = getShowUpHeatMapData([...meetings, rescheduleSlots[0]], undefined, { ...RANGE, rescheduleSlots });
    expect(sumBase(cells)).toBe(4);
  });

  it("filters on the setter", () => {
    expect(sumBase(getShowUpHeatMapData(meetings, "lachlan", { ...RANGE, rescheduleSlots }))).toBe(0);
    expect(sumBase(getShowUpHeatMapData(meetings, "ben", { ...RANGE, rescheduleSlots }))).toBe(4);
  });
});

describe("Booking heat map counts bookings made in the range (finding 7)", () => {
  const madeInRange = at(2026, 11, 10, 11);
  const items = [
    meeting({ created_at: madeInRange }),
    meeting({ created_at: madeInRange }),
    // Booked before the window, meeting inside it: not a booking made in range.
    meeting({ created_at: at(2026, 11, 5, 11), scheduled_for: at(2026, 11, 12, 10) }),
    // Second meeting: not a booking made.
    meeting({ created_at: madeInRange, is_follow_up: true }),
    // Missed slot of a moved meeting: never a booking.
    meeting({ id: "reschedule:x", created_at: madeInRange, is_reschedule_slot: true }),
  ];

  it("keeps only first-meeting bookings created in the range", () => {
    const cells = getBookingHeatMapData(items, undefined, RANGE);
    expect(cells.reduce((a, c) => a + c.count, 0)).toBe(2);
    expect(cells.find((c) => c.dayOfWeek === dowOf(madeInRange) && c.hour === 11)!.count).toBe(2);
  });

  it("filters on the setter", () => {
    expect(getBookingHeatMapData(items, "lachlan", RANGE).reduce((a, c) => a + c.count, 0)).toBe(0);
  });
});

describe("Talk time panel counts human connects only (finding 1)", () => {
  const row = (o: Partial<TalkTimeCallRow>): TalkTimeCallRow => ({
    user_id: "ben",
    talk_time_seconds: 0,
    started_at: at(2026, 11, 10, 10),
    is_connected: false,
    direction: "outbound",
    outcome: "no_answer",
    ...o,
  });
  const rows = [
    row({ is_connected: true, outcome: "not_interested", talk_time_seconds: 60 }),
    row({ is_connected: true, outcome: "booked", talk_time_seconds: 300 }),
    // Dialpad "connected" voicemail and machine pickups.
    row({ is_connected: true, outcome: "no_answer", talk_time_seconds: 8 }),
    row({ is_connected: true, outcome: "voicemail", talk_time_seconds: 20 }),
    // Connected with no linked call log: cannot confirm a person.
    row({ is_connected: true, outcome: null, talk_time_seconds: 40 }),
    row({}),
    // Inbound: not a dial, talk still counts.
    row({ direction: "inbound", is_connected: true, outcome: null, talk_time_seconds: 30 }),
    row({ user_id: "lachlan", is_connected: true, outcome: "follow_up", talk_time_seconds: 100 }),
  ];

  it("needs is_connected and a non-machine outcome", () => {
    expect(isHumanConnect({ is_connected: true, outcome: "gatekeeper" })).toBe(true);
    expect(isHumanConnect({ is_connected: true, outcome: "voicemail" })).toBe(false);
    expect(isHumanConnect({ is_connected: false, outcome: "booked" })).toBe(false);
  });

  it("applies the rule to connects, talk and avg talk per connect", () => {
    const s = summariseTalkTime(rows, "ben");
    expect(s.calls).toBe(6);
    expect(s.humanConnects).toBe(2);
    expect(s.connectRate).toBeCloseTo(2 / 6);
    expect(s.talkSeconds).toBe(60 + 300 + 30);
    expect(s.avgTalkPerConnect).toBe(180);
  });

  it("covers the team when no rep is given", () => {
    const s = summariseTalkTime(rows);
    expect(s.calls).toBe(7);
    expect(s.humanConnects).toBe(3);
  });
});

describe("Hourly Breakdown (findings 9 and 10)", () => {
  it("defaults to the local date, not the UTC date", () => {
    // 7:24am local on 17 Nov. In Melbourne that is still 16 Nov in UTC.
    expect(todayLocalDateKey(new Date(2026, 10, 17, 7, 24))).toBe("2026-11-17");
  });

  it("Connections is the Connection stage, not a copy of Pick Ups", () => {
    const log = (o: Record<string, unknown>) => ({
      id: Math.random().toString(),
      contact_id: "c",
      user_id: "ben",
      created_at: at(2026, 11, 17, 9, 15),
      outcome: "no_answer",
      dialpad_talk_time_seconds: 0,
      dialpad_total_duration_seconds: 0,
      exit_reason_connection: null,
      reached_connection: false,
      reached_commitment: false,
      ...o,
    }) as never;
    const rows = getHourlyMetrics(
      [log({ outcome: "gatekeeper" }), log({ outcome: "booked", reached_connection: true }), log({})],
      [],
      "2026-11-17",
    );
    expect(rows[9].dials).toBe(3);
    expect(rows[9].pickUps).toBe(2);
    expect(rows[9].connections).toBe(1);
  });
});
