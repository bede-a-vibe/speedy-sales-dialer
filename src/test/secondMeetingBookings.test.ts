import { describe, expect, it } from "vitest";
import { markFollowUpMeetings } from "@/lib/mergeMeetingStreams";
import { getReportMetrics, type ReportBookingItem } from "@/lib/reportMetrics";

const DAY = "2026-11-04";
const row = (id: string, contact_id: string, created_at: string, scheduled_for: string, extra: Partial<ReportBookingItem> = {}) =>
  ({
    id, contact_id, created_at, scheduled_for,
    created_by: "ben", assigned_user_id: "ben", status: "open",
    appointment_outcome: null, deal_value: null, reschedule_count: 0, ...extra,
  }) as ReportBookingItem;

// Earlier bookings sit outside the reporting window, as they do on the Insights page.
const history = [
  { id: "sat", contact_id: "second", created_at: "2026-10-29T22:00:00Z", scheduled_for: "2026-11-03T06:00:00Z", appointment_outcome: "second_meeting_booked", resolved_bucket: "showed" },
  { id: "ghosted", contact_id: "rebook", created_at: "2026-10-20T22:00:00Z", scheduled_for: "2026-10-22T06:00:00Z", appointment_outcome: "no_show", resolved_bucket: "noshow" },
];

function metrics(extra: Partial<ReportBookingItem> = {}, repUserId?: string) {
  const items = [
    row("new-1", "fresh", "2026-11-03T23:00:00Z", "2026-11-06T04:00:00Z"),
    row("rebook-1", "rebook", "2026-11-03T23:30:00Z", "2026-11-07T04:00:00Z"),
    row("second-1", "second", "2026-11-03T22:38:00Z", "2026-11-05T04:00:00Z", { created_by: "bede", ...extra }),
  ];
  return getReportMetrics({
    callLogs: [], bookedItems: markFollowUpMeetings(items, [...history, ...items]), from: DAY, to: DAY, repUserId,
  });
}

describe("second meetings in bookings made", () => {
  it("counts a second meeting on its own, not as a booking made", () => {
    const { bookingsMade } = metrics();
    expect(bookingsMade.totalBookingsMade).toBe(2);
    expect(bookingsMade.secondMeetingsBooked).toBe(1);
  });

  it("splits new from rebooked using history outside the window", () => {
    const { bookingsMade } = metrics();
    expect(bookingsMade.newBookings).toBe(1);
    expect(bookingsMade.rebooked).toBe(1);
  });

  it("shows the person who logged it a second meeting, not a booking", () => {
    const { bookingsMade } = metrics({}, "bede");
    expect(bookingsMade.totalBookingsMade).toBe(0);
    expect(bookingsMade.secondMeetingsBooked).toBe(1);
  });

  it("keeps revenue from a deal closed at a second meeting", () => {
    const m = metrics({ appointment_outcome: "showed_closed", deal_value: 2000 });
    expect(m.bookingsMade.totalBookingsMade).toBe(2);
    expect(m.sales.setupRevenue).toBe(2000);
    expect(m.sales.closes).toBe(1);
  });
});
