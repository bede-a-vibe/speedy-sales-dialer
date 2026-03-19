import { useCallback, useEffect, useRef, useState } from "react";
import {
  useDialpadCall,
  useDialpadCallStatus,
  useCancelDialpadCall,
  useResolveDialpadCall,
  useForceHangupCall,
  useLinkDialpadCallLog,
  useDialpadCallerIds,
} from "@/hooks/useDialpad";
import { useMyDialpadSettings } from "@/hooks/useDialpadSettings";
import { toast } from "sonner";
import type { Contact } from "@/hooks/useContacts";

// ── Storage lock helpers ──
function getDialRequestStorageKey(requestKey: string) {
  return `dialpad-request:${requestKey}`;
}

function hasActiveDialRequestLock(requestKey: string, maxAgeMs = 45000) {
  if (typeof window === "undefined") return false;
  const raw = window.sessionStorage.getItem(getDialRequestStorageKey(requestKey));
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) {
    window.sessionStorage.removeItem(getDialRequestStorageKey(requestKey));
    return false;
  }
  return true;
}

function setActiveDialRequestLock(requestKey: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(getDialRequestStorageKey(requestKey), String(Date.now()));
}

function clearActiveDialRequestLock(requestKey: string | null) {
  if (typeof window === "undefined" || !requestKey) return;
  window.sessionStorage.removeItem(getDialRequestStorageKey(requestKey));
}

export interface UseDialerDialpadOptions {
  isDialing: boolean;
  isSessionPaused: boolean;
  currentContact: Contact | null;
  selectedCallerId: string;
}

