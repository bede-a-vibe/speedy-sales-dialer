import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { buildBookedReport, buildRescheduleSlots, type BookedRaw } from "@/hooks/usePipelineItems";
import { sliceCallLogsToRange } from "@/hooks/useCallLogs";
import { dashboardWindow } from "@/lib/dashboardWindow";

// Local-time ISO for a local day + hour, the way the app compares local days.
const at = (day: string, hour = 10) => new Date(`${day}T${String(hour).padStart(2, "0")}:00:00`).toISOString();

const dialer = (id: string, contact: string, created: string, scheduled: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, contact_id: contact, created_at: created, created_by: "ben", assigned_user_id: "bede", scheduled_for: scheduled, appointment_outcome: null, outcome_recorded_at: null, status: "pending", deal_value: null, monthly_recurring_value: null, reschedule_count: 0, is_qualified: null, ...extra }) as never;
const ghl = (id: string, contact: string, booked: string, start: string) =>
  ({ id, stream: "ghl", contact_id: contact, start_time: start, booked_at: booked, rep_user_id: null, resolved_outcome: null, outcome_reason: null, reschedule_count: 0, mrr: null, led_to_deal: false, channel: "Cold Call", is_linked: true, meeting_type: null, title: "Odin Digital Growth Session" }) as never;

const WIDE: BookedRaw = {
  dialer: [
    dialer("d1", "c1", at("2026-11-03"), at("2026-11-19")),
    dialer("d2", "c2", at("2026-11-19"), at("2026-11-25")),
    dialer("d3", "c3", at("2026-11-05"), at("2026-11-06"), { is_qualified: true }),
  ],
  ghl: [
    ghl("g1", "c1", at("2026-11-03"), at("2026-11-19")), // same contact + day as d1: dropped as a duplicate
    ghl("g2", "c4", at("2026-11-18"), at("2026-11-19")), // calendar-only meeting today
    ghl("g3", "c4", at("2026-11-02"), at("2026-11-04")), // the same lead's earlier meeting, outside today
  ],
  calls: [
    { contact_id: "c4", user_id: "lachlan", created_at: at("2026-11-01") },
    { contact_id: "c4", user_id: "ben", created_at: at("2026-11-18", 9) },
  ],
  contactsById: new Map(),
  verdictRows: [{ contact_id: "c4", is_qualified: true }],
  history: [
    { id: "h1", contact_id: "c4", created_at: at("2026-11-02"), scheduled_for: at("2026-11-04"), appointment_outcome: "showed_no_close", resolved_bucket: "showed" },
    { id: "d1", contact_id: "c1", created_at: at("2026-11-03"), scheduled_for: at("2026-11-19"), appointment_outcome: null, resolved_bucket: null },
  ],
};

/** What fetchBookedRaw would hold had it been asked for [from, to] only. */
function narrow(raw: BookedRaw, from: string, to: string): BookedRaw {
  const local = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const inR = (c: string, s: string | null) => (local(c) >= from && local(c) <= to) || (!!s && local(s) >= from && local(s) <= to);
  const d = raw.dialer.filter((x: { created_at: string; scheduled_for: string | null }) => inR(x.created_at, x.scheduled_for));
  const g = raw.ghl.filter((x: { booked_at: string; start_time: string }) => inR(x.booked_at ?? x.start_time, x.start_time));
  const gc = new Set(g.map((x: { contact_id: string }) => x.contact_id));
  const ids = new Set([...d.map((x: { contact_id: string }) => x.contact_id), ...gc]);
  return {
    dialer: d,
    ghl: g,
    calls: raw.calls.filter((c) => gc.has(c.contact_id!)),
    contactsById: raw.contactsById,
    verdictRows: raw.verdictRows.filter((v) => gc.has(v.contact_id)),
    history: raw.history.filter((h) => ids.has(h.contact_id)),
  };
}

describe("Dashboard cards sharing one load", () => {
  it("builds each card's bookings from the shared rows exactly as its own load would", () => {
    for (const [from, to] of [["2026-11-19", "2026-11-19"], ["2026-11-16", "2026-11-22"], ["2026-11-01", "2026-11-19"]]) {
      expect(buildBookedReport(WIDE, from, to)).toEqual(buildBookedReport(narrow(WIDE, from, to), from, to));
    }
    // Today: d1, d2 and the calendar-only g2 (a follow-up, since the lead sat on 4 Nov), not the g1 duplicate.
    const today = buildBookedReport(WIDE, "2026-11-19", "2026-11-19");
    expect(today.map((r) => r.id).sort()).toEqual(["d1", "d2", "g2"]);
    const g2 = today.find((r) => r.id === "g2") as unknown as { is_follow_up: boolean; is_qualified: boolean | null };
    expect(g2.is_follow_up).toBe(true);
    expect(g2.is_qualified).toBe(true);
  });

  it("slices call logs on the same bounds as the server filter", () => {
    const rows = [
      { id: "a", created_at: at("2026-11-18", 23) },
      { id: "b", created_at: at("2026-11-19", 0) },
      { id: "c", created_at: new Date("2026-11-19T23:59:59.999").toISOString() },
      { id: "d", created_at: at("2026-11-20", 0) },
    ];
    expect(sliceCallLogsToRange(rows, "2026-11-19", "2026-11-19").map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("slices reschedule slots by the local day missed", () => {
    const slot = (id: string, day: string) => ({ id, contact_id: "c9", created_at: at("2026-11-01"), scheduled_for: at(day), appointment_outcome: "rescheduled" }) as never;
    const raw = { slots: [slot("r1", "2026-11-17"), slot("r2", "2026-11-19")], history: [] };
    expect(buildRescheduleSlots(raw, "2026-11-19", "2026-11-19").map((s: { id: string }) => s.id)).toEqual(["r2"]);
  });

  it("the shared window covers this week and this month", () => {
    const w = dashboardWindow(new Date("2026-11-30T12:00:00"));
    expect(w.from <= "2026-11-01").toBe(true);
    expect(w.to >= "2026-12-06").toBe(true);
    const early = dashboardWindow(new Date("2026-10-01T12:00:00")); // a Thursday: the week starts in September
    expect(early.from <= "2026-09-28").toBe(true);
  });
});
