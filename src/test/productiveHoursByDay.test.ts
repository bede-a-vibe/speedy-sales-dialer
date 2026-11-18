import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));

import { fetchProductiveHoursByDay, productiveHoursFromActivity } from "@/lib/dialpadHours";
import { productiveDiallingHours } from "@/lib/kpiStandards";

describe("productive hours by day", () => {
  it("turns the database's per-day totals into hours with the locked formula", () => {
    const m = productiveHoursFromActivity([
      { user_id: "ben", day: "2026-11-18", dials: 120, talk_seconds: "3600", bookings: 2 },
      { user_id: "ben", day: "2026-11-19", dials: 0, talk_seconds: 0, bookings: 1 },
    ]);
    expect(m.get("ben")?.get("2026-11-18")).toBeCloseTo(productiveDiallingHours(120, 3600, 2));
    expect(m.get("ben")?.get("2026-11-19")).toBeCloseTo(productiveDiallingHours(0, 0, 1));
  });

  it("uses one database call and never pages the call tables", async () => {
    rpc.mockResolvedValueOnce({ data: [{ user_id: "a", day: "2026-11-18", dials: 10, talk_seconds: 60, bookings: 0 }], error: null });
    const m = await fetchProductiveHoursByDay("2026-11-01", "2026-11-19");
    expect(rpc).toHaveBeenCalledWith("get_productive_activity_by_day", { _from_day: "2026-11-01", _to_day: "2026-11-19" });
    expect(from).not.toHaveBeenCalled();
    expect(m.get("a")?.get("2026-11-18")).toBeCloseTo(productiveDiallingHours(10, 60, 0));
  });
});
