import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ManagerMetrics } from "@/components/training/ManagerMetrics";
import { setterShowRate, statsFor } from "@/lib/managerMetrics";
import { shiftDateKey, todayDateKey, type ReportBookingItem, type ReportCallLog } from "@/lib/reportMetrics";

const DAY = 86_400_000;
const s = vi.hoisted(() => ({ logs: [] as unknown[], bookings: [] as unknown[], slots: [] as unknown[], coaching: [] as unknown[], error: false, ranges: [] as string[] }));
vi.mock("@/hooks/useCallLogs", () => ({ useCallLogsByDateRange: () => ({ data: s.error ? undefined : s.logs, isLoading: false, isError: s.error, dataUpdatedAt: Date.now() }) }));
vi.mock("@/hooks/usePipelineItems", () => ({
  useSalesReps: () => ({ data: [{ user_id: "ben", display_name: "Ben" }, { user_id: "closer", display_name: "Closer" }] }),
  useBookedAppointmentsByDateRange: () => ({ data: s.bookings, isLoading: false, isError: false }),
  useRescheduleSlotsByDateRange: () => ({ data: s.slots, isLoading: false, isError: false }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const q = (rows: () => unknown[]) => {
    const b: Record<string, unknown> = {};
    for (const k of ["select", "gte", "eq", "in", "order"]) b[k] = () => b;
    b.range = (from: number, to: number) => { s.ranges.push(`${from}-${to}`); return Promise.resolve({ data: rows().slice(from, to + 1), error: null }); };
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return b;
  };
  return { supabase: { from: (t: string) => q(() => (t === "call_coaching" ? s.coaching : [])) } };
});

const today = todayDateKey();
const log = (over: Partial<ReportCallLog> = {}) => ({ id: "l", contact_id: "c", user_id: "ben", outcome: "no_answer", created_at: new Date(Date.now() - DAY).toISOString(), dialpad_talk_time_seconds: 0, dialpad_total_duration_seconds: 300, ...over }) as ReportCallLog;
const meeting = (bucket: string, over: Partial<ReportBookingItem> = {}) => ({
  id: Math.random().toString(), contact_id: Math.random().toString(), created_at: new Date(Date.now() - 4 * DAY).toISOString(), created_by: "ben", assigned_user_id: "closer",
  scheduled_for: new Date(Date.now() - 2 * DAY).toISOString(), status: "completed", appointment_outcome: null, deal_value: null, reschedule_count: 0, resolved_bucket: bucket, ...over,
}) as ReportBookingItem;
const show = () => render(<QueryClientProvider client={new QueryClient()}><ManagerMetrics /></QueryClientProvider>);

beforeEach(() => { s.logs = []; s.bookings = []; s.slots = []; s.coaching = []; s.error = false; s.ranges = []; });

describe("Coaching flags numbers", () => {
  it("counts a disqualified call as a pickup and only real talk time as a conversation", () => {
    const logs = [log(), log({ outcome: "disqualified", dialpad_talk_time_seconds: 130 }), log({ outcome: "booked", dialpad_talk_time_seconds: 119 }), log({ user_id: "closer" }), log({ created_at: new Date(Date.now() - 9 * DAY).toISOString() })];
    expect(statsFor(logs, "ben", Date.now() - 7 * DAY, Date.now())).toEqual({ dials: 3, pickups: 2, conv2: 1, bookings: 1 });
  });

  it("credits show rate to whoever set the meeting, with moved meetings against it", () => {
    const slot = meeting("rescheduled", { is_reschedule_slot: true });
    const rows = [meeting("showed"), meeting("noshow"), meeting("cancelled"), meeting("upcoming"), meeting("showed", { is_follow_up: true })];
    const from = shiftDateKey(today, -27);
    expect(setterShowRate(rows, [slot], "ben", from, today)).toEqual({ showed: 1, resolved: 4, rate: 25 });
    expect(setterShowRate(rows, [slot], "closer", from, today)).toEqual({ showed: 0, resolved: 0, rate: null });
  });

  it("shows all of a rep's dials and flags a low show rate on the setter", async () => {
    s.logs = Array.from({ length: 2356 }, () => log());
    s.bookings = [meeting("showed"), meeting("noshow"), meeting("noshow"), meeting("cancelled")];
    show();
    const row = (await screen.findByRole("cell", { name: "Ben" })).closest("tr")!;
    expect(within(row).getByText("2356 · 0 · 0")).toBeVisible();
    expect(within(row).getByText("25%")).toBeVisible();
    expect(screen.getByText(/Show rate 25% over the last 4 weeks \(1 of 4\)/)).toBeVisible();
    expect(screen.getByText(/0 bookings in 5 days despite 2356 dials/)).toBeVisible();
  });

  it("reads coaching past the first 1,000 rows", async () => {
    s.logs = [log()];
    s.coaching = Array.from({ length: 1010 }, (_, i) => ({ user_id: "ben", created_at: new Date(Date.now() - DAY).toISOString(), coaching: { pillar_scores: { tonality: i < 1000 ? 1 : 5 }, first_broken_stage: i < 1000 ? "none" : "opener" } }));
    show();
    expect(await screen.findByText(/Opener on 10 calls in 7 days/)).toBeVisible();
    expect(s.ranges).toContain("1000-1999");
  });

  it("says so when the calls did not load, instead of showing zeros", async () => {
    s.error = true;
    show();
    expect(await screen.findByText(/Couldn't load all the numbers/)).toBeVisible();
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});
