import { act, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DialpadCTI, type DialpadCTIHandle } from "@/components/dialer/DialpadCTI";
import { useDialerDialpad } from "@/hooks/useDialerDialpad";
import type { Contact } from "@/hooks/useContacts";

// Call placement for the current lead (30 Oct 2026): useDialerDialpad is the
// one site that initiates a call. When the embedded Dialpad CTI is signed in
// it dials THROUGH the CTI with the resolver's number and the server only
// links the call; otherwise the server places it. Before this, the CTI
// auto-dialled `dm_phone || phone` on its own while the server dialled the
// resolver's number, so unverified DM mobiles rang on mobile-first leads
// while the dialer reported the main line.

const mocks = vi.hoisted(() => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    serverCall: mutation(),
    callStatus: mutation(),
    cancelCall: mutation(),
    resolveCall: mutation(),
    forceHangup: mutation(),
    linkCallLog: mutation(),
    toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
  };
});

vi.mock("@/hooks/useDialpad", () => ({
  useDialpadCall: () => mocks.serverCall,
  useDialpadCallStatus: () => mocks.callStatus,
  useCancelDialpadCall: () => mocks.cancelCall,
  useResolveDialpadCall: () => mocks.resolveCall,
  useForceHangupCall: () => mocks.forceHangup,
  useLinkDialpadCallLog: () => mocks.linkCallLog,
  useDialpadCallerIds: () => ({ data: [] }),
}));
vi.mock("@/hooks/useDialpadSettings", () => ({
  useMyDialpadSettings: () => ({ data: { dialpad_user_id: "dp-user-1", user_id: "user-1" } }),
}));
vi.mock("@/hooks/useNetworkStatus", () => ({ useNetworkStatus: () => true }));
vi.mock("@/integrations/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: () => {}, functions: { invoke: vi.fn() } } };
});
vi.mock("sonner", () => ({ toast: mocks.toast }));

// Case (c) from the production audit: mobile main, unverified DM mobile that
// differs from it. The resolver says main; the old CTI expression said DM.
const mobileLead = {
  id: "lead-1",
  business_name: "Apex Electrical and Data",
  phone: "+61 406 020 003",
  phone_type: "mobile",
  dm_phone: "0408 250 687",
  dm_phone_verified: false,
} as unknown as Contact;

const switchboardLead = { ...mobileLead, id: "lead-2", phone_type: "landline" } as unknown as Contact;

const DEFAULT_CALLER_ID = "+61 3 9000 0000";

interface HarnessProps {
  contact: Contact | null;
  isDialing: boolean;
  callerId?: string;
  withCti?: boolean;
}

/** The dialer page's wiring in miniature: the hook owns placement, the headless CTI is handed to it by ref. */
function Harness({ contact, isDialing, callerId = DEFAULT_CALLER_ID, withCti = true }: HarnessProps) {
  const ctiRef = useRef<DialpadCTIHandle | null>(null);
  const dialpad = useDialerDialpad({
    isDialing,
    isSessionPaused: false,
    currentContact: contact,
    selectedCallerId: callerId,
    ctiRef: withCti ? ctiRef : null,
  });
  return (
    <>
      <DialpadCTI ref={ctiRef} clientId="test-client" headless phoneNumber={dialpad.dialNumber} />
      <output data-testid="placed">{dialpad.placedDialNumber ?? ""}</output>
      <output data-testid="dm-direct">{dialpad.placedWasDmDirect ? "yes" : "no"}</output>
      <output data-testid="state">{dialpad.activeDialpadCallState ?? ""}</output>
      <button type="button" onClick={() => dialpad.resetDialpadState()}>next lead</button>
    </>
  );
}

type CtiMessage = { method: string; payload?: Record<string, unknown> };

function spyOnCtiPostMessage() {
  const iframe = screen.getByTitle("Dialpad Mini Dialer") as HTMLIFrameElement;
  const win = iframe.contentWindow;
  if (!win) throw new Error("jsdom gave the CTI iframe no contentWindow");
  return vi.spyOn(win, "postMessage").mockImplementation(() => {});
}

function initiateCalls(post: ReturnType<typeof spyOnCtiPostMessage>) {
  return post.mock.calls
    .map(([message]) => message as CtiMessage)
    .filter((message) => message?.method === "initiate_call");
}

/** What the Dialpad iframe posts once the rep is signed in. */
function signInToCti() {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://dialpad.com",
        data: {
          api: "opencti_dialpad",
          version: "1.0",
          method: "user_authentication",
          payload: { user_authenticated: true, user_id: 7 },
        },
      }),
    );
  });
}

