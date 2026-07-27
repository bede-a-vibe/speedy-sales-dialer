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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Contact } from "@/hooks/useContacts";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Storage lock helpers ──
function getDialRequestStorageKey(requestKey: string) {
  return `dialpad-request:${requestKey}`;
}

function readSessionStorageItem(key: string) {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return false;

  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeSessionStorageItem(key: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage access failures in privacy-restricted browsers.
  }
}

function hasActiveDialRequestLock(requestKey: string, maxAgeMs = 45000) {
  const storageKey = getDialRequestStorageKey(requestKey);
  const raw = readSessionStorageItem(storageKey);
  if (!raw) return false;

  const ts = Number(raw);
  if (!Number.isFinite(ts) || Date.now() - ts > maxAgeMs) {
    removeSessionStorageItem(storageKey);
    return false;
  }

  return true;
}

function setActiveDialRequestLock(requestKey: string) {
  writeSessionStorageItem(getDialRequestStorageKey(requestKey), String(Date.now()));
}

function clearActiveDialRequestLock(requestKey: string | null) {
  if (!requestKey) return;
  removeSessionStorageItem(getDialRequestStorageKey(requestKey));
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
  // Dial the DECISION MAKER's direct number when we have one — the office/main
  // line is the fallback, not the default (reps kept reaching tradesmen on the
  // website number when the MD's mobile was sitting captured on the lead).
  // A "DM number" identical to the office line is enrichment noise, not a
  // direct route — 9,920 scraped contacts carried the office number as
  // dm_phone, making the DM DIRECT badge lie. Last-9 compare like everywhere.
  const last9 = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-9);
  const dmCandidate = (currentContact as { dm_phone?: string | null } | null)?.dm_phone?.trim();
  const dmDirect = dmCandidate && dmCandidate !== "" && last9(dmCandidate) !== last9(currentContact?.phone)
    ? dmCandidate
    : undefined;
  const dialNumber = dmDirect ?? (currentContact?.phone ?? null);
  // Frozen at placement: what the ACTIVE/ENDED call actually dialled. The live
  // dialNumber recomputes as contact data changes, which retroactively
  // mislabels an in-flight or ended call in the UI.
  const [placedDialNumber, setPlacedDialNumber] = useState<string | null>(null);
  const [placedWasDmDirect, setPlacedWasDmDirect] = useState(false);
  const placedForContactRef = useRef<string | null>(null);
  useEffect(() => {
    // New lead → the last placement no longer describes this card.
    if (currentContact?.id !== placedForContactRef.current) {
      placedForContactRef.current = currentContact?.id ?? null;
      setPlacedDialNumber(null);
      setPlacedWasDmDirect(false);
    }
  }, [currentContact?.id]);
  const [activeDialpadCallId, setActiveDialpadCallId] = useState<string | null>(null);
  const [syncTrackedDialpadCallId, setSyncTrackedDialpadCallId] = useState<string | null>(null);
  const [activeDialpadCallState, setActiveDialpadCallState] = useState<string | null>(null);
  const [dialpadPollingBackoffUntil, setDialpadPollingBackoffUntil] = useState<number | null>(null);
  const [isEndingCall, setIsEndingCall] = useState(false);
  const [isCallResolving, setIsCallResolving] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [isRetryingUntrackedLiveCall, setIsRetryingUntrackedLiveCall] = useState(false);
  const [hasTrackingRecoveryFailed, setHasTrackingRecoveryFailed] = useState(false);
  const [lastLinkAttemptAt, setLastLinkAttemptAt] = useState<number | null>(null);
  const [nextAutoRetryAt, setNextAutoRetryAt] = useState<number | null>(null);
  const activeDialRequestRef = useRef<string | null>(null);
  const isOnline = useNetworkStatus();
  const dialpadCallRef = useRef<ReturnType<typeof useDialpadCall> | null>(null);
  const lastDialpadCallIdRef = useRef<string | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

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
  const dialpadHealth = !isOnline
    ? {
        level: "warning" as const,
        title: "Dialpad syncing is paused while offline",
        detail: "Reconnect to resume live call linking, status checks, and realtime updates.",
      }
    : hasTrackingRecoveryFailed
      ? {
          level: "degraded" as const,
          title: "Dialpad tracking needs attention",
          detail: "The live call could not relink automatically. Retry linking now or end the call when it is safe.",
        }
      : isRetryingUntrackedLiveCall
      ? {
          level: "degraded" as const,
          title: "Dialpad tracking is recovering",
          detail: nextAutoRetryAt && nextAutoRetryAt > Date.now()
            ? `The call is still live, but tracking has not reattached yet. Next automatic relink attempt is due in about ${Math.max(1, Math.ceil((nextAutoRetryAt - Date.now()) / 1000))}s.`
            : "The call is still live, but tracking has not reattached yet. The dialer is retrying in the background.",
        }
      : dialpadPollingBackoffUntil && dialpadPollingBackoffUntil > Date.now()
          ? {
              level: "warning" as const,
              title: "Dialpad status checks are paused briefly",
              detail: "Dialpad rate limited a status refresh. Realtime updates can still arrive while polling backs off.",
            }
          : activeDialpadCallId && activeDialpadCallState && activeDialpadCallState !== "hangup"
            ? {
                level: "healthy" as const,
                title: "Dialpad tracking is healthy",
                detail: `Live call linked. Current state: ${activeDialpadCallState}.`,
              }
            : null;

  const clearActiveDialRequest = useCallback(() => {
    clearActiveDialRequestLock(activeDialRequestRef.current);
    activeDialRequestRef.current = null;
  }, []);

  // Re-arm auto-dial across pauses: a placement key consumed by an attempt
  // that got interrupted (inbound-callback pause, session stop, or a dial
  // that failed all retries) must not block redialling the SAME lead on
  // resume — otherwise the session sits at READY and never places the call.
  // Clearing the key also makes any in-flight attempt stale (isStaleAttempt),
  // so this can't double-dial: it only runs while paused/stopped with no
  // active call, and the place effect re-fires only once dialing resumes.
  useEffect(() => {
    if ((isSessionPaused || !isDialing) && !activeDialpadCallId && !isEndingCall && !isCallResolving) {
      clearActiveDialRequestLock(activeDialRequestRef.current);
      activeDialRequestRef.current = null;
    }
  }, [isSessionPaused, isDialing, activeDialpadCallId, isEndingCall, isCallResolving]);

  const markCallAsEnded = useCallback((nextState: string | null = "hangup") => {
    clearActiveDialRequest();
    setSyncTrackedDialpadCallId((current) => current || activeDialpadCallId || lastDialpadCallIdRef.current);
    setActiveDialpadCallId(null);
    setActiveDialpadCallState(nextState);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    setIsCallResolving(false);
    setCallStartedAt(null);
    setIsRetryingUntrackedLiveCall(false);
    setHasTrackingRecoveryFailed(false);
    setLastLinkAttemptAt(null);
    setNextAutoRetryAt(null);
  }, [activeDialpadCallId, clearActiveDialRequest]);

  const resetDialpadState = useCallback(() => {
    clearActiveDialRequest();
    setActiveDialpadCallId(null);
    setSyncTrackedDialpadCallId(null);
    setActiveDialpadCallState(null);
    lastDialpadCallIdRef.current = null;
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    setIsCallResolving(false);
    setCallStartedAt(null);
    setIsRetryingUntrackedLiveCall(false);
    setHasTrackingRecoveryFailed(false);
    setLastLinkAttemptAt(null);
    setNextAutoRetryAt(null);
  }, [clearActiveDialRequest]);

  const getDialpadCallIdForLog = useCallback(() => {
    return activeDialpadCallId || lastDialpadCallIdRef.current;
  }, [activeDialpadCallId]);

  // ── Place call effect ──
  useEffect(() => {
    if (!isOnline || !isDialing || isSessionPaused || !currentContact || !dialNumber || !myDialpadSettings?.dialpad_user_id) return;

    const requestKey = `${currentContact.id}:${dialNumber}`;
    if (activeDialRequestRef.current === requestKey || hasActiveDialRequestLock(requestKey)) return;

    let cancelled = false;
    const isStaleAttempt = () => cancelled || activeDialRequestRef.current !== requestKey;

    activeDialRequestRef.current = requestKey;
    setActiveDialRequestLock(requestKey);
    setActiveDialpadCallId(null);
    setSyncTrackedDialpadCallId(null);
    setActiveDialpadCallState(null);
    setDialpadPollingBackoffUntil(null);
    setIsEndingCall(false);
    setIsCallResolving(false);
    setHasTrackingRecoveryFailed(false);
    setCallStartedAt(Date.now());
    placedForContactRef.current = currentContact.id;
    setPlacedDialNumber(dialNumber);
    setPlacedWasDmDirect(Boolean(dmDirect));

    const mutation = dialpadCallRef.current;

    const attemptDial = async (retriesLeft: number): Promise<void> => {
      try {
        const response = await mutation!.mutateAsync({
          phone: dialNumber,
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          contact_id: currentContact.id,
          caller_id: selectedCallerId || undefined,
        });

        if (isStaleAttempt()) return;

        if (response.dialpad_call_id) {
          setActiveDialpadCallId(response.dialpad_call_id);
          setSyncTrackedDialpadCallId(response.dialpad_call_id);
          lastDialpadCallIdRef.current = response.dialpad_call_id;
          setActiveDialpadCallState(response.state ?? "calling");
          setIsCallResolving(false);
        } else {
          setIsCallResolving(true);
          setActiveDialpadCallState(response.state ?? "connecting");
          toast.info("Call placed — linking the live Dialpad call in the dialer…");
          return;
        }

        toast.success(
          response.message === "Existing Dialpad call is already active for this lead."
            ? response.message
            : dmDirect
              ? `Calling the decision maker direct on ${dialNumber}`
              : `Calling ${dialNumber} through Dialpad`,
        );
        if (response.tracking_warning) toast.warning("Call placed, but transcript tracking needs attention.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to place Dialpad call.";
        const normalized = message.toLowerCase();
        const is409 = message.includes("409") || normalized.includes("already being created") || normalized.includes("still active");
        const is429 = message.includes("429") || normalized.includes("rate_limit") || normalized.includes("rate limit");
        const isAlreadyOnCall = normalized.includes("currently on a call");

        if (isStaleAttempt()) return;

        if (isAlreadyOnCall) {
          setIsCallResolving(true);
          setActiveDialpadCallState("connecting");
          toast.info("Dialpad reports an active call — linking it in the dialer…");
          return;
        }

        if ((is409 || is429) && retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, is429 ? 2500 : 1500));
          if (isStaleAttempt()) return;
          return attemptDial(retriesLeft - 1);
        }

        clearActiveDialRequestLock(requestKey);
        activeDialRequestRef.current = null;
        setActiveDialpadCallId(null);
        setSyncTrackedDialpadCallId(null);
        setActiveDialpadCallState(null);
        setIsCallResolving(false);
        setCallStartedAt(null);
        toast.error(message);
      }
    };

    void attemptDial(2);

    return () => {
      cancelled = true;
      if (activeDialRequestRef.current === requestKey) {
        clearActiveDialRequestLock(requestKey);
        activeDialRequestRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialing, isOnline, isSessionPaused, currentContact, myDialpadSettings?.dialpad_user_id, selectedCallerId]);

  // ── Resolution polling ──
  useEffect(() => {
    if (!isOnline || !isCallResolving || activeDialpadCallId || !currentContact || !myDialpadSettings?.dialpad_user_id) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempt = 0;
    const MAX_ATTEMPTS = 8;
    const pollDelays = [500, 1000, 1500, 2000, 2500, 3000, 3000, 3000];

    const attemptResolve = async () => {
      try {
        setLastLinkAttemptAt(Date.now());
        setNextAutoRetryAt(null);
        const result = await resolveDialpadCall.mutateAsync({
          phone: dialNumber ?? currentContact.phone,
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          contact_id: currentContact.id,
        });
        if (cancelled) return;
        if (result.dialpad_call_id) {
          setActiveDialpadCallId(result.dialpad_call_id);
          setSyncTrackedDialpadCallId(result.dialpad_call_id);
          lastDialpadCallIdRef.current = result.dialpad_call_id;
          setActiveDialpadCallState(result.state ?? "calling");
          setIsCallResolving(false);
          setIsRetryingUntrackedLiveCall(false);
          setHasTrackingRecoveryFailed(false);
          setNextAutoRetryAt(null);
          toast.success("Active call linked to the dialer.");
          return;
        }
      } catch { /* keep retrying */ }

      if (!cancelled) {
        if (attempt >= MAX_ATTEMPTS) {
          setIsCallResolving(false);
          setActiveDialpadCallState("live");
          setIsRetryingUntrackedLiveCall(true);
          setHasTrackingRecoveryFailed(false);
          setNextAutoRetryAt(Date.now() + 5000);
          toast.warning("Call is live but couldn't be linked yet. We'll keep retrying in the background.");
          return;
        }
        const nextDelay = pollDelays[Math.min(attempt, pollDelays.length - 1)];
        attempt += 1;
        setNextAutoRetryAt(Date.now() + nextDelay);
        timeoutId = window.setTimeout(attemptResolve, nextDelay);
      }
    };

    timeoutId = window.setTimeout(attemptResolve, pollDelays[0]);
    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [activeDialpadCallId, currentContact, isCallResolving, isOnline, myDialpadSettings?.dialpad_user_id, resolveDialpadCall]);

  // ── Background reconciliation for delayed live calls ──
  useEffect(() => {
    if (
      !isOnline
      || activeDialpadCallId
      || activeDialpadCallState !== "live"
      || !currentContact
      || !myDialpadSettings?.dialpad_user_id
    ) {
      setIsRetryingUntrackedLiveCall(false);
      setNextAutoRetryAt(null);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempts = 0;
    const MAX_BACKGROUND_ATTEMPTS = 12;

    setIsRetryingUntrackedLiveCall(true);

    const retryResolve = async () => {
      try {
        setLastLinkAttemptAt(Date.now());
        setNextAutoRetryAt(null);
        const result = await resolveDialpadCall.mutateAsync({
          phone: dialNumber ?? currentContact.phone,
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          contact_id: currentContact.id,
        });

        if (cancelled) return;

        if (result.dialpad_call_id) {
          setActiveDialpadCallId(result.dialpad_call_id);
          setSyncTrackedDialpadCallId(result.dialpad_call_id);
          lastDialpadCallIdRef.current = result.dialpad_call_id;
          setActiveDialpadCallState(result.state ?? "calling");
          setIsRetryingUntrackedLiveCall(false);
          setHasTrackingRecoveryFailed(false);
          setNextAutoRetryAt(null);
          toast.success("Recovered the live Dialpad call and resumed tracking.");
          return;
        }
      } catch {
        // keep retrying quietly while the call is live
      }

      if (cancelled) return;

      attempts += 1;
      if (attempts >= MAX_BACKGROUND_ATTEMPTS) {
        setIsRetryingUntrackedLiveCall(false);
        setHasTrackingRecoveryFailed(true);
        setNextAutoRetryAt(null);
        toast.error("Dialpad tracking could not reconnect automatically. Retry linking or end the call when it is safe.");
        return;
      }

      setNextAutoRetryAt(Date.now() + 5000);
      timeoutId = window.setTimeout(retryResolve, 5000);
    };

    timeoutId = window.setTimeout(retryResolve, 5000);

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [activeDialpadCallId, activeDialpadCallState, currentContact, isOnline, myDialpadSettings?.dialpad_user_id, resolveDialpadCall]);

  // ── Realtime subscription for call state (with resilience) ──
  useEffect(() => {
    if (!isOnline || !activeDialpadCallId) {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let reconnectTimeoutId: number | null = null;

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutId !== null) {
        window.clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
    };

    const teardownChannel = () => {
      clearReconnectTimeout();
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };

    const setupChannel = () => {
      if (cancelled) return;

      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }

      const channel = supabase
        .channel(`dialpad-call-${activeDialpadCallId}-${Date.now()}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "dialpad_calls",
            filter: `dialpad_call_id=eq.${activeDialpadCallId}`,
          },
          (payload) => {
            const newRow = payload.new as { call_state?: string | null };
            const newState = newRow?.call_state;
            if (newState) {
              setActiveDialpadCallState(newState);
              if (newState === "hangup") {
                markCallAsEnded("hangup");
              }
            }
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR") {
            console.warn("[Realtime] Channel error, reconnecting in 2s");
            clearReconnectTimeout();
            reconnectTimeoutId = window.setTimeout(() => {
              reconnectTimeoutId = null;
              setupChannel();
            }, 2000);
          }
        });

      realtimeChannelRef.current = channel;
    };

    setupChannel();

    return () => {
      cancelled = true;
      teardownChannel();
    };
  }, [activeDialpadCallId, isOnline, markCallAsEnded]);

  // ── Status polling (safety fallback — fixed 15s interval, Realtime handles fast path) ──
  useEffect(() => {
    if (!isOnline || !activeDialpadCallId) return;
    let cancelled = false;
    let inFlight = false;

    const poll = async (options?: { force?: boolean }) => {
      if (cancelled || inFlight || !navigator.onLine) return;
      if (!options?.force && dialpadPollingBackoffUntil && dialpadPollingBackoffUntil > Date.now()) return;
      inFlight = true;
      try {
        const status = await fetchDialpadCallStatus(activeDialpadCallId);
        if (cancelled) return;
        setDialpadPollingBackoffUntil(null);
        setActiveDialpadCallState(status.state);
        if (status.terminal) {
          markCallAsEnded(status.state ?? "hangup");
        }
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes("rate limit")) {
          setDialpadPollingBackoffUntil(Date.now() + 10000);
        }
      } finally {
        inFlight = false;
      }
    };

    const handleOnline = () => {
      setDialpadPollingBackoffUntil(null);
      void poll({ force: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      void poll({ force: true });
    };

    // Initial poll after 3s (Realtime should beat this)
    const initialTimeout = window.setTimeout(() => {
      void poll();
    }, 3000);
    const id = window.setInterval(() => {
      void poll();
    }, 15000);

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimeout);
      window.clearInterval(id);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeDialpadCallId, dialpadPollingBackoffUntil, fetchDialpadCallStatus, isOnline, markCallAsEnded]);

  // ── Cancel / hangup ──
  const cancelActiveCall = useCallback(async () => {
    setIsEndingCall(true);
    setActiveDialpadCallState((c) => (c === "hangup" ? c : "ending"));

    try {
      if (activeDialpadCallId) {
        const result = await cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId });
        setActiveDialpadCallState(result.state ?? "ending");
        if (result.already_ended || result.terminal) {
          markCallAsEnded("hangup");
          toast.info("This call has already ended.");
          return;
        }
        toast.success(result.message || "Call cancellation requested.");
      } else if (myDialpadSettings?.dialpad_user_id && dialNumber) {
        await forceHangupCall.mutateAsync({
          dialpad_user_id: myDialpadSettings.dialpad_user_id,
          phone: dialNumber,
        });
        markCallAsEnded("hangup");
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
  }, [activeDialpadCallId, cancelDialpadCall, forceHangupCall, markCallAsEnded, myDialpadSettings, currentContact]);

  const retryDialpadCallLink = useCallback(() => {
    if (!isOnline) {
      toast.warning("You're offline. Reconnect before retrying Dialpad linking.");
      return;
    }
    if (activeDialpadCallId || !currentContact || !myDialpadSettings?.dialpad_user_id) return;
    setHasTrackingRecoveryFailed(false);
    setIsRetryingUntrackedLiveCall(false);
    setLastLinkAttemptAt(Date.now());
    setNextAutoRetryAt(null);
    setIsCallResolving(true);
    setActiveDialpadCallState("connecting");
    toast.info("Retrying Dialpad call linking now.");
  }, [activeDialpadCallId, currentContact, isOnline, myDialpadSettings?.dialpad_user_id]);

  const fireAndForgetHangup = useCallback(() => {
    if (activeDialpadCallId && activeDialpadCallState !== "hangup") {
      cancelDialpadCall.mutateAsync({ call_id: activeDialpadCallId }).catch(() => {});
    } else if (!activeDialpadCallId && !isCallTerminal && myDialpadSettings?.dialpad_user_id && dialNumber) {
      forceHangupCall.mutateAsync({
        dialpad_user_id: myDialpadSettings.dialpad_user_id,
        phone: dialNumber,
      }).catch(() => {});
    }
    setCallStartedAt(null);
    clearActiveDialRequest();
  }, [activeDialpadCallId, activeDialpadCallState, cancelDialpadCall, clearActiveDialRequest, currentContact, forceHangupCall, isCallTerminal, myDialpadSettings]);

  return {
    // Settings
    myDialpadSettings,
    callerIdOptions,
    hasDialpadAssignment,
    // Which number the dialer targets for this lead (DM direct when captured)
    dialNumber,
    isDmDirect: Boolean(dmDirect),
    // What the current/last call ACTUALLY dialled (frozen at placement)
    placedDialNumber,
    placedWasDmDirect,
    // Call state
    activeDialpadCallId,
    syncTrackedDialpadCallId,
    activeDialpadCallState: activeDialpadCallState ?? (isCallResolving ? "connecting" : null),
    isCallTerminal,
    isEndingCall,
    isCallResolving,
    isRetryingUntrackedLiveCall,
    hasTrackingRecoveryFailed,
    lastLinkAttemptAt,
    nextAutoRetryAt,
    isDialpadCallStatusPending,
    dialpadPollingBackoffUntil,
    dialpadHealth,
    callStartedAt,
    // Mutations
    dialpadCall,
    cancelDialpadCall,
    linkDialpadCallLog,
    // Actions
    cancelActiveCall,
    retryDialpadCallLink,
    fireAndForgetHangup,
    resetDialpadState,
    getDialpadCallIdForLog,
  };
}
