import { describe, expect, it } from "vitest";
import {
  DIAL_SECONDS_PER_DIAL,
  BOOKING_MINUTES,
  PRODUCTIVE_IDLE_CUTOFF_MIN,
  melbourneDayKey,
  productiveDiallingHours,
  productiveHours,
} from "@/lib/kpiStandards";

const MIN = 60_000;
const t = (iso: string) => new Date(iso).getTime();

describe("productiveDiallingHours (the owner definition)", () => {
  it("is dials × 25s + talk time + bookings × 5 min", () => {
    // 100 dials = 2500s, 30 min talk = 1800s, 4 bookings = 1200s → 5500s
    expect(productiveDiallingHours(100, 1800, 4)).toBeCloseTo(5500 / 3600, 9);
  });

  it("uses the locked allowances, not hardcoded numbers", () => {
    expect(DIAL_SECONDS_PER_DIAL).toBe(25);
    expect(BOOKING_MINUTES).toBe(5);
    expect(productiveDiallingHours(1, 0, 0)).toBeCloseTo(DIAL_SECONDS_PER_DIAL / 3600, 9);
    expect(productiveDiallingHours(0, 0, 1)).toBeCloseTo((BOOKING_MINUTES * 60) / 3600, 9);
  });

  it("treats missing talk time as zero rather than NaN", () => {
    expect(productiveDiallingHours(10, null as unknown as number)).toBeCloseTo(250 / 3600, 9);
    expect(Number.isNaN(productiveDiallingHours(10, undefined as unknown as number))).toBe(false);
  });

  it("returns zero for a rep with no activity", () => {
    expect(productiveDiallingHours(0, 0, 0)).toBe(0);
  });

  it("credits a booked call both as a dial and as wrap-up time", () => {
    // One dial that booked: 25s dialling + 5 min wrap-up. Deliberate per the
    // definition — the booking allowance is additive, not a replacement.
    expect(productiveDiallingHours(1, 0, 1)).toBeCloseTo((25 + 300) / 3600, 9);
  });
});

describe("productiveHours (span fallback for reps with no call rows)", () => {
  it("sums gaps inside a session", () => {
    const base = t("2026-09-28T23:00:00Z");
    expect(productiveHours([base, base + 10 * MIN, base + 20 * MIN])).toBeCloseTo(20 / 60, 9);
  });

  it("drops a gap longer than the cutoff instead of capping it", () => {
    const base = t("2026-09-28T23:00:00Z");
    // 10 min, then 50 min idle, then 10 min → 20 min productive, not 70.
    const hrs = productiveHours([base, base + 10 * MIN, base + 60 * MIN, base + 70 * MIN]);
    expect(hrs).toBeCloseTo(20 / 60, 9);
  });

  it("counts a gap exactly on the cutoff as still dialling", () => {
    const base = t("2026-09-28T23:00:00Z");
    expect(productiveHours([base, base + PRODUCTIVE_IDLE_CUTOFF_MIN * MIN])).toBeCloseTo(
      PRODUCTIVE_IDLE_CUTOFF_MIN / 60,
      9,
    );
  });

  it("is zero for fewer than two dials — a lone dial has no measurable span", () => {
    expect(productiveHours([])).toBe(0);
    expect(productiveHours([t("2026-09-28T23:00:00Z")])).toBe(0);
  });

  it("does not care what order the timestamps arrive in", () => {
    const base = t("2026-09-28T23:00:00Z");
    const asc = productiveHours([base, base + 5 * MIN, base + 10 * MIN]);
    const desc = productiveHours([base + 10 * MIN, base, base + 5 * MIN]);
    expect(desc).toBeCloseTo(asc, 9);
  });
});

describe("melbourneDayKey", () => {
  it("buckets by Melbourne date, not the viewer's timezone", () => {
    // 23:00Z on 28 Sep is 09:00 on 29 Sep in Melbourne (UTC+10).
    expect(melbourneDayKey(t("2026-09-28T23:00:00Z"))).toBe("2026-09-29");
    expect(melbourneDayKey(t("2026-09-28T13:00:00Z"))).toBe("2026-09-28");
  });

  it("keeps one Melbourne working day as a single key across the UTC midnight", () => {
    // 08:00 and 18:00 Melbourne on 29 Sep straddle midnight UTC.
    expect(melbourneDayKey(t("2026-09-28T22:00:00Z"))).toBe("2026-09-29");
    expect(melbourneDayKey(t("2026-09-29T08:00:00Z"))).toBe("2026-09-29");
  });
});
