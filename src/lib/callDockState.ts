import type { NativeCallState } from "@/components/dialer/NativeCallBar";

export type CallDockEvent =
  | { type: "place" }
  | { type: "ringing" }
  | { type: "ringing_off" }
  | { type: "connected" }
  | { type: "terminal" }
  | { type: "hangup" }
  | { type: "reset" };

/**
 * The contact page's call bar state machine, kept pure so it can be tested
 * without the Dialpad iframe. "ringing_off" is Dialpad's call_ringing
 * state=off: the ring stopped, which on an outbound call means it was
 * answered. "connected" is the server poll saying the same thing.
 */
export function nextCallState(prev: NativeCallState, event: CallDockEvent): NativeCallState {
  switch (event.type) {
    case "place":
      return "dialing";
    case "ringing":
      return prev === "connected" || prev === "ended" || prev === "idle" ? prev : "ringing";
    case "ringing_off":
    case "connected":
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

/** Last nine digits, the same comparison the dialer uses to match numbers. */
export function last9(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").slice(-9);
}

/**
 * Does a Dialpad ringing event belong to the call this bar placed? A missing
 * external number is given the benefit of the doubt; a different number is
 * someone else ringing in.
 */
export function ringBelongsToCall(externalNumber: string | null | undefined, dialedNumber: string | null | undefined): boolean {
  const a = last9(externalNumber);
  const b = last9(dialedNumber);
  if (!a || !b) return true;
  return a === b;
}

/** Map a Dialpad call state string (from get_call_status / resolve_call) onto the bar. */
export function eventForDialpadState(state: string | null | undefined, terminal: boolean): CallDockEvent | null {
  if (terminal) return { type: "terminal" };
  const s = (state ?? "").toLowerCase();
  if (!s) return null;
  if (["connected", "in_progress", "answered", "active", "talking"].includes(s)) return { type: "connected" };
  if (["ringing", "calling", "dialing"].includes(s)) return { type: "ringing" };
  if (["hangup", "ended", "completed", "canceled", "cancelled", "missed", "voicemail"].includes(s)) return { type: "terminal" };
  return null;
}
