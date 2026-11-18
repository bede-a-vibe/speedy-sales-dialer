import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { blockerTheme } from "@/components/insights/TeamCoachingPanel";
import { computeFunnel, FUNNEL_STAGE_LABELS } from "@/lib/funnelMetrics";
import { computeRepCoachingScorecard } from "@/lib/repCoachingMetrics";

const call = (over: Record<string, unknown>) =>
  ({ id: Math.random().toString(36), contact_id: "c", user_id: "ben", outcome: "not_interested", created_at: "2026-11-10T01:00:00Z",
    dialpad_talk_time_seconds: 30, reached_connection: false, reached_problem_awareness: false, reached_solution_awareness: false, reached_commitment: false, ...over }) as never;

describe("Team and Timing polish", () => {
  it("groups booking blockers into themes and drops placeholders", () => {
    expect(blockerTheme("booked")).toBeNull();
    expect(blockerTheme("  ")).toBeNull();
    expect(blockerTheme("The prospect has shut down the business.")).toBe("Business closed, sold or owner retired");
    expect(blockerTheme("Prospect is retired and no longer operating the business.")).toBe("Business closed, sold or owner retired");
    expect(blockerTheme("Prospect shut down the call immediately with a brush-off before any engagement could occur.")).toBe("Brushed off early (no need / not interested)");
    expect(blockerTheme("The call disconnected during the opening exchange before any conversation could take place.")).toBe("Call dropped before a conversation");
    expect(blockerTheme("The prospect has ceased working and the business is closed.")).toBe("Business closed, sold or owner retired");
    expect(blockerTheme("Wants to wait until after Christmas")).toBe("Wants to wait until after Christmas");
  });

  it("counts stages on answered calls only, with the Setter tracker's labels", () => {
    const f = computeFunnel([
      call({ outcome: "no_answer", reached_connection: true }), // ticked but not answered: not counted
      call({ reached_connection: true }),
      call({ outcome: "booked" }),
    ] as never);
    expect(f.stages.map((s) => s.label)).toEqual([
      FUNNEL_STAGE_LABELS.connection, FUNNEL_STAGE_LABELS.problem_awareness, FUNNEL_STAGE_LABELS.solution_awareness, FUNNEL_STAGE_LABELS.commitment, FUNNEL_STAGE_LABELS.booked,
    ]);
    expect(FUNNEL_STAGE_LABELS.connection).toBe("Past intro");
    expect(f.stages.map((s) => s.count)).toEqual([2, 1, 1, 1, 1]);
  });

  it("only calls an hour a best hour with 30+ dials", () => {
    // 6pm: 6 dials, 2 answered (33%); 9am: 40 dials, 10 answered (25%).
    const logs = [
      ...Array.from({ length: 6 }, (_, i) => call({ created_at: new Date(2026, 10, 10, 18, i).toISOString(), outcome: i < 2 ? "not_interested" : "no_answer" })),
      ...Array.from({ length: 40 }, (_, i) => call({ created_at: new Date(2026, 10, 10, 9, i).toISOString(), outcome: i < 10 ? "not_interested" : "no_answer" })),
    ];
    const card = computeRepCoachingScorecard("ben", logs as never, []);
    expect(card.bestPickupHours.map((h) => h.hour)).toEqual([9]);
  });
});
