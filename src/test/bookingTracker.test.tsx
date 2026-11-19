import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { monthlyShowRate, showRateByRating, tally, toBookingRows, type MyBookingSource } from "@/lib/bookingTracker";

const src = (id: string, created: string, bucket: string | null, extra: Partial<MyBookingSource> = {}): MyBookingSource => ({
  id, contact_id: `c-${id}`, created_at: created, scheduled_for: created, resolved_bucket: bucket,
  reschedule_count: 0, move_count: 0, contacts: { business_name: `Biz ${id}`, contact_person: "Sam" }, ...extra,
});

describe("booking tracker maths", () => {
  const rows = toBookingRows(
    [
      src("a", "2026-11-03T01:00:00Z", "showed"),
      src("b", "2026-11-04T01:00:00Z", "noshow", { move_count: 1 }),
      src("c", "2026-11-05T01:00:00Z", "cancelled"),
      src("d", "2026-11-18T01:00:00Z", "upcoming"),
      src("e", "2026-10-31T14:00:00Z", "showed"), // 1 Nov in Melbourne
      src("f", "2026-10-20T01:00:00Z", "noshow"),
    ],
    new Map([["a", 4], ["b", 4], ["f", 1]]),
  );

  it("shows ÷ (shows + no-shows), leaving pending and cancelled out", () => {
    const nov = tally(rows.filter((r) => r.bookedOn.startsWith("2026-11")));
    expect(nov).toMatchObject({ total: 5, shows: 2, noShows: 1, cancels: 1, pending: 1, reschedules: 1 });
    expect(nov.showRate).toBeCloseTo(2 / 3);
  });

  it("groups by the Melbourne day booked, newest month first", () => {
    const months = monthlyShowRate(rows);
    expect(months.map((m) => m.month)).toEqual(["2026-11-01", "2026-10-01"]);
    expect(months[1]).toMatchObject({ total: 1, shows: 0, noShows: 1, showRate: 0 });
  });

  it("splits the show rate by the setter's own rating", () => {
    const byRating = showRateByRating(rows);
    expect(byRating.map((r) => [r.rating, r.total, r.showRate])).toEqual([
      [4, 2, 0.5],
      [1, 1, 0],
      [null, 3, 1],
    ]);
  });
});

const mutate = vi.fn();
const state = vi.hoisted(() => ({ me: "ben" }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.me } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useAdminAccess: () => ({ canViewAdmin: false }) }));
vi.mock("@/hooks/useFunnelTracker", () => ({ useRepCompPlans: () => ({ data: [] }) }));
vi.mock("@/hooks/usePipelineItems", () => ({
  useSalesReps: () => ({ data: [] }),
  useRateBooking: () => ({ mutate }),
  useMyBookings: () => ({
    isLoading: false,
    data: { items: [src("x", new Date().toISOString(), "upcoming")], ratings: new Map([["x", 2]]) },
  }),
}));

import { MyBookingsPanel } from "@/components/bookings/MyBookingsPanel";

describe("My bookings panel", () => {
  it("lets the setter rate their own booking, and clicking the same star clears it", () => {
    render(<MemoryRouter><MyBookingsPanel /></MemoryRouter>);
    expect(screen.getByText("Biz x")).toBeInTheDocument();
    expect(screen.getByText("Biz x").closest("tr")?.textContent).toContain("Pending");
    const group = screen.getByRole("group", { name: "Rating for Biz x" });
    fireEvent.click(group.querySelectorAll("button")[3]);
    expect(mutate).toHaveBeenLastCalledWith({ pipelineItemId: "x", rating: 4 });
    fireEvent.click(group.querySelectorAll("button")[1]);
    expect(mutate).toHaveBeenLastCalledWith({ pipelineItemId: "x", rating: null });
  });
});
