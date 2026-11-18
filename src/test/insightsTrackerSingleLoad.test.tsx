import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const ranges: string[] = [];
const bookingRanges: string[] = [];

vi.mock("@/hooks/useCallLogs", () => ({
  useCallLogsByDateRange: (from: string, to: string) => {
    ranges.push(`${from}..${to}`);
    return { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  },
}));
vi.mock("@/hooks/usePipelineItems", () => ({
  useBookedAppointmentsByDateRange: (from: string, to: string) => {
    bookingRanges.push(`${from}..${to}`);
    return { data: [], isLoading: false };
  },
  useRescheduleSlotsByDateRange: () => ({ data: [] }),
  useSalesReps: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useContactAttemptCounts", () => ({ useContactAttemptCounts: () => ({ data: new Map() }) }));
vi.mock("@/hooks/useNewClients", () => ({ useNewClients: () => ({ data: [], isLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ data: [], error: null }) }), rpc: async () => ({ data: [], error: null }) } }));
vi.mock("@/components/AppLayout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/reports/ReportsToolbar", () => ({ ReportsToolbar: () => null }));
vi.mock("@/pages/CallFunnelPage", () => ({ CallFunnelBody: () => null }));
vi.mock("@/components/insights/InsightsOverview", () => ({ InsightsOverview: () => null }));
vi.mock("@/components/insights/InsightsTeam", () => ({ InsightsTeam: () => null }));
vi.mock("@/components/insights/InsightsTiming", () => ({ InsightsTiming: () => null }));
vi.mock("@/components/insights/ClosingTracker", () => ({ ClosingTracker: () => null }));
vi.mock("@/components/insights/FunnelTracker", () => ({ FunnelTracker: () => <div>TRACKER</div> }));
vi.mock("@/components/insights/SetterTracker", () => ({ SetterTracker: () => null }));
vi.mock("@/components/insights/FunnelDeepDives", () => ({ FunnelDeepDives: () => null }));
vi.mock("@/components/insights/InsightsFunnel", () => ({ InsightsFunnel: () => null, ALL_SOURCES: "all" }));

import InsightsPage from "@/pages/InsightsPage";
import { trackerDefaultFrom } from "@/lib/funnelTracker";
import { todayDateKey } from "@/lib/reportMetrics";

describe("Insights opened on the Tracker", () => {
  it("loads the call logs and bookings once, for the Tracker's range only", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/insights?tab=tracker"]}>
          <InsightsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const today = todayDateKey();
    const expected = `${trackerDefaultFrom(today)}..${today}`;
    expect(new Set(ranges)).toEqual(new Set([expected]));
    expect(new Set(bookingRanges)).toEqual(new Set([expected]));
  });
});
