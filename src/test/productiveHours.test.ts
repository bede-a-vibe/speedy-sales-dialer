import { describe, expect, it } from "vitest";
import {
  computeProductiveHours,
  formatHours,
  TARGET_BOOKINGS_PER_PRODUCTIVE_HOUR,
} from "@/lib/productiveHours";

/** Melbourne is UTC+10 (AEST); 23:00Z is 09:00 next-day local. */
const at = (iso: string, user_id = "rep-a") => ({ created_at: iso, user_id });

describe("computeProductiveHours", () => {
  it("measures a session as first-to-last span, not gap-by-gap", () => {
    const r = computeProductiveHours(
      [at("2026-09-01T23:00:00Z"), at("2026-09-01T23:10:00Z"), at("2026-09-01T23:20:00Z")],
      { idleCutoffMinutes: 15 },
    );
    expect(r.sessions).toBe(1);
    // 20 minutes end-to-end — not the 10+10 of the individual gaps.
    expect(r.productiveHours).toBeCloseTo(1 / 3, 6);
    expect(r.dials).toBe(3);
  });

  it("splits on a gap longer than the cutoff and drops the idle time", () => {
    const r = computeProductiveHours(
      [
        at("2026-09-01T23:00:00Z"),
        at("2026-09-01T23:10:00Z"),
        // 50 minutes idle — a new burst, and the gap is not productive time.
        at("2026-09-02T00:00:00Z"),
        at("2026-09-02T00:10:00Z"),
      ],
      { idleCutoffMinutes: 15 },
    );
    expect(r.sessions).toBe(2);
    // Two 10-minute bursts; the 50 idle minutes between them are excluded.
    expect(r.productiveHours).toBeCloseTo(1 / 3, 6);
  });

  it("is sensitive to the cutoff — the reason it is a visible control", () => {
    const logs = [
      at("2026-09-01T23:00:00Z"),
      at("2026-09-01T23:12:00Z"), // 12 min gap
      at("2026-09-01T23:24:00Z"),
    ];
    // At 15m it is one 24-minute session; at 5m it is three solo dials worth nothing.
    expect(computeProductiveHours(logs, { idleCutoffMinutes: 15 }).productiveHours).toBeCloseTo(0.4, 6);
    expect(computeProductiveHours(logs, { idleCutoffMinutes: 5 }).productiveHours).toBe(0);
  });

  it("reports single-call sessions instead of inventing time for them", () => {
    const r = computeProductiveHours([at("2026-09-01T23:00:00Z")], { idleCutoffMinutes: 15 });
    expect(r.productiveHours).toBe(0);
    expect(r.soloSessions).toBe(1);
    expect(r.soloDials).toBe(1);
    expect(r.dialsPerProductiveHour).toBeNull(); // never Infinity
  });

  it("never merges two reps dialling concurrently into one stretch of time", () => {
    const r = computeProductiveHours(
      [
        at("2026-09-01T23:00:00Z", "rep-a"),
        at("2026-09-01T23:30:00Z", "rep-a"),
        at("2026-09-01T23:05:00Z", "rep-b"),
        at("2026-09-01T23:35:00Z", "rep-b"),
      ],
      { idleCutoffMinutes: 45 },
    );
    // Two separate half-hours, not one 35-minute blur.
    expect(r.sessions).toBe(2);
    expect(r.productiveHours).toBeCloseTo(1.0, 6);
    expect(r.activeDays).toBe(1); // same Melbourne day
  });

  it("filters to one rep and counts only that rep's days", () => {
    const r = computeProductiveHours(
      [
        at("2026-09-01T23:00:00Z", "rep-a"),
        at("2026-09-01T23:30:00Z", "rep-a"),
        at("2026-09-01T23:05:00Z", "rep-b"),
      ],
      { idleCutoffMinutes: 45, repUserId: "rep-a" },
    );
    expect(r.dials).toBe(2);
    expect(r.productiveHours).toBeCloseTo(0.5, 6);
  });

  it("buckets by Melbourne day, not UTC day", () => {
    // 22:00Z and 23:00Z on 1 Sep are both 2 Sep locally (08:00 and 09:00).
    const r = computeProductiveHours(
      [at("2026-09-01T22:00:00Z"), at("2026-09-01T23:00:00Z")],
      { idleCutoffMinutes: 120 },
    );
    expect(r.activeDays).toBe(1);
    expect(r.perDay[0].day).toBe("2026-09-02");
  });

  it("derives books per productive hour against the contractual target", () => {
    const r = computeProductiveHours(
      [at("2026-09-01T23:00:00Z"), at("2026-09-02T00:00:00Z")],
      { idleCutoffMinutes: 90, bookings: 2 },
    );
    expect(r.productiveHours).toBeCloseTo(1, 6);
    expect(r.bookingsPerProductiveHour).toBeCloseTo(2, 6);
    expect(r.bookingsPerProductiveHour!).toBeGreaterThan(TARGET_BOOKINGS_PER_PRODUCTIVE_HOUR);
  });

  it("handles no data and bad timestamps without producing NaN", () => {
    const empty = computeProductiveHours([], {});
    expect(empty.productiveHours).toBe(0);
    expect(empty.hoursPerActiveDay).toBeNull();
    expect(empty.bookingsPerProductiveHour).toBeNull();

    const junk = computeProductiveHours([at("not-a-date"), at("2026-09-01T23:00:00Z")], {});
    expect(junk.dials).toBe(1);
    expect(Number.isNaN(junk.productiveHours)).toBe(false);
  });

  it("formats hours as h/m", () => {
    expect(formatHours(0.72)).toBe("0h 43m");
    expect(formatHours(7.5)).toBe("7h 30m");
    expect(formatHours(null)).toBe("—");
  });
});