describe("dialer call placement: one resolver for the CTI and the server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.serverCall.mutateAsync.mockResolvedValue({
      dialpad_call_id: "server-call-1",
      state: "calling",
      message: "Dialpad call initiated.",
      tracking_warning: null,
    });
    mocks.resolveCall.mutateAsync.mockResolvedValue({ dialpad_call_id: null, state: null });
    mocks.callStatus.mutateAsync.mockResolvedValue({ state: "calling", terminal: false });
  });

  it("hands a signed-in CTI the resolver's number: a mobile main with an unverified DM mobile dials the main line", () => {
    const { rerender } = render(<Harness contact={mobileLead} isDialing={false} />);
    const post = spyOnCtiPostMessage();
    signInToCti();

    rerender(<Harness contact={mobileLead} isDialing />);

    const dials = initiateCalls(post);
    expect(dials).toHaveLength(1);
    expect(dials[0].payload).toMatchObject({
      enable_current_tab: true,
      phone_number: "+61 406 020 003",
      outbound_caller_id: DEFAULT_CALLER_ID,
    });
    expect(JSON.parse(String(dials[0].payload?.custom_data))).toEqual({
      contact_id: "lead-1",
      business_name: "Apex Electrical and Data",
    });
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ method: "initiate_call" }), "https://dialpad.com");
    // The server is not asked to place a second call; it will only link this one.
    expect(mocks.serverCall.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("placed").textContent).toBe("+61 406 020 003");
    expect(screen.getByTestId("dm-direct").textContent).toBe("no");
    expect(screen.getByTestId("state").textContent).toBe("connecting");
    expect(mocks.toast.success).toHaveBeenCalledWith("Calling +61 406 020 003 through Dialpad");
  });

  it("still dials a captured DM mobile when the main line is a switchboard, and says so", () => {
    const { rerender } = render(<Harness contact={switchboardLead} isDialing={false} />);
    const post = spyOnCtiPostMessage();
    signInToCti();

    rerender(<Harness contact={switchboardLead} isDialing />);

    const dials = initiateCalls(post);
    expect(dials).toHaveLength(1);
    expect(dials[0].payload?.phone_number).toBe("0408 250 687");
    expect(screen.getByTestId("placed").textContent).toBe("0408 250 687");
    expect(screen.getByTestId("dm-direct").textContent).toBe("yes");
    expect(mocks.toast.success).toHaveBeenCalledWith("Calling the decision maker direct on 0408 250 687");
  });

  it("falls back to the server when the CTI is not signed in, with the same resolved number", async () => {
    const { rerender } = render(<Harness contact={mobileLead} isDialing={false} />);
    const post = spyOnCtiPostMessage();

    rerender(<Harness contact={mobileLead} isDialing />);

    await waitFor(() => expect(mocks.serverCall.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.serverCall.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+61 406 020 003",
        contact_id: "lead-1",
        dialpad_user_id: "dp-user-1",
        caller_id: DEFAULT_CALLER_ID,
      }),
    );
    expect(initiateCalls(post)).toHaveLength(0);
    expect(screen.getByTestId("placed").textContent).toBe("+61 406 020 003");
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Calling +61 406 020 003 through Dialpad"));
  });

  it("keeps a server-placed call on the server path when the CTI signs in mid-call and the effect re-runs", async () => {
    const { rerender } = render(<Harness contact={mobileLead} isDialing={false} />);
    const post = spyOnCtiPostMessage();
    rerender(<Harness contact={mobileLead} isDialing />);
    await waitFor(() => expect(mocks.serverCall.mutateAsync).toHaveBeenCalledTimes(1));

    signInToCti();
    // A caller-ID rotation landing mid-call is the usual reason the place effect re-runs.
    rerender(<Harness contact={mobileLead} isDialing callerId="+61 7 3000 0000" />);

    await waitFor(() => expect(mocks.serverCall.mutateAsync).toHaveBeenCalledTimes(2));
    expect(initiateCalls(post)).toHaveLength(0);
  });

  it("does not dial again or wipe the placed number when the effect re-runs while the CTI call is live", () => {
    const { rerender } = render(<Harness contact={mobileLead} isDialing={false} />);
    const post = spyOnCtiPostMessage();
    signInToCti();
    rerender(<Harness contact={mobileLead} isDialing />);
    expect(initiateCalls(post)).toHaveLength(1);

    rerender(<Harness contact={mobileLead} isDialing callerId="+61 7 3000 0000" />);

    expect(initiateCalls(post)).toHaveLength(1);
    expect(mocks.serverCall.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByTestId("placed").textContent).toBe("+61 406 020 003");
    expect(screen.getByTestId("state").textContent).toBe("connecting");
  });

  it("places a fresh CTI call for the next lead with that lead's resolved number", () => {
    const { rerender } = render(<Harness contact={mobileLead} isDialing={false} />);
    const post = spyOnCtiPostMessage();
    signInToCti();
    rerender(<Harness contact={mobileLead} isDialing />);
    expect(initiateCalls(post)).toHaveLength(1);

    // Log & Next: the page resets the hook, then serves the next lead.
    act(() => screen.getByRole("button", { name: "next lead" }).click());
    rerender(<Harness contact={switchboardLead} isDialing />);

    const dials = initiateCalls(post);
    expect(dials).toHaveLength(2);
    expect(dials[1].payload?.phone_number).toBe("0408 250 687");
    expect(screen.getByTestId("placed").textContent).toBe("0408 250 687");
    expect(mocks.serverCall.mutateAsync).not.toHaveBeenCalled();
  });

  it("uses the server when the page mounts no CTI at all (coach view)", async () => {
    const { rerender } = render(<Harness contact={mobileLead} isDialing={false} withCti={false} />);
    const post = spyOnCtiPostMessage();
    signInToCti();

    rerender(<Harness contact={mobileLead} isDialing withCti={false} />);

    await waitFor(() => expect(mocks.serverCall.mutateAsync).toHaveBeenCalledTimes(1));
    expect(initiateCalls(post)).toHaveLength(0);
  });
});
