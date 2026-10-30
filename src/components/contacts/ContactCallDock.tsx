import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Headphones } from "lucide-react";
import { DialpadCTI, type CallRingingPayload, type DialpadCTIHandle } from "@/components/dialer/DialpadCTI";
import { NativeCallBar, type NativeCallState } from "@/components/dialer/NativeCallBar";
import { useCancelDialpadCall, useDialpadCallStatus, useForceHangupCall, useResolveDialpadCall } from "@/hooks/useDialpad";
import { eventForDialpadState, isTerminalResult, nextCallState, ringBelongsToCall, type CallDockEvent } from "@/lib/callDockState";
import { cn } from "@/lib/utils";

/**
 * Same public, origin-restricted Dialpad CTI client id the dialer uses. Dialpad
 * rejects it from any other origin, so it is safe in the bundle; the env var
 * still overrides it (a blank env var falls back to the default).
 */
const DEFAULT_DIALPAD_CTI_CLIENT_ID = "hbhxaRmhSjrSTYGh8T4NwpGNd";
const DIALPAD_CTI_CLIENT_ID: string =
  (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_DIALPAD_CTI_CLIENT_ID
  || DEFAULT_DIALPAD_CTI_CLIENT_ID;

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

/** Which leg carries the call: the iframe in this page, or the rep's own Dialpad device via the server. */
type PlacedVia = "cti" | "server";

interface ContactCallDockProps {
  contactId: string;
  businessName: string | null;
  /** The rep's Dialpad user id. Without it there is no iframe and no call tracking, only the server's own refusal. */
  dialpadUserId: string | null | undefined;
  /** Server fallback when the embedded Dialpad is not signed in. */
  onServerPlace: (phone: string) => Promise<ServerPlacement>;
  /**
   * Reported on every change so the page can disable its call buttons mid-call.
   * `carriesAudio` is true while the call's audio runs inside this page, so
   * leaving the page would drop the line.
   */
  onStateChange?: (state: NativeCallState, carriesAudio: boolean) => void;
  className?: string;
}

/** How long to wait for the iframe's sign-in handshake before treating it as signed out. */
export const CTI_AUTH_GRACE_MS = 3000;
/** No ringing event and no call id this long after placing: give up on the bar. */
export const DIAL_TIMEOUT_MS = 25000;
/** How often the server is asked about a call once its id is known; doubles on rate limits. */
export const STATUS_POLL_MS = 5000;
const STATUS_POLL_MAX_MS = 30000;
const ENDED_RESET_MS = 12000;
/** Resolve cadence: quick at first (the row usually lands within seconds), then steady while the call is live. */
const RESOLVE_DELAYS_MS = [1500, 2000, 2500, 3000, 3000, 3000, 3000, 3000];
const RESOLVE_STEADY_MS = 5000;
export const RESOLVE_MAX_MS = 120000;
/**
 * A terminal row this soon after placing, while the ring has not stopped, is
 * more likely the previous call to this contact than this one.
 */
const EARLY_TERMINAL_MS = 15000;
const RING_STOP_TERMINAL_MS = 5000;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** A ref that always holds the latest render's value, for async work that outlives the render it started in. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

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
 * know its REST id (from the server placement, or from resolve_call, since the
 * id in the CTI's ringing event is the widget's own and means nothing to the
 * REST API); and a timeout so a placement that never rings cannot lock the page.
 *
 * resolve_call prefers the contact's most recent dialpad_calls row from the
 * last two minutes, which right after a redial is the previous call. A result
 * that looks like that (an id this dock has already seen, or an already-ended
 * call while this one is still live) is checked against Dialpad's live call
 * list by number before anything is believed.
 *
 * The iframe is hidden off-screen, never display:none, for the same reason as
 * on the dialer: a hidden iframe can be suspended and the live audio dropped.
 * It is portalled to the end of the document and made inert while hidden so it
 * never sits in the middle of the page's tab order. It only mounts for reps
 * with a Dialpad user id, since without one no call can be tracked or placed.
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
  const [placedVia, setPlacedVia] = useState<PlacedVia | null>(null);
  const [hangingUp, setHangingUp] = useState(false);
  const [ctiAuthed, setCtiAuthed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Claim Dialpad's "current tab" on load only when this tab is the one the rep
  // is looking at. A contact opened into a background tab must not take the
  // call events away from a dialer tab mid-session; placing a call from here
  // claims the tab at that moment anyway.
  const [claimTabOnLoad] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");

  const statusMutation = useDialpadCallStatus();
  const cancelMutation = useCancelDialpadCall();
  const forceHangupMutation = useForceHangupCall();
  const resolveMutation = useResolveDialpadCall();
  const mutationsRef = useLatest({ status: statusMutation, cancel: cancelMutation, force: forceHangupMutation, resolve: resolveMutation });
  const onServerPlaceRef = useLatest(onServerPlace);
  const dialpadUserIdRef = useLatest(dialpadUserId ?? null);

  // Refs mirror the bits of state that async work has to read after an await.
  const stateRef = useRef<NativeCallState>("idle");
  const dialedRef = useRef<string | null>(null);
  const callIdRef = useRef<string | null>(null);
  const placedViaRef = useRef<PlacedVia | null>(null);
  const authKnownRef = useRef(false);
  const authedRef = useRef(false);
  const placementRef = useRef(0);
  const revealedOnceRef = useRef(false);
  const ringStoppedRef = useRef(false);
  const hangingUpRef = useRef(false);
  const mountedRef = useRef(true);
  /** Every REST call id this dock has handled, so a redial never adopts the previous call. */
  const seenCallIdsRef = useRef(new Set<string>());

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  // Read through a function so TypeScript does not narrow the ref across awaits.
  const currentState = (): NativeCallState => stateRef.current;
  const isLive = (s: NativeCallState) => s === "dialing" || s === "ringing" || s === "connected";
  /** Is this async worker still the one for the call on screen? */
  const stillCurrent = (placement: number) => mountedRef.current && placementRef.current === placement;

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
    onStateChange?.(callState, placedVia === "cti");
  }, [callState, placedVia, onStateChange]);

  const assignCallId = useCallback((id: string | null) => {
    callIdRef.current = id;
    if (id) seenCallIdsRef.current.add(id);
    setCallId(id);
  }, []);

  const setVia = useCallback((via: PlacedVia | null) => {
    placedViaRef.current = via;
    setPlacedVia(via);
  }, []);

  const clearCall = useCallback(() => {
    dispatch({ type: "reset" });
    setDialedNumber(null);
    dialedRef.current = null;
    setConnectedAt(null);
    assignCallId(null);
    setVia(null);
    ringStoppedRef.current = false;
  }, [assignCallId, dispatch, setVia]);

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
  // we know the REST call id we ask the server how the call is going: straight
  // away, then every few seconds, one request at a time, backing off when
  // Dialpad rate-limits the shared key.
  const live = isLive(callState);
  useEffect(() => {
    if (!callId || !live) return;
    let cancelled = false;
    let inFlight = false;
    let delay = STATUS_POLL_MS;
    let timer: number | undefined;
    const schedule = () => {
      if (!cancelled) timer = window.setTimeout(() => void tick(), delay);
    };
    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const res = await mutationsRef.current.status.mutateAsync(callId);
        if (cancelled) return;
        delay = STATUS_POLL_MS;
        const event = eventForDialpadState(res.state, Boolean(res.terminal || res.already_ended));
        if (event) dispatch(event);
      } catch (e) {
        const message = e instanceof Error ? e.message.toLowerCase() : "";
        if (message.includes("rate limit") || message.includes("429")) delay = Math.min(delay * 2, STATUS_POLL_MAX_MS);
      } finally {
        inFlight = false;
        schedule();
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [callId, live, dispatch, mutationsRef]);

  // While the audio runs inside this page, closing or reloading it drops the line.
  useEffect(() => {
    if (!live || placedVia !== "cti") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [live, placedVia]);

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
    if (payload?.state === "on") {
      dispatch({ type: "ringing" });
    } else if (payload?.state === "off") {
      ringStoppedRef.current = true;
      dispatch({ type: "ringing_off" });
    }
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
      if (!stillCurrent(placement) || currentState() !== "dialing") return false;
      if (ctiRef.current?.isAuthenticated()) return true;
      if (authKnownRef.current && !authedRef.current) return false;
      await sleep(200);
    }
    return Boolean(ctiRef.current?.isAuthenticated());
  }, []);

  /**
   * Learn the REST call id from the server so the status poll and Hang Up have
   * something to act on. Runs after a CTI placement, and after a server
   * placement that came back without an id. Keeps trying while the call is
   * live, then says so once if it never found one.
   */
  const resolveCallId = useCallback(async (placement: number, phone: string) => {
    const startedAt = Date.now();
    let attempt = 0;
    const abandoned = () => !stillCurrent(placement) || !isLive(currentState()) || Boolean(callIdRef.current);
    while (Date.now() - startedAt < RESOLVE_MAX_MS) {
      await sleep(RESOLVE_DELAYS_MS[attempt] ?? RESOLVE_STEADY_MS);
      attempt += 1;
      if (abandoned()) return;
      const userId = dialpadUserIdRef.current;
      if (!userId) return;
      try {
        const resolve = mutationsRef.current.resolve;
        let res = await resolve.mutateAsync({ phone, dialpad_user_id: userId, contact_id: contactId });
        if (abandoned()) return;
        let id = res.dialpad_call_id;
        if (!id) continue;
        const elapsed = Date.now() - startedAt;
        const alreadySeen = seenCallIdsRef.current.has(id);
        if (alreadySeen || isTerminalResult(res)) {
          // That may be the previous call to this contact. Without a contact id
          // the server skips its row shortcut and reads Dialpad's live call list
          // by number, which can only return a call that is actually in progress.
          const liveCall = await resolve.mutateAsync({ phone, dialpad_user_id: userId });
          if (abandoned()) return;
          const liveId = liveCall.dialpad_call_id;
          if (liveId && !seenCallIdsRef.current.has(liveId)) {
            res = liveCall;
            id = liveId;
          } else if (alreadySeen) {
            continue;
          } else if (!(ringStoppedRef.current && elapsed >= RING_STOP_TERMINAL_MS) && elapsed < EARLY_TERMINAL_MS) {
            continue;
          }
        }
        assignCallId(id);
        const event = eventForDialpadState(res.state, isTerminalResult(res));
        if (event) dispatch(event);
        return;
      } catch {
        // keep trying
      }
    }
    if (!abandoned()) {
      toast.warning("Dialpad isn't reporting this call to the page. Hang up from the call bar when you're done.");
    }
  }, [assignCallId, contactId, dialpadUserIdRef, dispatch, mutationsRef]);

  /** Best-effort end of a call we may know only by number; the CTI leg is ended separately. */
  const endServerCall = useCallback((id: string | null, phone: string | null) => {
    const { cancel, force } = mutationsRef.current;
    const userId = dialpadUserIdRef.current;
    if (id) {
      cancel.mutateAsync({ call_id: id }).catch(() => {});
    } else if (userId && phone) {
      force.mutateAsync({ dialpad_user_id: userId, phone }).catch(() => {});
    }
  }, [dialpadUserIdRef, mutationsRef]);

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
    setVia(null);
    ringStoppedRef.current = false;
    dispatch({ type: "place" });

    const ctiMounted = Boolean(dialpadUserIdRef.current);
    const authed = ctiMounted ? await waitForCtiAuth(placement) : false;
    if (!stillCurrent(placement) || currentState() !== "dialing") return;

    if (authed && ctiRef.current) {
      setVia("cti");
      ctiRef.current.initiateCall(phone, undefined, JSON.stringify({ contact_id: contactId, business_name: businessName }));
      toast.success(`Calling ${phone} through Dialpad`);
      void resolveCallId(placement, phone);
      return;
    }

    // Not calling through the embedded Dialpad: place this call through the
    // server (it rings the rep's own Dialpad device, then the prospect). If the
    // rep is signed out of the panel, show it once so they can sign in for next time.
    setVia("server");
    const signedOut = ctiMounted && authKnownRef.current && !authedRef.current;
    if (signedOut && !revealedOnceRef.current) {
      revealedOnceRef.current = true;
      setRevealed(true);
    }
    try {
      const res = await onServerPlaceRef.current(phone);
      if (!stillCurrent(placement)) {
        // A newer call has replaced this one; make sure this one is not left ringing.
        if (res.callId) endServerCall(res.callId, phone);
        return;
      }
      if (!isLive(currentState())) {
        // The rep hung up while the server was still placing it. End the real call.
        endServerCall(res.callId, phone);
        return;
      }
      if (res.callId) assignCallId(res.callId);
      const event = eventForDialpadState(res.state, false);
      if (event && event.type !== "terminal") dispatch(event);
      const hint = !ctiMounted
        ? ""
        : signedOut
          ? " Sign in to the Dialpad panel to run calls from this page."
          : authKnownRef.current
            ? ""
            : " Dialpad was still loading on this page.";
      toast.success(`Calling ${phone} through Dialpad on your device.${hint}`);
      if (!res.callId) void resolveCallId(placement, phone);
    } catch (e) {
      if (!stillCurrent(placement)) return;
      clearCall();
      toast.error(e instanceof Error ? e.message : "Couldn't start the Dialpad call.");
    }
  }, [assignCallId, businessName, clearCall, contactId, dialpadUserIdRef, dispatch, endServerCall, onServerPlaceRef, resolveCallId, setVia, waitForCtiAuth]);

  /**
   * End the call. When the iframe carries the audio, hangup_all ends it and the
   * server is told as a courtesy. When the call runs on the rep's device, only
   * the server can end it, so the bar waits for its answer and stays live if
   * Dialpad refused: a bar that says "ended" over a call that is still running
   * would leave no way to end it.
   */
  const hangUp = useCallback(async () => {
    if (hangingUpRef.current) return;
    const id = callIdRef.current;
    const phone = dialedRef.current;
    const userId = dialpadUserIdRef.current;
    ctiRef.current?.hangUpAll();
    if (placedViaRef.current !== "server") {
      endServerCall(id, phone);
      dispatch({ type: "hangup" });
      return;
    }
    hangingUpRef.current = true;
    setHangingUp(true);
    try {
      const { cancel, force } = mutationsRef.current;
      if (id) {
        await cancel.mutateAsync({ call_id: id });
      } else if (userId && phone) {
        await force.mutateAsync({ dialpad_user_id: userId, phone });
      }
      if (mountedRef.current) dispatch({ type: "hangup" });
    } catch (e) {
      if (!mountedRef.current) return;
      const message = e instanceof Error ? e.message : "Couldn't hang up through Dialpad.";
      if (message.toLowerCase().includes("no endpoint found") && id) {
        // Dialpad is releasing it; the status poll will show the end.
        toast.info("Ending call… waiting for Dialpad to release it.");
      } else {
        toast.error(`${message} If it's still ringing, hang up on your Dialpad device.`);
      }
    } finally {
      hangingUpRef.current = false;
      if (mountedRef.current) setHangingUp(false);
    }
  }, [dialpadUserIdRef, dispatch, endServerCall, mutationsRef]);

  const hidePanel = useCallback(() => {
    setRevealed(false);
    // Put focus somewhere sensible instead of the next tab stop inside the hidden iframe.
    const target = barRef.current?.querySelector<HTMLElement>("button");
    (target ?? document.body).focus?.();
  }, []);

  useImperativeHandle(ref, () => ({ placeCall }), [placeCall]);

  const ctiMounted = Boolean(dialpadUserId);

  const panel = ctiMounted ? (
    <div
      ref={panelRef}
      aria-hidden={!revealed}
      className={cn(
        "fixed z-50 transition-all",
        revealed
          ? "right-4 bottom-4 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
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
        claimTabOnLoad={claimTabOnLoad}
        phoneNumber={dialedNumber}
        customData={JSON.stringify({ contact_id: contactId, business_name: businessName })}
        onCallRinging={handleRinging}
        onAuthChange={handleAuthChange}
      />
    </div>
  ) : null;

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
            hangingUp={hangingUp}
            onHangUp={() => void hangUp()}
            onRevealDialpad={() => setRevealed(true)}
          />
        </div>
      )}
      {panel && (typeof document !== "undefined" ? createPortal(panel, document.body) : panel)}
    </>
  );
});

export default ContactCallDock;
