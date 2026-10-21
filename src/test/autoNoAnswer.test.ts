import { describe, it, expect } from "vitest";
import { AUTO_NO_ANSWER_SECONDS, shouldAutoNoAnswer } from "@/lib/kpiStandards";

describe("auto no-answer after 3.5 rings", () => {
  it("is 21 seconds", () => expect(AUTO_NO_ANSWER_SECONDS).toBe(21));
  it("fires once ringing reaches 21s", () => {
    expect(shouldAutoNoAnswer("ringing", 20)).toBe(false);
    expect(shouldAutoNoAnswer("ringing", 21)).toBe(true);
  });
  it("never fires on a connected call", () => expect(shouldAutoNoAnswer("connected", 60)).toBe(false));
});
