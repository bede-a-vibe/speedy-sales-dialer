import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useNewClients", () => ({ useNewClients: () => ({ data: [] }) }));
vi.mock("@/hooks/useFunnelTracker", () => ({
  useContactBookingHistory: () => ({ data: { history: [], contacts: new Map() } }),
  useRepCompPlans: () => ({
    data: [
      { user_id: "ben", role: "setter", base_annual: 55000, plan_key: "setter_2026_marginal", active_from: null },
      { user_id: "lachlan", role: "setter", base_annual: 55000, plan_key: "setter_2026_marginal", active_from: null },
    ],
  }),
  useTrackerDailyInputs: () => ({ data: [] }),
  useProductiveHoursByDay: () => ({ data: new Map() }),
}));

import { SetterTracker } from "@/components/insights/SetterTracker";

const log = (user_id: string, contact_id: string) => ({
  id: `${user_id}-${contact_id}`, contact_id, outcome: "no_answer", created_at: "2026-11-17T01:00:00Z", user_id,
  dialpad_talk_time_seconds: 0, dialpad_total_duration_seconds: 0, exit_reason_connection: null, reached_connection: false, reached_commitment: false,
});

describe("Setters tab, All setters", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T02:00:00Z"));
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("puts each setter's own line under the day and the totals", () => {
    render(
      <SetterTracker
        dateFrom="2026-11-16"
        dateTo="2026-11-17"
        callLogs={[log("ben", "a"), log("ben", "b"), log("lachlan", "c"), ...Array.from({ length: 10 }, (_, i) => log("bede", `d${i}`)), log("test", "t")] as never}
        bookings={[]}
        reps={[{ user_id: "ben", display_name: "Ben", email: null }, { user_id: "lachlan", display_name: "Lachlan", email: null }, { user_id: "bede", display_name: "Bede", email: null }] as never}
      />,
    );
    // Ben is the default; one setter shows no per-setter rows.
    expect(screen.queryAllByRole("cell", { name: "Lachlan" })).toHaveLength(0);
    // Bede dialled, so he is in the picker too, after the paid setters.
    expect(screen.getAllByRole("button").map((b) => b.textContent).filter((t) => ["Ben", "Lachlan", "Bede", "All setters"].includes(t ?? ""))).toEqual(["Ben", "Lachlan", "Bede", "All setters"]);
    fireEvent.click(screen.getByRole("button", { name: "All setters" }));
    const headers = screen.getAllByRole("columnheader").filter((h) => !h.hasAttribute("colspan") && h.textContent !== "Day");
    const dialsCol = headers.findIndex((h) => h.textContent === "Dials") + 1;
    const dayRow = screen.getByText("Tue 17 Nov").closest("tr")!;
    // 2 + 1 + 10; Test User's single dial is not a setter.
    expect(within(dayRow).getAllByRole("cell")[dialsCol]).toHaveTextContent("13");
    // The two lines right after the day row are Ben (2) and Lachlan (1).
    const benRow = dayRow.nextElementSibling as HTMLElement;
    const lachRow = benRow.nextElementSibling as HTMLElement;
    expect(within(benRow).getAllByRole("cell")[0]).toHaveTextContent("Ben");
    expect(within(benRow).getAllByRole("cell")[dialsCol]).toHaveTextContent("2");
    expect(within(lachRow).getAllByRole("cell")[0]).toHaveTextContent("Lachlan");
    expect(within(lachRow).getAllByRole("cell")[dialsCol]).toHaveTextContent("1");
    // Mon 16 Nov had nothing: no per-setter rows under it.
    const mon = screen.getByText("Mon 16 Nov").closest("tr")!;
    expect(within(mon.nextElementSibling as HTMLElement).getAllByRole("cell")[0]).toHaveTextContent("Tue 17 Nov");
  });
});
