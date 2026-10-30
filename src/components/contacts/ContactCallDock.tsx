import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Headphones } from "lucide-react";
import { DialpadCTI, type CallRingingPayload, type DialpadCTIHandle } from "@/components/dialer/DialpadCTI";
import { NativeCallBar, type NativeCallState } from "@/components/dialer/NativeCallBar";
import { useCancelDialpadCall, useDialpadCallStatus, useForceHangupCall, useResolveDialpadCall } from "@/hooks/useDialpad";
import { eventForDialpadState, nextCallState, ringBelongsToCall, type CallDockEvent } from "@/lib/callDockState";
import { cn } from "@/lib/utils";

/**
 * Same public, origin-restricted Dialpad CTI client id the dialer uses. Dialpad
 * rejects it from any other origin, so it is safe in the bundle; the env var
 * still overrides it.
 */
const DEFAULT_DIALPAD_CTI_CLIENT_ID = "hbhxaRmhSjrSTYGh8T4NwpGNd";
const DIALPAD_CTI_CLIENT_ID: string | null =
  (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_DIALPAD_CTI_CLIENT_ID
  ?? DEFAULT_DIALPAD_CTI_CLIENT_ID;

export interface ServerPlacement {
  /** Dialpad's REST call id, when the server could discover it. */
  callId: string | null;
  /** The call state the server reported at placement. */
  state: string | null;
}

export interface ContactCallDockHandle {
  /** Place a call to this number. Uses the embedded Dialpad when it is signed in, otherwise the server. */
  placeCall: (phone: string) => Promise<void>;
}

interface ContactCallDockProps {
  contactId: string;
  businessName: string | null;
  /** The rep's Dialpad user id, needed to resolve a CTI call's id and to force a hang-up without one. */
  dialpadUserId: string | null | undefined;
  /** Server fallback when the embedded Dialpad is not signed in. */
  onServerPlace: (phone: string) => Promise<ServerPlacement>;
  /** Reported on every change so the page can disable its call buttons mid-call. */
  onStateChange?: (state: NativeCallState) => void;
  className?: string;
}

/** How long to wait for the iframe's sign-in handshake before treating it as signed out. */
export const CTI_AUTH_GRACE_MS = 3000;
/** No ringing event and no call id this long after placing: give up on the bar. */
export const DIAL_TIMEOUT_MS = 25000;
const STATUS_POLL_MS = 4000;
const ENDED_RESET_MS = 12000;
const RESOLVE_DELAYS_MS = [1500, 2000, 2500, 3000, 3000, 3000, 3000, 3000];

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Embedded Dialpad for the contact page (Bede, 30 Oct 2026). The dialer already
 * had this: a headless CTI iframe that carries the audio and a native call bar
 * with the state and a Hang Up button. The contact page placed calls through
 * the server and showed a toast, so the rep had no idea whether it had
 * connected and no way to hang up. This mounts the same iframe here and drives
 * the same bar.
 *
 * Where the truth comes from, in order of preference: the CTI's ringing events
 * (only when the number matches the one we dialled, so a callback from someone
 * else is not mistaken for this call); the server's view of the call once we
 * know its REST id (from the server placement, or from resolve_call after a CTI
 * placement, since the id in the CTI's ringing event is the widget's own and
 * means nothing to the REST API); and a timeout so a placement that never rings
 * cannot lock the page.
 *
 * The iframe is hidden off-screen, never display:none, for the same reason as
 * on the dialer: a hidden iframe can be suspended and the live audio dropped.
 * It is portalled to the end of the document and made inert while hidden so it
 * never sits in the middle of the page's tab order.
 */
export const ContactCallDock = forwardRef<ContactCallDockHandle, ContactCallDockProps>(function ContactCallDock(
  { contactId, businessName, dialpadUserId, onServerPlace, onStateChange, className },
  ref,
) {
  const ctiRef = useRef<DialpadCTIHandle | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [callState, setCallState] = useState<NativeCallState>("idle");
  const [dialedNumber, setDialedNumber] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [ctiAuthed, setCtiAuthed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const statusMutation = useDialpadCallStatus();
  const cancelMutation = useCancelDialpadCall();
  const forceHangupMutation = useForceHangupCall();
  const resolveMutation = useResolveDialpadCall();

  // Refs mirror the bits of state that async work has to read after an await.
  const stateRef = useRef<NativeCallState>("idle");
  const dialedRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const authKnownRef = useRef(false);
  const authedRef = useRef(false);
  const placementRef = useRef(0);
  const revealedOnceRef = useRef(false);

  // Read through a function so TypeScript does not narrow the ref across awaits.
  const currentState = (): NativeCallState => stateRef.current;
  const isLive = (s: NativeCallState) => s === "dialing" || s === "ringing" || s === "connected";

  // The ref is the source of truth and is advanced synchronously, because
  // placeCall reads it straight after dispatching and before React has
  // re-rendered. The React state is the mirror the bar renders from.
  const dispatch = useCallback((event: CallDockEvent) => {
    const prev = stateRef.current;
    const next = nextCallState(prev, event);
    stateRef.current = next;
    if (next === "connected" && prev !== "connected") setConnectedAt(Date.now());
    setCallState(next);
  }, []);

  useEffect(() => {
    onStateChange?.(callState);
  }, [callState, onStateChange]);

  const assignCallId = useCallback((id: string | null) => {
    callIdRef.current = id;
    setCallId(id);
  }, []);

  const clearCall = useCallback(() => {
    dispatch({ type: "reset" });
    setDialedNumber(null);
    dialedRef.current = null;
    setConnectedAt(null);
    assignCallId(null);
  }, [assignCallId, dispatch]);

  // A finished call clears itself off the page after a moment.
  useEffect(() => {
    if (callState !== "ended") return;
    const id = window.setTimeout(clearCall, ENDED_RESET_MS);
    return () => window.clearTimeout(id);
  }, [callState, clearCall]);

  // A placement that never rings and never gets a call id must not lock the page.
  useEffect(() => {
    if (callState !== "dialing") return;
    const id = window.setTimeout(() => {
      if (stateRef.current !== "dialing" || callIdRef.current) return;
      dispatch({ type: "terminal" });
      toast.warning("Dialpad didn't report that call. Open the Dialpad panel to check it.");
    }, DIAL_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [callState, dispatch]);

  // Dialpad's CTI only tells us about ringing, never about the hang-up, so once
  // we know the REST call id we ask the server every few seconds how it is going.
  useEffect(() => {
    if (!callId) return;
    if (callState === "idle" || callState === "ended") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await statusMutation.mutateAsync(callId);
        if (cancelled) return;
        const event = eventForDialpadState(res.state, Boolean(res.terminal || res.already_ended));
        if (event) dispatch(event);
      } catch {
        // A failed status read is not a reason to change the bar.
      }
    };
    const id = window.setInterval(() => void tick(), STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // statusMutation is a stable react-query mutation object for our purposes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, callState, dispatch]);

  // Hidden means hidden: no tab stop inside an invisible iframe.
  useEffect(() => {
    const el = panelRef.current as (HTMLDivElement & { inert: boolean }) | null;
    if (el) el.inert = !revealed;
  }, [revealed]);

  const handleRinging = useCallback((payload: CallRingingPayload) => {
    if (!isLive(currentState())) return;
    if (!ringBelongsToCall(payload?.external_number, dialedRef.current)) {
      if (payload?.state === "on" && payload.external_number) {
        toast.info(`Incoming call from ${payload.external_number}. Open the Dialpad panel to take it.`);
      }
      return;
    }
    if (payload?.state === "on") dispatch({ type: "ringing" });
    else if (payload?.state === "off") dispatch({ type: "ringing_off" });
  }, [dispatch]);

  const handleAuthChange = useCallback((authed: boolean) => {
    authKnownRef.current = true;
    authedRef.current = authed;
    setCtiAuthed(authed);
  }, []);

  /**
   * The iframe reports its sign-in a few seconds after it loads. Clicking Call
   * in that window must not be read as "signed out", or a signed-in rep gets
   * the server path and a panel telling them to sign in.
   */
  const waitForCtiAuth = useCallback(async (placement: number): Promise<boolean> => {
    const deadline = Date.now() + CTI_AUTH_GRACE_MS;
    while (Date.now() < deadline) {
      if (placementRef.current !== placement || currentState() !== "dialing") return false;
      if (ctiRef.current?.isAuthenticated()) return true;
      if (authKnownRef.current && !authedRef.current) return false;
      await sleep(200);
    }
    return Boolean(ctiRef.current?.isAuthenticated());
  }, []);

  /** After a CTI placement, learn the REST call id from the server so the poll and hang-up have something to act on. */
  const resolveCtiCallId = useCallback(async (placement: number, phone: string) => {
    if (!dialpadUserId) return;
    for (const delay of RESOLVE_DELAYS_MS) {
      await sleep(delay);
      if (placementRef.current !== placement) return;
      if (!isLive(currentState())) return;
      if (callIdRef.current) return;
      try {
        const res = await resolveMutation.mutateAsync({ phone, dialpad_user_id: dialpadUserId, contact_id: contactId });
        if (placementRef.current !== placement) return;
        if (res.dialpad_call_id) {
          assignCallId(res.dialpad_call_id);
          const event = eventForDialpadState(res.state, Boolean(res.terminal || res.already_ended));
          if (event) dispatch(event);
          return;
        }
      } catch {
        // keep trying
      }
    }
  }, [assignCallId, contactId, dialpadUserId, dispatch, resolveMutation]);

  const endServerCall = useCallback((id: string | null, phone: string | null) => {
    if (id) {
      cancelMutation.mutateAsync({ call_id: id }).catch(() => {});
    } else if (dialpadUserId && phone) {
      forceHangupMutation.mutateAsync({ dialpad_user_id: dialpadUserId, phone }).catch(() => {});
    }
  }, [cancelMutation, dialpadUserId, forceHangupMutation]);

  const placeCall = useCallback(async (phone: string) => {
    if (isLive(currentState())) {
      toast.info("You're already on a call. Hang up first.");
      return;
    }
    const placement = ++placementRef.current;
    setDialedNumber(phone);
    dialedRef.current = phone;
    setConnectedAt(null);
    assignCallId(null);
    dispatch({ type: "place" });

    const authed = await waitForCtiAuth(placement);
    if (placementRef.current !== placement || currentState() !== "dialing") return;

    if (authed && ctiRef.current) {
      ctiRef.current.initiateCall(phone, undefined, JSON.stringify({ contact_id: contactId, business_name: businessName }));
      toast.success(`Calling ${phone} through Dialpad`);
      void resolveCtiCallId(placement, phone);
      return;
    }

    // Not signed in to the embedded Dialpad: place this call through the
    // server (it rings the rep's own Dialpad device, then the prospect) and
    // show the panel once so they can sign in for next time.
    if (authKnownRef.current && !authedRef.current && !revealedOnceRef.current) {
      revealedOnceRef.current = true;
      setRevealed(true);
    }
    try {
      const res = await onServerPlace(phone);
      if (placementRef.current !== placement) return;
      if (!isLive(currentState())) {
        // The rep hung up while the server was still placing it. End the real call.
        endServerCall(res.callId, phone);
        return;
      }
      if (res.callId) assignCallId(res.callId);
      const event = eventForDialpadState(res.state, false);
      if (event && event.type !== "terminal") dispatch(event);
      toast.success(`Calling ${phone} through Dialpad on your device. Sign in to the Dialpad panel to run calls from this page.`);
    } catch (e) {
      if (placementRef.current !== placement) return;
      clearCall();
      toast.error(e instanceof Error ? e.message : "Couldn't start the Dialpad call.");
    }
  }, [assignCallId, businessName, clearCall, contactId, dispatch, endServerCall, onServerPlace, resolveCtiCallId, waitForCtiAuth]);

  const hangUp = useCallback(() => {
    ctiRef.current?.hangUpAll();
    endServerCall(callIdRef.current, dialedRef.current);
    dispatch({ type: "hangup" });
  }, [dispatch, endServerCall]);

  const hidePanel = useCallback(() => {
    setRevealed(false);
    // Put focus somewhere sensible instead of the next tab stop inside the hidden iframe.
    const target = barRef.current?.querySelector<HTMLElement>("button");
    (target ?? document.body).focus?.();
  }, []);

  useImperativeHandle(ref, () => ({ placeCall }), [placeCall]);

  if (!DIALPAD_CTI_CLIENT_ID) return null;

  const panel = (
    <div
      ref={panelRef}
      aria-hidden={!revealed}
      className={cn(
        "fixed z-50 transition-all",
        revealed
          ? "right-4 bottom-4 w-[380px] overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
          : "left-[-9999px] top-0 h-[560px] w-[380px] opacity-0 pointer-events-none",
      )}
      data-dialpad-headless
    >
      {revealed && (
        <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
          <div className="flex items-center gap-2">
            <Headphones className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Dialpad</span>
            {!ctiAuthed && <span className="text-[11px] text-amber-600">Sign in here to call from this page</span>}
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={hidePanel}
          >
            Hide
          </button>
        </div>
      )}
      <DialpadCTI
        ref={ctiRef}
        clientId={DIALPAD_CTI_CLIENT_ID}
        headless
        phoneNumber={dialedNumber}
        customData={JSON.stringify({ contact_id: contactId, business_name: businessName })}
        onCallRinging={handleRinging}
        onAuthChange={handleAuthChange}
      />
    </div>
  );

  return (
    <>
      {callState !== "idle" && (
        <div ref={barRef} className={className}>
          <NativeCallBar
            businessName={businessName}
            phoneNumber={dialedNumber}
            state={callState}
            connectedAt={connectedAt}
            dialpadAuthenticated={ctiAuthed}
            onHangUp={hangUp}
            onRevealDialpad={() => setRevealed(true)}
          />
        </div>
      )}
      {typeof document !== "undefined" ? createPortal(panel, document.body) : panel}
    </>
  );
});

export default ContactCallDock;
