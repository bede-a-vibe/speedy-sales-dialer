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
      (props.onAuthChange as ((a: boolean) => void) | undefined)?.(fakeCti.authed);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement("div", { "data-testid": "fake-cti" });
  });
  return { DialpadCTI };
});

import { ContactCallDock, type ContactCallDockHandle, type ServerPlacement } from "@/components/contacts/ContactCallDock";

function ring(state: "on" | "off", external_number: string, id = 7) {
  const cb = fakeCti.props?.onCallRinging as ((p: unknown) => void) | undefined;
  act(() => cb?.({ state, id, external_number, internal_number: "", contact: {}, target: {} }));
}

function setup(onServerPlace: (phone: string) => Promise<ServerPlacement>, dialpadUserId: string | null = "dp-user") {
  const ref = createRef<ContactCallDockHandle>();
  const onStateChange = vi.fn();
  render(
    <ContactCallDock
      ref={ref}
      contactId="c-1"
      businessName="JT Valley Electrics"
      dialpadUserId={dialpadUserId}
      onServerPlace={onServerPlace}
      onStateChange={onStateChange}
    />,
  );
  return { ref, onStateChange };
}

beforeEach(() => {
  mutations.status.mockReset().mockResolvedValue({ state: "ringing", terminal: false, already_ended: false });
  mutations.cancel.mockReset().mockResolvedValue({});
  mutations.force.mockReset().mockResolvedValue({});
  mutations.resolve.mockReset().mockResolvedValue({ dialpad_call_id: null, state: null });
  fakeCti.initiateCall.mockReset();
  fakeCti.hangUpAll.mockReset();
  fakeCti.authed = false;
  Object.values(toastMock).forEach((m) => m.mockReset());
});
afterEach(() => vi.useRealTimers());

// The contact page's call dock (30 Oct 2026). These cover the wiring the state
// machine tests cannot: which path a call takes, what Hang Up really ends, and
// that a stranger ringing in is not shown as this contact's call.
describe("ContactCallDock wiring", () => {
  it("falls back to the server when Dialpad is signed out, then Hang Up cancels that call by id", async () => {
    const onServerPlace = vi.fn(async () => ({ callId: "call-1", state: "calling" }));
    const { ref, onStateChange } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall("+61400000000"); });
    expect(onServerPlace).toHaveBeenCalledWith("+61400000000");
    expect(fakeCti.initiateCall).not.toHaveBeenCalled();
    expect(screen.getByTestId("native-call-bar").textContent).toContain("+61400000000");
    // The server said "calling", so the page is told the call is live (ringing) and disables its buttons.
    expect(onStateChange).toHaveBeenLastCalledWith("ringing");
    fireEvent.click(screen.getByRole("button", { name: /Hang Up/ }));
    await waitFor(() => expect(mutations.cancel).toHaveBeenCalledWith({ call_id: "call-1" }));
    expect(onStateChange).toHaveBeenLastCalledWith("ended");
    expect(screen.getByTestId("native-call-bar").textContent).toContain("Call ended");
  });

  it("hanging up while the server is still placing the call ends that call once its id arrives", async () => {
    let resolvePlacement!: (v: ServerPlacement) => void;
    const onServerPlace = vi.fn(() => new Promise<ServerPlacement>((r) => { resolvePlacement = r; }));
    const { ref } = setup(onServerPlace);
    let placing!: Promise<void>;
    act(() => { placing = ref.current!.placeCall("+61400000000"); });
    await waitFor(() => expect(onServerPlace).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /Hang Up/ }));
    // No id yet: the dock force-ends by user + number straight away.
    await waitFor(() => expect(mutations.force).toHaveBeenCalledWith({ dialpad_user_id: "dp-user", phone: "+61400000000" }));
    await act(async () => { resolvePlacement({ callId: "call-2", state: "calling" }); await placing; });
    expect(mutations.cancel).toHaveBeenCalledWith({ call_id: "call-2" });
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("uses the embedded Dialpad when signed in and reads ringing then connected from its events", async () => {
    fakeCti.authed = true;
    const onServerPlace = vi.fn(async () => ({ callId: null, state: null }));
    const { ref } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall("+61400000000"); });
    expect(fakeCti.initiateCall).toHaveBeenCalledTimes(1);
    expect(fakeCti.initiateCall.mock.calls[0][0]).toBe("+61400000000");
    expect(JSON.parse(fakeCti.initiateCall.mock.calls[0][2] as string)).toEqual({ contact_id: "c-1", business_name: "JT Valley Electrics" });
    expect(onServerPlace).not.toHaveBeenCalled();
    ring("on", "+61 400 000 000");
    expect(screen.getByTestId("native-call-bar").textContent).toContain("Ringing");
    // Someone else ringing in must not touch this call's bar.
    ring("on", "+61499999999", 8);
    expect(screen.getByTestId("native-call-bar").textContent).toContain("Ringing");
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining("+61499999999"));
    ring("off", "0400000000");
    expect(screen.getByTestId("native-call-bar").textContent).toContain("Connected");
    fireEvent.click(screen.getByRole("button", { name: /Hang Up/ }));
    expect(fakeCti.hangUpAll).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("native-call-bar").textContent).toContain("Call ended");
  });

  it("ignores a ringing event when no call has been placed from this page", () => {
    setup(vi.fn(async () => ({ callId: null, state: null })));
    ring("on", "+61400000000");
    expect(screen.queryByTestId("native-call-bar")).toBeNull();
  });

  it("ends the bar when the server poll reports the call is over", async () => {
    vi.useFakeTimers();
    mutations.status.mockResolvedValue({ state: "hangup", terminal: true, already_ended: false });
    const onServerPlace = vi.fn(async () => ({ callId: "call-3", state: "calling" }));
    const { ref } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall("+61400000000"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(mutations.status).toHaveBeenCalledWith("call-3");
    expect(screen.getByTestId("native-call-bar").textContent).toContain("Call ended");
  });

  it("clears the bar and reports the error when the server placement fails", async () => {
    const onServerPlace = vi.fn(async () => { throw new Error("Connect your Dialpad number in Dialpad Settings first."); });
    const { ref, onStateChange } = setup(onServerPlace);
    await act(async () => { await ref.current!.placeCall("+61400000000"); });
    expect(screen.queryByTestId("native-call-bar")).toBeNull();
    expect(toastMock.error).toHaveBeenCalledWith("Connect your Dialpad number in Dialpad Settings first.");
    expect(onStateChange).toHaveBeenLastCalledWith("idle");
  });
});
