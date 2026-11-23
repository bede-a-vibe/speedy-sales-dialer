import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GoalsPage from "@/pages/GoalsPage";

const s = vi.hoisted(() => ({ plans: [] as unknown[], admin: false, rolesLoading: false }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/eod/EndOfDay", () => ({ EndOfDay: ({ userId }: { userId: string }) => <textarea aria-label={`report ${userId}`} /> }));
vi.mock("@/components/goals/GoalTargets", () => ({ GoalTargets: ({ name }: { name: string }) => <p>targets for {name}</p> }));
vi.mock("@/components/goals/WhatIfPlanner", () => ({ WhatIfPlanner: () => null }));
vi.mock("@/components/goals/CommissionSales", () => ({ CommissionSales: () => null }));
vi.mock("@/components/earnings/useObservedEarnings", () => ({ useObservedEarnings: () => ({ observed: {}, failed: false }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("@/hooks/useEarningsPlan", () => ({ useRepFunnelByDay: () => ({ data: [] }), useRepGoals: () => ({ data: new Map() }) }));
vi.mock("@/hooks/useFunnelTracker", () => ({
  useRepCompPlans: () => ({ data: s.plans, isLoading: false }),
  useSetterFirstDeals: () => ({ data: [] }),
  useSetterVerbalDeals: () => ({ data: [] }),
}));
vi.mock("@/hooks/useKpiSettings", () => ({ useTeamTargets: () => ({ data: undefined }) }));
vi.mock("@/hooks/usePipelineItems", () => ({ useSalesReps: () => ({ data: [{ user_id: "me", display_name: "Ben" }, { user_id: "other", display_name: "Lachlan" }] }) }));
vi.mock("@/hooks/useUserRole", () => ({ useAdminAccess: () => ({ canViewAdmin: s.admin, isLoading: s.rolesLoading }) }));

const plan = (user_id: string) => ({ user_id, role: "setter", plan_key: "setter_2026_marginal", base_annual: 55_000, effective_from: "2026-01-01" });
const open = (url: string) => render(<MemoryRouter initialEntries={[url]}><GoalsPage /></MemoryRouter>);
const pick = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

describe("End of day on Goals & KPIs", () => {
  beforeEach(() => { s.plans = [plan("me")]; s.admin = false; s.rolesLoading = false; });

  it("opens on the tab from a link and files the signed-in person's report", async () => {
    open("/goals?tab=eod");
    expect(await screen.findByLabelText("report me")).toBeVisible();
    expect(screen.queryByText("targets for Ben")).toBeNull();
  });

  it("keeps a half-written report while the rep checks a target", async () => {
    open("/goals?tab=eod");
    fireEvent.change(await screen.findByLabelText("report me"), { target: { value: "half done" } });
    pick("Targets");
    expect(await screen.findByText("targets for Ben")).toBeVisible();
    pick("End of day");
    expect(await screen.findByLabelText("report me")).toHaveValue("half done");
  });

  it("does not load the report until it is opened", () => {
    open("/goals");
    expect(screen.getByText("targets for Ben")).toBeVisible();
    expect(screen.queryByLabelText("report me")).toBeNull();
  });

  it("gives a closer with no setter plan just the report", async () => {
    s.plans = [plan("other")];
    open("/goals");
    expect(await screen.findByLabelText("report me")).toBeVisible();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("does not flash the report at an admin while roles load", () => {
    s.plans = [plan("other")];
    s.rolesLoading = true;
    open("/goals");
    expect(screen.queryByLabelText("report me")).toBeNull();
  });

  it("hides the rep picker on the report, where it would do nothing", async () => {
    s.admin = true;
    s.plans = [plan("me"), plan("other")];
    open("/goals");
    expect(screen.getByLabelText("Rep")).toBeVisible();
    pick("End of day");
    expect(await screen.findByLabelText("report me")).toBeVisible();
    expect(screen.queryByLabelText("Rep")).toBeNull();
  });
});
