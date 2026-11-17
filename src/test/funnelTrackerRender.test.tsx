import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const BEN = "7f855655-583c-4f70-afca-fafb327ef5db";

vi.mock("@/hooks/useNewClients", () => ({
  useNewClients: () => ({
    data: [{ contact_id: "n1", business_name: "Acme", channel: "Cold Call", source: null, first_start: "2026-11-04", mrr: 4_000, one_off: 0, dialled: true }],
  }),
}));
vi.mock("@/hooks/useUserRole", () => ({ useAdminAccess: () => ({ canViewAdmin: true }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: BEN, email: "ben@example.com" } }) }));
vi.mock("@/hooks/useFunnelTracker", () => ({
  useContactBookingHistory: () => ({ data: { history: [{ id: "h1", contact_id: "n1", created_at: "2026-10-01T00:00:00Z", created_by: BEN, booking_tier: "tier_1" }], contacts: new Map() } }),
  useTrackerDailyInputs: () => ({ data: [{ id: "i1", day: "2026-11-03", funnel: "cold", user_id: BEN, rostered_hours: 7.5, ad_spend: null, clicks: null, leads: null }], isLoading: false }),
  useTrackerTargets: () => ({ data: [{ id: "t1", month: "2026-11-01", funnel: "cold", metric: "dials", value: 1000 }] }),
  useRepCompPlans: () => ({ data: [{ user_id: BEN, role: "setter", base_annual: 36_500, plan_key: "setter_2026_marginal", active_from: null }] }),
  useProductiveHoursByDay: () => ({ data: new Map([[BEN, new Map([["2026-11-03", 5]])]]) }),
  useSaveTrackerTarget: () => ({ mutate: vi.fn() }),
  useSaveTrackerDailyInputs: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { FunnelTracker } from "@/components/insights/FunnelTracker";

describe("FunnelTracker", () => {
  it("renders a month total, a target row and one row per day, and switches to the Ads view", () => {
    render(
      <FunnelTracker
        dateFrom="2026-11-03"
        dateTo="2026-11-05"
        callLogs={[
          { id: "l1", contact_id: "k1", outcome: "booked", created_at: "2026-11-03T15:00:00+11:00", user_id: BEN } as never,
        ]}
        bookings={[]}
        reps={[{ user_id: BEN, display_name: "Ben", email: null }]}
      />,
    );
    expect(screen.getByText("Nov 2026 total")).toBeInTheDocument();
    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(screen.getByText("Tue 3 Nov")).toBeInTheDocument();
    expect(screen.getByText("Thu 5 Nov")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Dials" })).toBeInTheDocument();
    expect(screen.getByLabelText("Target dials 2026-11-01")).toHaveValue("1000");
    // Month row: 1 new client, $4,000 cash; dials 1 vs target 1000 shows red.
    const totalRow = screen.getByText("Nov 2026 total").closest("tr")!;
    expect(within(totalRow).getAllByText("$4,000").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Ads" }));
    expect(screen.queryByRole("columnheader", { name: "Dials" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "CPL" })).toBeInTheDocument();
  });
});
