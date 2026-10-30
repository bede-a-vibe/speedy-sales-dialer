import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutations = vi.hoisted(() => ({
  status: vi.fn(),
  cancel: vi.fn(),
  force: vi.fn(),
  resolve: vi.fn(),
}));
const fakeCti = vi.hoisted(() => ({
  authed: false,
  /** Whether the fake iframe reports its sign-in state on mount (the real one takes a few seconds). */
  reportAuth: true,
  mounted: 0,
  initiateCall: vi.fn(),
  hangUpAll: vi.fn(),
  props: null as null | Record<string, unknown>,
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/hooks/useDialpad", () => ({
  useDialpadCallStatus: () => ({ mutateAsync: (...a: unknown[]) => mutations.status(...a) }),
  useCancelDialpadCall: () => ({ mutateAsync: (...a: unknown[]) => mutations.cancel(...a) }),
  useForceHangupCall: () => ({ mutateAsync: (...a: unknown[]) => mutations.force(...a) }),
  useResolveDialpadCall: () => ({ mutateAsync: (...a: unknown[]) => mutations.resolve(...a) }),
}));
vi.mock("@/components/dialer/DialpadCTI", async () => {
  const React = await import("react");
  const DialpadCTI = React.forwardRef(function FakeCTI(props: Record<string, unknown>, ref) {
    fakeCti.props = props;
    React.useImperativeHandle(ref, () => ({
      initiateCall: fakeCti.initiateCall,
      hangUpAll: fakeCti.hangUpAll,
      isAuthenticated: () => fakeCti.authed,
    }));
    React.useEffect(() => {
      fakeCti.mounted += 1;
      if (fakeCti.reportAuth) (props.onAuthChange as ((a: boolean) => void) | undefined)?.(fakeCti.authed);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement("div", { "data-testid": "fake-cti" });
  });
  return { DialpadCTI };
});

import { ContactCallDock, type ContactCallDockHandle, type ServerPlacement } from "@/components/contacts/ContactCallDock";

const PHONE = "+61400000000";
const ok = (over: Record<string, unknown> = {}) => ({ dialpad_call_id: null, state: null, terminal: false, already_ended: false, ...over });

function ring(state: "on" | "off", external_number: string, id = 7) {
  const cb = fakeCti.props?.onCallRinging as ((p: unknown) => void) | undefined;
  act(() => cb?.({ state, id, external_number, internal_number: "", contact: {}, target: {} }));
}

function setup(onServerPlace: (phone: string) => Promise<ServerPlacement>, dialpadUserId: string | null = "dp-user") {
  const ref = createRef<ContactCallDockHandle>();
  const onStateChange = vi.fn();
  const view = render(
    <ContactCallDock
      ref={ref}
      contactId="c-1"
      businessName="JT Valley Electrics"
      dialpadUserId={dialpadUserId}
      onServerPlace={onServerPlace}
      onStateChange={onStateChange}
    />,
  );
  return { ref, onStateChange, view };
}

const bar = () => screen.getByTestId("native-call-bar").textContent ?? "";
const hangUpButton = () => screen.getByRole("button", { name: /Hang Up|Ending/ });

beforeEach(() => {
  mutations.status.mockReset().mockResolvedValue(ok({ state: "ringing" }));
  mutations.cancel.mockReset().mockResolvedValue(ok({ state: "hangup", terminal: true }));
  mutations.force.mockReset().mockResolvedValue(ok({ state: "hangup", terminal: true }));
  mutations.resolve.mockReset().mockResolvedValue(ok());
  fakeCti.initiateCall.mockReset();
  fakeCti.hangUpAll.mockReset();
  fakeCti.authed = false;
  fakeCti.reportAuth = true;
  fakeCti.mounted = 0;
  fakeCti.props = null;
  Object.values(toastMock).forEach((m) => m.mockReset());
});
afterEach(() => vi.useRealTimers());

// The contact page's call dock (30 Oct 2026). These cover the wiring the state
// machine tests cannot: which path a call takes, what Hang Up really ends, and
// that neither a stranger ringing in nor the previous call's record is shown
// as this call.
describe("ContactCallDock wiring", () => {
  it("falls back to the server when Dialpad is signed out, then Hang Up cancels that call by id", async () => {
    const onServerPlace = vi.fn(async () => ({ callId: "call-1", state: "calling" }));
    const { ref, onStateChange } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall(PHONE); });
    expect(onServerPlace).toHaveBeenCalledWith(PHONE);
    expect(fakeCti.initiateCall).not.toHaveBeenCalled();
    expect(bar()).toContain(PHONE);
    // The server said "calling", so the page is told the call is live, and that its audio is not in this page.
    expect(onStateChange).toHaveBeenLastCalledWith("ringing", false);
    fireEvent.click(hangUpButton());
    await waitFor(() => expect(mutations.cancel).toHaveBeenCalledWith({ call_id: "call-1" }));
    await waitFor(() => expect(bar()).toContain("Call ended"));
    expect(onStateChange).toHaveBeenLastCalledWith("ended", false);
  });

  it("hanging up while the server is still placing the call ends that call once its id arrives", async () => {
    let resolvePlacement!: (v: ServerPlacement) => void;
    const onServerPlace = vi.fn(() => new Promise<ServerPlacement>((r) => { resolvePlacement = r; }));
    const { ref } = setup(onServerPlace);
    let placing!: Promise<void>;
    act(() => { placing = ref.current!.placeCall(PHONE); });
    await waitFor(() => expect(onServerPlace).toHaveBeenCalled());
    fireEvent.click(hangUpButton());
    // No id yet: the dock force-ends by user + number straight away.
    await waitFor(() => expect(mutations.force).toHaveBeenCalledWith({ dialpad_user_id: "dp-user", phone: PHONE }));
    await act(async () => { resolvePlacement({ callId: "call-2", state: "calling" }); await placing; });
    expect(mutations.cancel).toHaveBeenCalledWith({ call_id: "call-2" });
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("a server call that answers after a newer call replaced it is ended, not adopted", async () => {
    let resolveA!: (v: ServerPlacement) => void;
    const onServerPlace = vi.fn()
      .mockImplementationOnce(() => new Promise<ServerPlacement>((r) => { resolveA = r; }))
      .mockImplementationOnce(() => new Promise<ServerPlacement>(() => {}));
    const { ref } = setup(onServerPlace);
    let placingA!: Promise<void>;
    act(() => { placingA = ref.current!.placeCall(PHONE); });
    await waitFor(() => expect(onServerPlace).toHaveBeenCalledTimes(1));
    fireEvent.click(hangUpButton());
    await waitFor(() => expect(bar()).toContain("Call ended"));
    act(() => { void ref.current!.placeCall("+61411111111"); });
    await waitFor(() => expect(onServerPlace).toHaveBeenCalledTimes(2));
    await act(async () => { resolveA({ callId: "call-a", state: "calling" }); await placingA; });
    expect(mutations.cancel).toHaveBeenCalledWith({ call_id: "call-a" });
    expect(bar()).toContain("+61411111111");
  });

  it("uses the embedded Dialpad when signed in and reads ringing then connected from its events", async () => {
    fakeCti.authed = true;
    const onServerPlace = vi.fn(async () => ({ callId: null, state: null }));
    const { ref, onStateChange } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall(PHONE); });
    expect(fakeCti.initiateCall).toHaveBeenCalledTimes(1);
    expect(fakeCti.initiateCall.mock.calls[0][0]).toBe(PHONE);
    expect(JSON.parse(fakeCti.initiateCall.mock.calls[0][2] as string)).toEqual({ contact_id: "c-1", business_name: "JT Valley Electrics" });
    expect(onServerPlace).not.toHaveBeenCalled();
    ring("on", "+61 400 000 000");
    expect(bar()).toContain("Ringing");
    // The audio runs in this page, so the page is told leaving would drop it.
    expect(onStateChange).toHaveBeenLastCalledWith("ringing", true);
    // Someone else ringing in must not touch this call's bar.
    ring("on", "+61499999999", 8);
    expect(bar()).toContain("Ringing");
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining("+61499999999"));
    ring("off", "0400000000");
    expect(bar()).toContain("Connected");
    fireEvent.click(hangUpButton());
    expect(fakeCti.hangUpAll).toHaveBeenCalledTimes(1);
    expect(bar()).toContain("Call ended");
  });

  it("ignores a ringing event when no call has been placed from this page", () => {
    setup(vi.fn(async () => ({ callId: null, state: null })));
    ring("on", PHONE);
    expect(screen.queryByTestId("native-call-bar")).toBeNull();
  });

  it("asks the server about the call as soon as its id is known and ends the bar when it is over", async () => {
    vi.useFakeTimers();
    mutations.status.mockResolvedValue(ok({ state: "hangup", terminal: true }));
    const onServerPlace = vi.fn(async () => ({ callId: "call-3", state: "calling" }));
    const { ref } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall(PHONE); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(mutations.status).toHaveBeenCalledWith("call-3");
    expect(bar()).toContain("Call ended");
  });

  it("does not adopt the previous call's ended record while this call is still ringing", async () => {
    vi.useFakeTimers();
    fakeCti.authed = true;
    // The contact's most recent row is the call that just ended; Dialpad's live list has the real one.
    mutations.resolve.mockImplementation(async (params: { contact_id?: string }) =>
      params.contact_id ? ok({ dialpad_call_id: "old-call", state: "hangup", terminal: true }) : ok({ dialpad_call_id: "new-call", state: "ringing" }));
    const { ref } = setup(vi.fn(async () => ({ callId: null, state: null })));
    await act(async () => { await ref.current!.placeCall(PHONE); });
    ring("on", PHONE);
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(mutations.resolve).toHaveBeenNthCalledWith(1, { phone: PHONE, dialpad_user_id: "dp-user", contact_id: "c-1" });
    expect(mutations.resolve).toHaveBeenNthCalledWith(2, { phone: PHONE, dialpad_user_id: "dp-user" });
    expect(bar()).toContain("Ringing");
    expect(bar()).not.toContain("Call ended");
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(mutations.status).toHaveBeenCalledWith("new-call");
    expect(mutations.status).not.toHaveBeenCalledWith("old-call");
  });

  it("never re-adopts an id it has already handled when the same contact is redialled", async () => {
    vi.useFakeTimers();
    const onServerPlace = vi.fn()
      .mockResolvedValueOnce({ callId: "first", state: "calling" })
      .mockResolvedValueOnce({ callId: null, state: "calling" });
    const { ref } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall(PHONE); });
    fireEvent.click(hangUpButton());
    await act(async () => { await vi.advanceTimersByTimeAsync(10); }); // the server's answer lands: ended
    expect(bar()).toContain("Call ended");
    await act(async () => { await vi.advanceTimersByTimeAsync(12100); }); // then the bar clears itself
    expect(screen.queryByTestId("native-call-bar")).toBeNull();
    mutations.status.mockClear();
    // The redial's row has not landed yet, so the server keeps returning the first call's row.
    mutations.resolve
      .mockResolvedValueOnce(ok({ dialpad_call_id: "first", state: "connected" }))
      .mockResolvedValueOnce(ok()) // live-list check: nothing in progress yet
      .mockResolvedValueOnce(ok({ dialpad_call_id: "second", state: "ringing" }));
    await act(async () => { await ref.current!.placeCall(PHONE); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(bar()).not.toContain("Connected");
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(mutations.status).toHaveBeenCalledWith("second");
    expect(mutations.status).not.toHaveBeenCalledWith("first");
  });

  it("keeps resolving a server call that came back without an id, then polls it", async () => {
    vi.useFakeTimers();
    mutations.resolve.mockResolvedValue(ok({ dialpad_call_id: "c9", state: "connected" }));
    const { ref } = setup(vi.fn(async () => ({ callId: null, state: "calling" })));
    await act(async () => { await ref.current!.placeCall(PHONE); });
    expect(bar()).toContain("Ringing");
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(mutations.resolve).toHaveBeenCalledWith({ phone: PHONE, dialpad_user_id: "dp-user", contact_id: "c-1" });
    expect(bar()).toContain("Connected");
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(mutations.status).toHaveBeenCalledWith("c9");
  });

  it("keeps the bar live and says so when the server refuses to hang up a device call", async () => {
    let settle!: { resolve: (v: unknown) => void; reject: (e: Error) => void };
    mutations.cancel.mockImplementation(() => new Promise((resolve, reject) => { settle = { resolve, reject }; }));
    const { ref } = setup(vi.fn(async () => ({ callId: "call-5", state: "connected" })));
    await act(async () => { await ref.current!.placeCall(PHONE); });
    expect(bar()).toContain("Connected");
    fireEvent.click(hangUpButton());
    await waitFor(() => expect(hangUpButton()).toBeDisabled());
    expect(hangUpButton().textContent).toContain("Ending");
    await act(async () => { settle.reject(new Error("Dialpad rate limit exceeded")); });
    await waitFor(() => expect(hangUpButton()).not.toBeDisabled());
    expect(bar()).toContain("Connected");
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining("Dialpad rate limit exceeded"));
    fireEvent.click(hangUpButton());
    await act(async () => { settle.resolve(ok({ state: "hangup", terminal: true })); });
    await waitFor(() => expect(bar()).toContain("Call ended"));
  });

  it("without a Dialpad user id there is no iframe and the call goes straight to the server", async () => {
    vi.useFakeTimers();
    const onServerPlace = vi.fn(async () => ({ callId: "call-6", state: "calling" }));
    const { ref } = setup(onServerPlace, null);
    expect(screen.queryByTestId("fake-cti")).toBeNull();
    await act(async () => { await ref.current!.placeCall(PHONE); });
    // No grace wait: the server was asked without any timers advancing.
    expect(onServerPlace).toHaveBeenCalledWith(PHONE);
    expect(bar()).toContain("Ringing");
  });

  it("tells a rep whose Dialpad is still loading that the call rings their device, not that they are signed out", async () => {
    vi.useFakeTimers();
    fakeCti.reportAuth = false;
    const onServerPlace = vi.fn(async () => ({ callId: "call-7", state: "calling" }));
    const { ref } = setup(onServerPlace);
    await act(async () => {
      const placing = ref.current!.placeCall(PHONE);
      await vi.advanceTimersByTimeAsync(3100);
      await placing;
    });
    expect(onServerPlace).toHaveBeenCalledWith(PHONE);
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining("still loading"));
    expect(toastMock.success).not.toHaveBeenCalledWith(expect.stringContaining("Sign in"));
  });

  it("clears the bar and reports the error when the server placement fails", async () => {
    const onServerPlace = vi.fn(async () => { throw new Error("Connect your Dialpad number in Dialpad Settings first."); });
    const { ref, onStateChange } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall(PHONE); });
    expect(screen.queryByTestId("native-call-bar")).toBeNull();
    expect(toastMock.error).toHaveBeenCalledWith("Connect your Dialpad number in Dialpad Settings first.");
    expect(onStateChange).toHaveBeenLastCalledWith("idle", false);
  });
});
