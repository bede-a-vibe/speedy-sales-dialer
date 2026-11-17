import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useNewClients", () => ({ useNewClients: () => ({ data: [] }) }));
vi.mock("@/hooks/useFunnelTracker", () => ({ useContactBookingHistory: () => ({ data: { history: [], contacts: new Map() } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

import { ClosingTracker } from "@/components/insights/ClosingTracker";
import type { BookedAppointmentReportItem } from "@/hooks/usePipelineItems";

const booking = (id: string, tier: string | null, contacts: Record<string, number> | null = null) =>
  ({
    id, contact_id: `c-${id}`, created_at: "2026-11-17T01:00:00Z", created_by: "ben", assigned_user_id: "bede",
    scheduled_for: "2026-11-20T01:00:00Z", appointment_outcome: null, outcome_recorded_at: null, status: "open",
    deal_value: null, monthly_recurring_value: null, reschedule_count: 0, move_count: 0, resolved_bucket: null,
    is_follow_up: false, booking_tier: tier, contacts,
  }) as unknown as BookedAppointmentReportItem;

describe("Closing tracker layout", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T02:00:00Z"));
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("puts days down the left and metrics across the top, with collapsible months and weeks", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ClosingTracker dateFrom="2026-10-29" dateTo="2026-11-17" bookings={[]} />
      </QueryClientProvider>,
    );
    // Metrics are column headers now.
    expect(screen.getByRole("columnheader", { name: "Day" })).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThan(10);
    // Range total, then months; October collapsed, November open with only the current week open.
    expect(screen.getByText("Range total")).toBeInTheDocument();
    const oct = screen.getByRole("button", { name: "Oct 2026 total" });
    const nov = screen.getByRole("button", { name: "Nov 2026 total" });
    expect(oct).toHaveAttribute("aria-expanded", "false");
    expect(nov).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Week 1–7 Nov" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Week 15–17 Nov" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Tue 17 Nov")).toBeInTheDocument();
    expect(screen.queryByText("Mon 2 Nov")).toBeNull();
    // A week opens on click; Expand all opens October too.
    fireEvent.click(screen.getByRole("button", { name: "Week 1–7 Nov" }));
    expect(screen.getByText("Mon 2 Nov")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByText("Thu 29 Oct")).toBeInTheDocument();
  });

  it("splits bookings by tier, and the tier filter narrows every metric", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ClosingTracker
          dateFrom="2026-11-17"
          dateTo="2026-11-17"
          bookings={[
            booking("a", "tier_1"),
            booking("b", "tier_2"),
            booking("c", null, { team_size: 5, monthly_revenue: 80000 }), // Tier 1 from the contact
            booking("d", null), // unknown tier: in neither
          ]}
        />
      </QueryClientProvider>,
    );
    const headers = screen.getAllByRole("columnheader").filter((h) => !h.hasAttribute("colspan") && h.textContent !== "Day");
    const col = (label: string) => headers.findIndex((h) => h.textContent === label);
    const dayRow = screen.getByText("Tue 17 Nov").closest("tr")!;
    const cell = (label: string) => dayRow.querySelectorAll("td")[col(label) + 1].textContent;
    expect(cell("Bookings made")).toBe("4");
    expect(cell("T1 bookings made")).toBe("2");
    expect(cell("T2 bookings made")).toBe("1");
    expect(cell("% Tier 1")).toBe("50%");

    fireEvent.click(screen.getByRole("button", { name: "Tier 1" }));
    expect(screen.queryByRole("columnheader", { name: "T1 bookings made" })).toBeNull();
    const row = screen.getByText("Tue 17 Nov").closest("tr")!;
    const headers2 = screen.getAllByRole("columnheader").filter((h) => !h.hasAttribute("colspan") && h.textContent !== "Day");
    const idx = headers2.findIndex((h) => h.textContent === "Bookings made");
    expect(row.querySelectorAll("td")[idx + 1].textContent).toBe("2");
  });
});
