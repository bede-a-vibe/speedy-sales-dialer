import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/usePipelineItems", () => ({
  useSalesReps: () => ({ data: [{ user_id: "u1", display_name: "Ben", email: "ben@x.au" }, { user_id: "u2", display_name: "", email: "lachlan@x.au" }] }),
}));

import { CapturedDetailsFilters } from "@/components/dialer/CapturedDetailsFilters";
import type { DetailFilter } from "@/lib/dialerDetailFilters";

describe("Captured details drawer: Lead & booking", () => {
  it("shows the restored fields and sets the booked-date range", () => {
    const setDetailFilters = vi.fn();
    render(<CapturedDetailsFilters detailFilters={[]} setDetailFilters={setDetailFilters} />);
    for (const label of ["Call disposition", "Setter name", "Assigned closer", "Meeting source", "Lifecycle stage", "Lead source channel"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    fireEvent.change(screen.getByLabelText("Meeting booked date from"), { target: { value: "2026-11-01" } });
    expect(setDetailFilters).toHaveBeenLastCalledWith([{ field: "meeting_booked_date", op: "gte", value: "2026-11-01" }] satisfies DetailFilter[]);
  });
});
