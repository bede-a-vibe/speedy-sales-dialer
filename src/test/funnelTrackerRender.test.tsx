import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
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
  useSetterFirstDeals: () => ({
    data: [
      { deal_id: "d1", contact_id: "n1", business_name: "Paid Sparky", setter_id: BEN, billing_period: "monthly", amount: 4000, start_date: "2026-11-03", status: "active",
        payments: [{ id: "p1", paid_on: "2026-11-04", amount: 4000, note: null }] },
      { deal_id: "d2", contact_id: "n2", business_name: "Owing Sparky", setter_id: BEN, billing_period: "monthly", amount: 2000, start_date: "2026-11-04", status: "active", payments: [] },
    ],
  }),
  useRecordDealPayment: () => ({ mutate: mockRecordPayment, isPending: false }),
}));
const mockRecordPayment = vi.fn();

import { FunnelTracker } from "@/components/insights/FunnelTracker";

describe("FunnelTracker", () => {
  // Pin "today" to 17 Nov 2026 so the current month (open by default) is November.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T02:00:00Z"));
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists paid cash under Commission by sale and records a payment for a deal awaiting payment", () => {
    render(
      <FunnelTracker dateFrom="2026-11-03" dateTo="2026-11-05" callLogs={[]} bookings={[]} reps={[{ user_id: BEN, display_name: "Ben", email: null }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Commission by sale/ }));
    expect(screen.getByText("Paid Sparky")).toBeInTheDocument();
    const owing = screen.getByText("Owing Sparky").closest("tr")!;
    fireEvent.click(within(owing).getByRole("button", { name: "Mark paid" }));
    expect(within(owing).getByLabelText("Amount paid")).toHaveValue(2000);
    fireEvent.click(within(owing).getByRole("button", { name: "Save" }));
    expect(mockRecordPayment).toHaveBeenCalledWith({ deal_id: "d2", paid_on: "2026-11-17", amount: 2000 }, expect.anything());
  });

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

  it("stacks months oldest first, collapsed except the current month, and toggles on click", () => {
    render(
      <FunnelTracker
        dateFrom="2026-09-29"
        dateTo="2026-11-03"
        callLogs={[]}
        bookings={[]}
        reps={[{ user_id: BEN, display_name: "Ben", email: null }]}
      />,
    );
    const monthButtons = screen.getAllByRole("button", { name: /20\d\d total$/ });
    expect(monthButtons.map((b) => b.textContent)).toEqual(["Sept 2026 total", "Oct 2026 total", "Nov 2026 total"]);
    const [sep, oct, nov] = monthButtons;
    expect(sep).toHaveAttribute("aria-expanded", "false");
    expect(oct).toHaveAttribute("aria-expanded", "false");
    expect(nov).toHaveAttribute("aria-expanded", "true");
    // Target rows stay visible with every month total; day rows only for open months.
    expect(screen.getAllByText("Target")).toHaveLength(3);
    expect(screen.getByText("Tue 3 Nov")).toBeInTheDocument();
    expect(screen.queryByText("Thu 1 Oct")).toBeNull();

    // Clicking the month total row opens it, clicking again closes it.
    fireEvent.click(oct.closest("tr")!);
    expect(screen.getByRole("button", { name: "Oct 2026 total" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Thu 1 Oct")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Oct 2026 total" }));
    expect(screen.queryByText("Thu 1 Oct")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("insights-tracker-month-open-v1")!)["2026-10-01"]).toBe(false);

    // Expand all / Collapse all.
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Tue 29 Sept")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByText("Tue 3 Nov")).toBeNull();
    expect(screen.getAllByText("Target")).toHaveLength(3);
  });

  it("shows tier set columns, and the tier split only under All", () => {
    render(
      <FunnelTracker
        dateFrom="2026-11-03"
        dateTo="2026-11-05"
        callLogs={[]}
        bookings={[]}
        reps={[{ user_id: BEN, display_name: "Ben", email: null }]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Tier 1 sets" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Unknown tier sets" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Tier split" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Set-to-close T1" })).toBeInTheDocument();
    // The one new client is Tier 1 (latest booking), so New clients T1 is green on the month row.
    const totalRow = screen.getByRole("button", { name: "Nov 2026 total" }).closest("tr")!;
    const headers = screen.getAllByRole("columnheader").slice(1).filter((h) => !h.hasAttribute("colspan"));
    const idx = headers.findIndex((h) => h.textContent === "New clients T1");
    const cell = within(totalRow).getAllByRole("cell")[idx + 1];
    expect(cell).toHaveTextContent("1");
    expect(cell.className).toContain("text-emerald-700");

    fireEvent.click(screen.getByRole("button", { name: "Tier 1" }));
    expect(screen.queryByRole("columnheader", { name: "Tier split" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Tier 1 sets" })).toBeInTheDocument();
  });
});
