import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { Headphones } from "lucide-react";
import { DialpadCTI, type CallRingingPayload, type DialpadCTIHandle } from "@/components/dialer/DialpadCTI";
import { NativeCallBar, type NativeCallState } from "@/components/dialer/NativeCallBar";
import { useCancelDialpadCall, useDialpadCallStatus } from "@/hooks/useDialpad";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Same public, origin-restricted Dialpad CTI client id the dialer uses. Dialpad
 * rejects it from any other origin, so it is safe in the bundle; the env var
 * still overrides it.
 */
const DEFAULT_DIALPAD_CTI_CLIENT_ID = "hbhxaRmhSjrSTYGh8T4NwpGNd";
export const DIALPAD_CTI_CLIENT_ID: string | null =
  (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_DIALPAD_CTI_CLIENT_ID
  ?? DEFAULT_DIALPAD_CTI_CLIENT_ID;

export type CallDockEvent =
  | { type: "place" }
  | { type: "ringing" }
  | { type: "ringing_off" }
  | { type: "terminal" }
  | { type: "hangup" }
  | { type: "reset" };

/**
 * The call bar's state machine, kept pure so it can be tested without the
 * Dialpad iframe. "ringing_off" is Dialpad's call_ringing state=off: the ring
 * stopped, which on an outbound call means it was answered.
 */
export function nextCallState(prev: NativeCallState, event: CallDockEvent): NativeCallState {
  switch (event.type) {
    case "place":
      return "dialing";
    case "ringing":
      return prev === "connected" || prev === "ended" ? prev : "ringing";
    case "ringing_off":
      return prev === "ringing" || prev === "dialing" ? "connected" : prev;
    case "terminal":
    case "hangup":
      return prev === "idle" ? "idle" : "ended";
    case "reset":
      return "idle";
    default:
      return prev;
  }
}

export interface ContactCallDockHandle {
  /** Place a call to this number. Uses the embedded Dialpad when it is signed in, otherwise the server. */
  placeCall: (phone: string) => Promise<void>;
}

interface ContactCallDockProps {
  contactId: string;
  businessName: string | null;
  /**
   * Server fallback when the embedded Dialpad is not signed in. Should place the
   * call and return the Dialpad call id if it has one, so the bar can still
   * poll the state and hang up.
   */
  onServerPlace: (phone: string) => Promise<string | null>;
  /** Reported on every change so the page can disable its call buttons mid-call. */
  onStateChange?: (state: NativeCallState) => void;
  className?: string;
}

const STATUS_POLL_MS = 4000;
const ENDED_RESET_MS = 12000;

/**
 * Embedded Dialpad for the contact page (Bede, 30 Oct 2026). The dialer already
 * had this: a headless CTI iframe that carries the audio and a native call bar
 * with the state and a Hang Up button. The contact page placed calls through
 * the server and showed a toast, so the rep had no idea whether it had
 * connected and no way to hang up. This mounts the same iframe here, drives
 * the same bar from the CTI's ringing events, polls the server for the end of
 * the call, and falls back to the server path when Dialpad is not signed in.
 *
 * The iframe is hidden off-screen, never display:none, for the same reason as
 * on the dialer: a hidden iframe can be suspended and the live audio dropped.
 */
export const ContactCallDock = forwardRef<ContactCallDockHandle, ContactCallDockProps>(function ContactCallDock(
  { contactId, businessName, onServerPlace, onStateChange, className },
  ref,
) {
  const ctiRef = useRef<DialpadCTIHandle | null>(null);
  const [callState, setCallState] = useState<NativeCallState>("idle");
  const [dialedNumber, setDialedNumber] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [ctiAuthed, setCtiAuthed] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const statusMutation = useDialpadCallStatus();
  const cancelMutation = useCancelDialpadCall();
  const stateRef = useRef<NativeCallState>("idle");

  const dispatch = useCallback((event: CallDockEvent) => {
    setCallState((prev) => {
      const next = nextCallState(prev, event);
      if (next === "connected" && prev !== "connected") setConnectedAt(Date.now());
      return next;
    });
  }, []);

  useEffect(() => {
    stateRef.current = callState;
    onStateChange?.(callState);
  }, [callState, onStateChange]);

  // A finished call clears itself off the page after a moment.
  useEffect(() => {
    if (callState !== "ended") return;
    const id = window.setTimeout(() => {
      dispatch({ type: "reset" });
      setDialedNumber(null);
      setConnectedAt(null);
      setCallId(null);
    }, ENDED_RESET_MS);
    return () => window.clearTimeout(id);
  }, [callState, dispatch]);

  // Dialpad's CTI only tells us about ringing, never about the hang-up, so once
  // we know the call id we ask the server every few seconds whether it is over.
  useEffect(() => {
    if (!callId) return;
    if (callState === "idle" || callState === "ended") return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await statusMutation.mutateAsync(callId);
        if (cancelled) return;
        if (res.terminal || res.already_ended) dispatch({ type: "terminal" });
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

  const handleRinging = useCallback((payload: CallRingingPayload) => {
    if (payload?.state === "on") dispatch({ type: "ringing" });
    else if (payload?.state === "off") dispatch({ type: "ringing_off" });
    const id = payload?.id != null ? String(payload.id) : "";
    if (id) {
      setCallId((prev) => prev ?? id);
      // Fire-and-forget, same as the dialer: record the CTI call so the sync
      // and transcript drain can link it to this contact.
      supabase.functions
        .invoke("dialpad", {
          body: {
            action: "record_cti_call",
            dialpad_call_id: id,
            contact_id: contactId,
            call_state: payload.state === "off" ? "hangup" : "ringing",
          },
        })
        .catch(() => {});
    }
  }, [contactId, dispatch]);

  const handleAuthChange = useCallback((authed: boolean) => setCtiAuthed(authed), []);

  const placeCall = useCallback(async (phone: string) => {
    if (stateRef.current === "dialing" || stateRef.current === "ringing" || stateRef.current === "connected") {
      toast.info("You're already on a call. Hang up first.");
      return;
    }
    setDialedNumber(phone);
    setConnectedAt(null);
    setCallId(null);
    dispatch({ type: "place" });
    const cti = ctiRef.current;
    if (cti?.isAuthenticated()) {
      cti.initiateCall(phone, undefined, JSON.stringify({ contact_id: contactId, business_name: businessName }));
      toast.success(`Calling ${phone} through Dialpad`);
      return;
    }
    // Not signed in to the embedded Dialpad: show it so the rep can sign in for
    // next time, and place this call through the server as before.
    setRevealed(true);
    try {
      const id = await onServerPlace(phone);
      if (id) setCallId(id);
      toast.success(`Calling ${phone} via Dialpad`);
    } catch (e) {
      dispatch({ type: "reset" });
      setDialedNumber(null);
      toast.error(e instanceof Error ? e.message : "Couldn't start the Dialpad call.");
    }
  }, [businessName, contactId, dispatch, onServerPlace]);

  const hangUp = useCallback(() => {
    ctiRef.current?.hangUpAll();
    if (callId) cancelMutation.mutateAsync({ call_id: callId }).catch(() => {});
    dispatch({ type: "hangup" });
  }, [callId, cancelMutation, dispatch]);

  useImperativeHandle(ref, () => ({ placeCall }), [placeCall]);

  if (!DIALPAD_CTI_CLIENT_ID) return null;

  return (
    <>
      {callState !== "idle" && (
        <div className={className}>
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

      {/* Headless Dialpad CTI: mounted for the page's lifetime, hidden off-screen
          between calls, brought on-screen as a panel without unmounting. */}
      <div
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
              {!ctiAuthed && <span className="text-[11px] text-amber-600">Sign in to call from here</span>}
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setRevealed(false)}
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
    </>
  );
});

export default ContactCallDock;
