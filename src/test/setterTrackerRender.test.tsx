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

  it("opens on All setters, shows setter lines only inside an open row, and only for setters who did something", () => {
    const octLog = { ...log("ben", "z"), created_at: "2026-10-30T01:00:00Z" };
    render(
      <SetterTracker
        dateFrom="2026-10-29"
        dateTo="2026-11-17"
        callLogs={[log("ben", "a"), log("ben", "b"), log("lachlan", "c"), ...Array.from({ length: 10 }, (_, i) => log("bede", `d${i}`)), log("test", "t"), octLog] as never}
        bookings={[]}
        reps={[{ user_id: "ben", display_name: "Ben", email: null }, { user_id: "lachlan", display_name: "Lachlan", email: null }, { user_id: "bede", display_name: "Bede", email: null }] as never}
      />,
    );
    // A dropdown, set to All setters by default.
    expect(screen.getByRole("combobox", { name: "Setter" })).toHaveTextContent("All setters");
    const headers = screen.getAllByRole("columnheader").filter((h) => !h.hasAttribute("colspan") && h.textContent !== "Day");
    const dialsCol = headers.findIndex((h) => h.textContent === "Dials") + 1;
    const cell = (row: Element, i: number) => within(row as HTMLElement).getAllByRole("cell")[i];

    // Range total and October are closed: one line each, no setter lines under them.
    const range = screen.getByRole("button", { name: "Range total" }).closest("tr")!;
    expect(cell(range, dialsCol)).toHaveTextContent("14");
    expect(cell(range.nextElementSibling!, 0)).toHaveTextContent("Oct 2026 total");
    const oct = screen.getByRole("button", { name: "Oct 2026 total" }).closest("tr")!;
    expect(cell(oct.nextElementSibling!, 0)).toHaveTextContent("Nov 2026 total");

    // November is open (current month): setter lines under it, only those who dialled, Test User (1 dial) never.
    const nov = screen.getByRole("button", { name: "Nov 2026 total" }).closest("tr")!;
    const names = [nov.nextElementSibling!, nov.nextElementSibling!.nextElementSibling!, nov.nextElementSibling!.nextElementSibling!.nextElementSibling!].map((r) => cell(r, 0).textContent);
    expect(names).toEqual(["Ben", "Lachlan", "Bede"]);

    // The day row lists each setter's dials.
    const day = screen.getByText("Tue 17 Nov").closest("tr")!;
    expect(cell(day, dialsCol)).toHaveTextContent("13");
    expect(cell(day.nextElementSibling!, dialsCol)).toHaveTextContent("2");

    // Opening the range total shows the setters' range lines; Ben's includes his October dial.
    fireEvent.click(screen.getByRole("button", { name: "Range total" }));
    const benRange = range.nextElementSibling!;
    expect(cell(benRange, 0)).toHaveTextContent("Ben");
    expect(cell(benRange, dialsCol)).toHaveTextContent("3");
  });
});
