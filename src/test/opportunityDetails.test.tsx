import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  ghl: [] as Array<{ id: string; payload: Record<string, unknown> }>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/ghl", () => ({
  ghlUpdateOpportunity: (id: string, payload: Record<string, unknown>) => { db.ghl.push({ id, payload }); return Promise.resolve({}); },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: db.row, error: null }) }) }),
      update: (u: Record<string, unknown>) => ({ eq: () => { db.updates.push(u); return Promise.resolve({ error: null }); } }),
    }),
  },
}));

import { OpportunityDetailsSection } from "@/components/pipelines/OpportunityDetailsSection";
import { OPPORTUNITY_FIELDS } from "@/lib/ghlOpportunityFields";

function renderSection(ghlOpportunityId: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OpportunityDetailsSection itemId="item-1" ghlOpportunityId={ghlOpportunityId} />
    </QueryClientProvider>,
  );
}

describe("Opportunity Details on a meeting", () => {
  beforeEach(() => {
    db.row = { proposed_mrr: 2000, billing_start_date: "2026-11-01" };
    db.updates = [];
    db.ghl = [];
  });

  it("lists GHL's opportunity fields in GHL's order and loads saved values", async () => {
    renderSection("opp-1");
    fireEvent.click(screen.getByRole("button", { name: /opportunity details/i }));
    await screen.findByDisplayValue("2000");
    const labels = [...document.querySelectorAll("label > span:first-child")].map((el) => el.textContent);
    expect(labels).toEqual(OPPORTUNITY_FIELDS.map((d) => d.label));
    expect(screen.getByDisplayValue("2026-11-01")).toBeTruthy();
  });

  it("saves only changed fields to the meeting, and to GHL by field id as fieldValue strings", async () => {
    renderSection("opp-1");
    fireEvent.click(screen.getByRole("button", { name: /opportunity details/i }));
    const mrr = await screen.findByDisplayValue("2000");
    fireEvent.change(mrr, { target: { value: "2500" } });
    fireEvent.click(screen.getByRole("button", { name: /save opportunity details/i }));
    await waitFor(() => expect(db.ghl.length).toBe(1));
    expect(db.updates).toEqual([{ proposed_mrr: 2500 }]);
    expect(db.ghl[0]).toEqual({ id: "opp-1", payload: { customFields: [{ id: "wOvU6mEcuVEwmD8E0HMG", fieldValue: "2500" }] } });
  });

  it("saves to the meeting only when no GHL opportunity is linked", async () => {
    renderSection(null);
    fireEvent.click(screen.getByRole("button", { name: /opportunity details/i }));
    const mrr = await screen.findByDisplayValue("2000");
    fireEvent.change(mrr, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save opportunity details/i }));
    await waitFor(() => expect(db.updates.length).toBe(1));
    expect(db.updates[0]).toEqual({ proposed_mrr: null });
    expect(db.ghl).toEqual([]);
  });
});
