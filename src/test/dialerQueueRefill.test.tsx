import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { useRollingDialerQueue } from "@/hooks/useContacts";

const lead = (id: string) => ({ id, business_name: id });
const claims = () => rpc.mock.calls.filter(([name]) => name === "claim_dialer_leads").length;

describe("useRollingDialerQueue refills", () => {
  let served: Array<{ claimed_contacts: unknown[]; total_available_count: number }>;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    served = [];
    rpc.mockReset();
    rpc.mockImplementation(async (name: string) => {
      if (name === "claim_dialer_leads") return { data: served.shift() ?? { claimed_contacts: [], total_available_count: 900 }, error: null };
      if (name === "get_dialer_queue_count") return { data: 900, error: null };
      return { data: 0, error: null };
    });
  });
  afterEach(() => vi.useRealTimers());

  it("keeps retrying a low buffer on a timer, without hammering the server", async () => {
    served = [{ claimed_contacts: ["a", "b", "c", "d"].map(lead), total_available_count: 900 }];
    const { result } = renderHook(() => useRollingDialerQueue({ filters: undefined as never }));
    await act(async () => { await result.current.startSession(); });
    await waitFor(() => expect(result.current.contacts).toHaveLength(4));

    const before = claims();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(claims() - before).toBeLessThanOrEqual(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    expect(claims()).toBeGreaterThan(before);
  });

  it("hands back the lock on a lead it already handled", async () => {
    served = [{ claimed_contacts: ["a", "b", "c", "d", "e"].map(lead), total_available_count: 900 }];
    const { result } = renderHook(() => useRollingDialerQueue({ filters: undefined as never }));
    await act(async () => { await result.current.startSession(); });
    await waitFor(() => expect(result.current.contacts).toHaveLength(5));

    served = [{ claimed_contacts: [lead("a"), lead("f")], total_available_count: 900 }];
    await act(async () => {
      await result.current.discardContact("a", { releaseLock: true });
      await result.current.ensureBuffer();
    });

    await waitFor(() => expect(result.current.contacts.map((c) => c.id)).toEqual(["b", "c", "d", "e", "f"]));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    const releasesOfA = rpc.mock.calls.filter(
      ([name, args]) => name === "release_dialer_lead_locks" && (args as { _contact_ids?: string[] })._contact_ids?.includes("a"),
    );
    expect(releasesOfA).toHaveLength(2);
  });
});
