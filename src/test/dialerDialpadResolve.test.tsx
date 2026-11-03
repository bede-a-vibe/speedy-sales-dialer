import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/**
 * Regression: the call-link poll used to depend on the useMutation result
 * object, which TanStack v5 recreates every render. Each attempt set state, the
 * re-render cancelled the in-flight resolve_call and restarted at attempt 0, so
 * a found call was never applied and the Dialpad API was hit roughly every
 * 0.5 to 1 s for as long as the call stayed "linking".
 */

const resolveCall = vi.fn();

// Every render hands back a NEW mutation object (as TanStack v5 does) with a
// stable mutateAsync, so the test reproduces the real identity behaviour.
vi.mock("@/hooks/useDialpad", () => ({
  useDialpadCall: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDialpadCallStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCancelDialpadCall: () => ({ mutateAsync: cancelStable }),
  useResolveDialpadCall: () => ({ mutateAsync: resolveCall }),
  useForceHangupCall: () => ({ mutateAsync: vi.fn() }),
  useLinkDialpadCallLog: () => ({ mutateAsync: vi.fn() }),
  useDialpadCallerIds: () => ({ data: [] }),
}));
const cancelStable = vi.fn();
vi.mock("@/hooks/useDialpadSettings", () => ({
  useMyDialpadSettings: () => ({ data: { dialpad_user_id: "dp-user-1" } }),
}));
vi.mock("@/hooks/useNetworkStatus", () => ({ useNetworkStatus: () => true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});

import { useDialerDialpad } from "@/hooks/useDialerDialpad";

const contact = { id: "c-1", phone: "+61400000001", business_name: "Test Co" } as never;

describe("useDialerDialpad call-link poll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resolveCall.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("applies the resolved call even though every attempt re-renders the hook", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    resolveCall.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));

    const { result } = renderHook(() =>
      useDialerDialpad({ isDialing: false, isSessionPaused: false, currentContact: contact, selectedCallerId: "" }),
    );

    act(() => result.current.retryDialpadCallLink());
    // First attempt fires after 500 ms and sets lastLinkAttemptAt (a re-render).
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(resolveCall).toHaveBeenCalledTimes(1);

    // While that request is in flight, nothing restarts the loop.
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(resolveCall).toHaveBeenCalledTimes(1);

    await act(async () => { resolveFirst({ dialpad_call_id: "call-42", state: "connected" }); });
    expect(result.current.activeDialpadCallId).toBe("call-42");
    expect(result.current.isCallResolving).toBe(false);
  });

  it("backs off between attempts instead of hammering resolve_call", async () => {
    resolveCall.mockResolvedValue({ dialpad_call_id: null });
    const { result } = renderHook(() =>
      useDialerDialpad({ isDialing: false, isSessionPaused: false, currentContact: contact, selectedCallerId: "" }),
    );
    act(() => result.current.retryDialpadCallLink());
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    // Schedule is 500, +500, +1000, +1500, +2000 ms: at most 5 calls in 6 s.
    expect(resolveCall.mock.calls.length).toBeLessThanOrEqual(5);
    expect(resolveCall.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
