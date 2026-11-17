import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useNewClients", () => ({ useNewClients: () => ({ data: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

import { ClosingTracker } from "@/components/insights/ClosingTracker";

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
});
