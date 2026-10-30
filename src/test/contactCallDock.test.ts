import { describe, expect, it } from "vitest";
import { nextCallState } from "@/lib/callDockState";

// The contact page's call bar is driven by Dialpad's ringing events plus a
// server poll for the hang-up. These are the transitions the rep sees.
describe("contact call dock state", () => {
  it("runs dialing, ringing, connected, ended on a normal answered call", () => {
    let s = nextCallState("idle", { type: "place" });
    expect(s).toBe("dialing");
    s = nextCallState(s, { type: "ringing" });
    expect(s).toBe("ringing");
    s = nextCallState(s, { type: "ringing_off" });
    expect(s).toBe("connected");
    s = nextCallState(s, { type: "terminal" });
    expect(s).toBe("ended");
    expect(nextCallState(s, { type: "reset" })).toBe("idle");
  });

  it("hang up ends a call from any live state and does nothing when idle", () => {
    expect(nextCallState("dialing", { type: "hangup" })).toBe("ended");
    expect(nextCallState("ringing", { type: "hangup" })).toBe("ended");
    expect(nextCallState("connected", { type: "hangup" })).toBe("ended");
    expect(nextCallState("idle", { type: "hangup" })).toBe("idle");
  });

  it("a late ringing event never drags a connected or ended call backwards", () => {
    expect(nextCallState("connected", { type: "ringing" })).toBe("connected");
    expect(nextCallState("ended", { type: "ringing" })).toBe("ended");
    expect(nextCallState("ended", { type: "ringing_off" })).toBe("ended");
  });
});

describe("isTerminalResult", () => {
  it("reads the server flags first, then the state word", async () => {
    const { isTerminalResult } = await import("@/lib/callDockState");
    expect(isTerminalResult({ state: "ringing", terminal: true })).toBe(true);
    expect(isTerminalResult({ state: "connected", already_ended: true })).toBe(true);
    expect(isTerminalResult({ state: "hangup" })).toBe(true);
    expect(isTerminalResult({ state: "ringing" })).toBe(false);
    expect(isTerminalResult({ state: null })).toBe(false);
  });
});
