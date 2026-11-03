import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SourceFunnelRow } from "@/hooks/useMeetings";
import { channelOptions, channelSlug, totalSourceRows } from "@/lib/sourceFunnelTotals";

function row(channel: string, over: Partial<SourceFunnelRow> = {}): SourceFunnelRow {
  return {
    channel, source: channel, meetings_booked: 0, showed: 0, noshow: 0, cancelled: 0, rescheduled: 0,
    reschedules: 0, pending: 0, upcoming: 0, contacts_booked: 0, contacts_showed: 0, contacts_won: 0,
    total_amount: 0, mrr: 0, show_rate_pct: null, reschedule_rate_pct: null, close_from_show_pct: null,
    close_from_booked_pct: null, ...over,
  };
}

const ROWS: SourceFunnelRow[] = [
  row("Cold Call", { meetings_booked: 100, showed: 30, noshow: 50, cancelled: 10, rescheduled: 10, contacts_booked: 90, contacts_showed: 30, contacts_won: 6, mrr: 24000 }),
  row("Ads", { meetings_booked: 40, showed: 10, noshow: 20, contacts_booked: 40, contacts_showed: 10, contacts_won: 2, mrr: 4000 }),
  row("Unattributed", { meetings_booked: 5, pending: 5, contacts_booked: 5 }),
  row("Referral", { meetings_booked: 1, showed: 1, contacts_booked: 1, contacts_showed: 1 }),
];

describe("sourceFunnelTotals", () => {
  it("sums rows with the RPC's own rate definitions", () => {
    const t = totalSourceRows(ROWS.slice(0, 1));
    expect(t.showRate).toBe(30); // 30 / (30+50+10+10)
    expect(t.closeFromShow).toBe(20); // 6 / 30 contacts showed
    expect(t.closeFromBooked).toBe(6.7); // 6 / 90
    const all = totalSourceRows(ROWS);
    expect(all.meetings).toBe(146);
    expect(all.won).toBe(8);
    expect(all.mrr).toBe(28000);
    expect(totalSourceRows([]).showRate).toBeNull();
  });

  it("slugs channels and orders pinned first, Unattributed last", () => {
    expect(channelSlug("Cold Call")).toBe("cold-call");
    expect(channelOptions(ROWS).map((o) => o.channel)).toEqual(["Cold Call", "Ads", "Referral", "Unattributed"]);
    // Pinned channels are offered even with no meetings in range.
    expect(channelOptions([]).map((o) => [o.channel, o.meetings])).toEqual([["Cold Call", 0], ["Ads", 0]]);
  });
});

vi.mock("@/hooks/useMeetings", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useMeetings")>()),
  useSourceFunnel: () => ({ data: ROWS, isLoading: false }),
}));
vi.mock("@/hooks/useAdSpend", () => ({
  useAdSpend: () => ({ data: [{ brand: "odin", spend: 8000 }, { brand: "veritas", spend: 999 }] }),
}));
vi.mock("@/components/insights/InsightsPaidAds", () => ({
  InsightsPaidAds: () => <div>PAID ADS DETAIL</div>,
}));

import { InsightsFunnel } from "@/components/insights/InsightsFunnel";

function renderFunnel(source: string, onSourceChange = vi.fn()) {
  render(
    <InsightsFunnel
      dateFrom="2026-10-01"
      dateTo="2026-10-31"
      source={source}
      onSourceChange={onSourceChange}
      coldCallDetail={<div>COLD CALL DETAIL</div>}
    />,
  );
  return onSourceChange;
}

describe("InsightsFunnel", () => {
  beforeEach(() => document.body.replaceChildren());

  it("All sources: totals across channels plus the cold-call detail", () => {
    renderFunnel("all");
    expect(screen.getByText("Meeting funnel · every source")).toBeTruthy();
    expect(screen.getAllByText("146").length).toBeGreaterThan(0);
    expect(screen.getByText("COLD CALL DETAIL")).toBeTruthy();
    expect(screen.queryByText("PAID ADS DETAIL")).toBeNull();
  });

  it("Ads: Odin spend leads the funnel and the Meta detail replaces cold call", () => {
    renderFunnel("ads");
    expect(screen.getByText("Meeting funnel · Ads")).toBeTruthy();
    expect(screen.getByText("Meta spend")).toBeTruthy();
    expect(screen.getByText("PAID ADS DETAIL")).toBeTruthy();
    expect(screen.queryByText("COLD CALL DETAIL")).toBeNull();
    // $8,000 Odin spend / 2 clients; Veritas spend is excluded.
    expect(screen.getByText("Cost / client").nextSibling?.textContent).toMatch(/4,000/);
  });

  it("A source with no upstream data shows the funnel and a note", () => {
    renderFunnel("referral");
    expect(screen.getByText("Meeting funnel · Referral")).toBeTruthy();
    expect(screen.queryByText("COLD CALL DETAIL")).toBeNull();
    expect(screen.getByText(/no dial or spend data/)).toBeTruthy();
  });

  it("picking a source reports its slug", () => {
    const onChange = renderFunnel("all");
    fireEvent.click(screen.getByRole("button", { name: /Cold Call/ }));
    expect(onChange).toHaveBeenCalledWith("cold-call");
  });
});
