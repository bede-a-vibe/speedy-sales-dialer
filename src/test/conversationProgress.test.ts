import { describe, expect, it } from "vitest";
import { EMPTY_CONVERSATION_PROGRESS, updateReachedStage, withPitchedStageNote } from "@/components/dialer/ConversationProgressPanel";

describe("Pitched call stage", () => {
  it("tracks a pitch separately from solution awareness", () => {
    const solution = updateReachedStage(EMPTY_CONVERSATION_PROGRESS, "reachedSolution", true);
    expect(solution.reachedPitched).toBe(false);
    const pitched = updateReachedStage(solution, "reachedPitched", true);
    expect(pitched.reachedPitched).toBe(true);
    expect(pitched.reachedSolution).toBe(true);
    expect(pitched.reachedCommitment).toBe(false);
  });
  it("includes pitched when commitment is reached and clears it when solution is cleared", () => {
    const committed = updateReachedStage(EMPTY_CONVERSATION_PROGRESS, "reachedCommitment", true);
    expect(committed.reachedPitched).toBe(true);
    const cleared = updateReachedStage(committed, "reachedSolution", false);
    expect(cleared.reachedPitched).toBe(false);
    expect(cleared.reachedCommitment).toBe(false);
  });
  it("retains the pitch checkpoint alongside the rep's saved notes", () => {
    expect(withPitchedStageNote("Call back Friday", true)).toBe("Call back Friday\nStage reached: Pitched");
    expect(withPitchedStageNote("Call back Friday", false)).toBe("Call back Friday");
  });
});