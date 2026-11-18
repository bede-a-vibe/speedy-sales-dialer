import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({ userId: "ben", admin: false }));

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: state.userId } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useAdminAccess: () => ({ canViewAdmin: state.admin }) }));
vi.mock("@/hooks/usePipelineItems", () => ({
  useSalesReps: () => ({ data: [{ user_id: "ben", display_name: "Ben", email: null }, { user_id: "lachlan", display_name: "Lachlan", email: null }] }),
}));
vi.mock("@/hooks/useFunnelTracker", () => ({
  useRepCompPlans: () => ({
    data: state.admin
      ? [
          { user_id: "ben", role: "setter", base_annual: 36_500, plan_key: "setter_2026_marginal", active_from: null },
          { user_id: "lachlan", role: "setter", base_annual: 36_500, plan_key: "setter_2026_marginal", active_from: null },
        ]
      : [{ user_id: "ben", role: "setter", base_annual: 36_500, plan_key: "setter_2026_marginal", active_from: null }],
  }),
  useSetterFirstDeals: () => ({
    data: [
      { deal_id: "a", contact_id: "a", business_name: "Paid Sparky", setter_id: "ben", billing_period: "monthly", amount: 20_000, start_date: "2026-11-02", status: "active", payments: [{ id: "p", paid_on: "2026-11-03", amount: 20_000, note: null }] },
      { deal_id: "b", contact_id: "b", business_name: "Owing Sparky", setter_id: "ben", billing_period: "monthly", amount: 4_000, start_date: "2026-11-05", status: "active", payments: [] },
    ],
  }),
}));

import { PayThisMonthCard } from "@/components/dashboard/PayThisMonthCard";

describe("Pay this month", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-18T02:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows a setter their own commission, next bracket, base and what is waiting on payment", () => {
    state.admin = false;
    render(<MemoryRouter><PayThisMonthCard /></MemoryRouter>);
    expect(screen.getByText(/My pay · November 2026/)).toBeInTheDocument();
    // $20k paid: $2k at 15% = $300.
    expect(screen.getAllByText("$300").length).toBeGreaterThan(0);
    // Level-up bar: $20k paid is Level 1 (15%), $8k to Level 2 (18%).
    expect(screen.getByText("Level 1")).toBeInTheDocument();
    expect(screen.getByText("$8,000 to Level 2 (18%)")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Level-up progress" })).toHaveAttribute("aria-valuenow", "20000");
    // First time this month at a new level: Level up!
    expect(screen.getByText("Level up!")).toBeInTheDocument();
    expect(screen.getByText("Paid Sparky")).toBeInTheDocument();
    expect(screen.getByText("Owing Sparky")).toBeInTheDocument();
    // Base: $100 a day for 18 days.
    expect(screen.getByText(/\$1,800 base \+ \$300 commission/)).toBeInTheDocument();
  });

  it("shows admins one row per setter", () => {
    state.admin = true;
    render(<MemoryRouter><PayThisMonthCard /></MemoryRouter>);
    expect(screen.getByText(/Setter pay · November 2026/)).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Ben" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Lachlan" })).toBeInTheDocument();
  });
});