export function useDialerDialpad({
  isDialing,
  isSessionPaused,
  currentContact,
  selectedCallerId,
}: UseDialerDialpadOptions) {
  const [activeDialpadCallId, setActiveDialpadCallId] = useState<string | null>(null);
  const [activeDialpadCallState, setActiveDialpadCallState] = useState<string | null>(null);
  const [dialpadPollingBackoffUntil, setDialpadPollingBackoffUntil] = useState<number | null>(null);
  const [rapidStatusPollingUntil, setRapidStatusPollingUntil] = useState<number | null>(null);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [isCallResolving, setIsCallResolving] = useState(false);
  const activeDialRequestRef = useRef<string | null>(null);
  const dialpadCallRef = useRef<ReturnType<typeof useDialpadCall> | null>(null);
  const lastDialpadCallIdRef = useRef<string | null>(null);

  const { data: myDialpadSettings } = useMyDialpadSettings();
  const { data: callerIdOptions = [] } = useDialpadCallerIds(myDialpadSettings?.dialpad_user_id);
  const dialpadCall = useDialpadCall();
  dialpadCallRef.current = dialpadCall;
  const { mutateAsync: fetchDialpadCallStatus, isPending: isDialpadCallStatusPending } = useDialpadCallStatus();
  const cancelDialpadCall = useCancelDialpadCall();
  const resolveDialpadCall = useResolveDialpadCall();
  const forceHangupCall = useForceHangupCall();
  const linkDialpadCallLog = useLinkDialpadCallLog();

  const hasDialpadAssignment = Boolean(myDialpadSettings?.dialpad_user_id);
  const hasUnresolvedDialpadCall = !activeDialpadCallId
    && (isCallResolving || activeDialpadCallState === "connecting" || activeDialpadCallState === "calling" || activeDialpadCallState === "ringing");
  const isCallTerminal = (!activeDialpadCallId && !hasUnresolvedDialpadCall) || activeDialpadCallState === "hangup";

  const resetDialpadState = useCallback(() => {
    clearActiveDialRequestLock(activeDialRequestRef.current);
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    lastDialpadCallIdRef.current = null;
    setDialpadPollingBackoffUntil(null);
    setRapidStatusPollingUntil(null);
    setIsEndingCall(false);
    setIsCallResolving(false);
    activeDialRequestRef.current = null;
  }, []);

  const getDialpadCallIdForLog = useCallback(() => {
    return activeDialpadCallId || lastDialpadCallIdRef.current;
  }, [activeDialpadCallId]);

  // ── Place call effect ──
  useEffect(() => {
    if (!isDialing || isSessionPaused || !currentContact || !myDialpadSettings?.dialpad_user_id) return;

    const requestKey = `${currentContact.id}:${currentContact.phone}`;
    if (activeDialRequestRef.current === requestKey || hasActiveDialRequestLock(requestKey)) return;

    activeDialRequestRef.current = requestKey;
    setActiveDialRequestLock(requestKey);
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    setIsCallResolving(false);

    const mutation = dialpadCallRef.current;

    const attemptDial = async (retriesLeft: number): Promise<void> => {
      try {
        const response = await mutation!.mutateAsync({
          phone: currentContact.phone,
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          contact_id: currentContact.id,
          caller_id: selectedCallerId || undefined,
        });

        if (response.dialpad_call_id) {
          setActiveDialpadCallId(response.dialpad_call_id);
          lastDialpadCallIdRef.current = response.dialpad_call_id;
          setActiveDialpadCallState(response.state ?? "calling");
          setRapidStatusPollingUntil(Date.now() + 10000);
          setIsCallResolving(false);
        } else {
          setIsCallResolving(true);
          setActiveDialpadCallState(response.state ?? "connecting");
          setRapidStatusPollingUntil(Date.now() + 10000);
          toast.info("Call placed — linking the live Dialpad call in the dialer…");
          return;
        }

        toast.success(
          response.message === "Existing Dialpad call is already active for this lead."
            ? response.message
            : `Calling ${currentContact.phone} through Dialpad`,
        );
        if (response.tracking_warning) toast.warning("Call placed, but transcript tracking needs attention.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
        const normalized = message.toLowerCase();
        const is409 = message.includes("409") || normalized.includes("already being created") || normalized.includes("still active");
        const is429 = message.includes("429") || normalized.includes("rate_limit") || normalized.includes("rate limit");
        const isAlreadyOnCall = normalized.includes("currently on a call");

        if (isAlreadyOnCall) {
          setIsCallResolving(true);
          setActiveDialpadCallState("connecting");
          setRapidStatusPollingUntil(Date.now() + 10000);
          toast.info("Dialpad reports an active call — linking it in the dialer…");
          return;
        }

        if ((is409 || is429) && retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, is429 ? 2500 : 1500));
          return attemptDial(retriesLeft - 1);
        }

        clearActiveDialRequestLock(requestKey);
        activeDialRequestRef.current = null;
        setActiveDialpadCallId(null);
        setActiveDialpadCallState(null);
        setIsCallResolving(false);
        toast.error(message);
      }
    };

    void attemptDial(2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialing, isSessionPaused, currentContact, myDialpadSettings?.dialpad_user_id, selectedCallerId]);

  // ── Resolution polling ──
  useEffect(() => {
    if (!isCallResolving || activeDialpadCallId || !currentContact || !myDialpadSettings?.dialpad_user_id) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempt = 0;
    const MAX_ATTEMPTS = 20;
    const pollDelays = [150, 300, 500, 750, 1000, 1250, 1500, 2000, 2000, 2500, 2500, 3000];

    const attemptResolve = async () => {
      try {
        const result = await resolveDialpadCall.mutateAsync({
          phone: currentContact.phone,
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          contact_id: currentContact.id,
        });
        if (cancelled) return;
        if (result.dialpad_call_id) {
          setActiveDialpadCallId(result.dialpad_call_id);
          lastDialpadCallIdRef.current = result.dialpad_call_id;
          setActiveDialpadCallState(result.state ?? "calling");
          setRapidStatusPollingUntil(Date.now() + 10000);
          setIsCallResolving(false);
          toast.success("Active call linked to the dialer.");
          return;
        }
      } catch { /* keep retrying */ }

      if (!cancelled) {
        if (attempt >= MAX_ATTEMPTS) {
          setIsCallResolving(false);
          setActiveDialpadCallState("live");
          toast.warning("Call is live but couldn't be linked to Dialpad tracking.");
          return;
        }
        const nextDelay = pollDelays[Math.min(attempt, pollDelays.length - 1)];
        attempt += 1;
        timeoutId = window.setTimeout(attemptResolve, nextDelay);
      }
    };

    timeoutId = window.setTimeout(attemptResolve, pollDelays[0]);
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [activeDialpadCallId, currentContact, isCallResolving, myDialpadSettings?.dialpad_user_id, resolveDialpadCall]);

  // ── Status polling ──
  useEffect(() => {
    if (!activeDialpadCallId) return;
    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (cancelled || inFlight) return;
      if (dialpadPollingBackoffUntil && dialpadPollingBackoffUntil > Date.now()) return;
      inFlight = true;
      try {
        const status = await fetchDialpadCallStatus(activeDialpadCallId);
        if (cancelled) return;
        setActiveDialpadCallState(status.state);
        if (status.terminal) {
          setActiveDialpadCallId(null);
          setDialpadPollingBackoffUntil(null);
          setRapidStatusPollingUntil(null);
        }
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes("rate limit")) {
          setDialpadPollingBackoffUntil(Date.now() + 10000);
        }
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const intervalMs = rapidStatusPollingUntil && rapidStatusPollingUntil > Date.now() ? 2000 : 6000;
    const id = window.setInterval(poll, intervalMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeDialpadCallId, dialpadPollingBackoffUntil, fetchDialpadCallStatus, rapidStatusPollingUntil]);

  // ── Cancel / hangup ──
  const cancelActiveCall = useCallback(async () => {
    setIsEndingCall(true);
    setActiveDialpadCallState((c) => (c === "hangup" ? c : "ending"));
    setRapidStatusPollingUntil(Date.now() + 10000);

    try {
      if (activeDialpadCallId) {
        const result = await cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId });
        setActiveDialpadCallState(result.state ?? "ending");
        if (result.already_ended || result.terminal) {
          setActiveDialpadCallId(null);
          setActiveDialpadCallState("hangup");
          setDialpadPollingBackoffUntil(null);
          setRapidStatusPollingUntil(null);
          setIsCallResolving(false);
          toast.info("This call has already ended.");
          return;
        }
        toast.success(result.message || "Call cancellation requested.");
      } else if (myDialpadSettings?.dialpad_user_id && currentContact?.phone) {
        await forceHangupCall.mutateAsync({
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          phone: currentContact.phone,
        });
        setActiveDialpadCallId(null);
        setActiveDialpadCallState("hangup");
        setDialpadPollingBackoffUntil(null);
        setRapidStatusPollingUntil(null);
        setIsCallResolving(false);
        toast.success("Call ended.");
      } else {
        toast.info("No active call to cancel.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to cancel the active call.";
      if (message.toLowerCase().includes("rate limit")) setDialpadPollingBackoffUntil(Date.now() + 10000);
      if (message.toLowerCase().includes("no endpoint found")) {
        toast.info("Ending call… waiting for Dialpad to release it.");
        return;
      }
      toast.error(message);
    } finally {
      setIsEndingCall(false);
    }
  }, [activeDialpadCallId, cancelDialpadCall, forceHangupCall, myDialpadSettings, currentContact]);

  const fireAndForgetHangup = useCallback(() => {
    if (activeDialpadCallId && activeDialpadCallState !== "hangup") {
      cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId }).catch(() => {});
    } else if (!activeDialpadCallId && !isCallTerminal && myDialpadSettings?.dialpad_user_id && currentContact?.phone) {
      forceHangupCall.mutateAsync({
        dialpad_user_id: myDialpadSettings.dialpad_user_id,
        phone: currentContact.phone,
      }).catch(() => {});
    }
  }, [activeDialpadCallId, activeDialpadCallState, cancelDialpadCall, currentContact, forceHangupCall, isCallTerminal, myDialpadSettings]);

  return {
    // Settings
    myDialpadSettings,
    callerIdOptions,
    hasDialpadAssignment,
    // Call state
    activeDialpadCallId,
    activeDialpadCallState: activeDialpadCallState ?? (isCallResolving ? "connecting" : null),
    isCallTerminal,
    isEndingCall,
    isCallResolving,
    isDialpadCallStatusPending,
    dialpadPollingBackoffUntil,
    // Mutations
    dialpadCall,
    cancelDialpadCall,
    linkDialpadCallLog,
    // Actions
    cancelActiveCall,
    fireAndForgetHangup,
    resetDialpadState,
    getDialpadCallIdForLog,
  };
}
