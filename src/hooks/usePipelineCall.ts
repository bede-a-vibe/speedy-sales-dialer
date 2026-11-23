import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { CallLead, ContactCallDockHandle, ServerPlacement } from "@/components/contacts/ContactCallDock";
import type { NativeCallState } from "@/components/dialer/NativeCallBar";
import { useDialpadCall } from "@/hooks/useDialpad";
import { useMyDialpadSettings } from "@/hooks/useDialpadSettings";

const isLive = (s: NativeCallState) => s === "dialing" || s === "ringing" || s === "connected";

/**
 * Calling from the Pipelines page: one call bar (state, timer, Hang Up) for the
 * whole page, whichever lead on the list is being rung.
 */
export function usePipelineCall() {
  const dockRef = useRef<ContactCallDockHandle | null>(null);
  const queryClient = useQueryClient();
  const dialpadCall = useDialpadCall();
  const { data: settings } = useMyDialpadSettings();
  const dialpadUserId = settings?.dialpad_user_id ?? null;
  const [state, setState] = useState<NativeCallState>("idle");
  const [audioHere, setAudioHere] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const live = isLive(state);
  const carriesAudio = live && audioHere;

  const onStateChange = useCallback((next: NativeCallState, carries: boolean) => {
    setState(next);
    setAudioHere(carries);
    // So the row says it has been called.
    if (next === "ended") void queryClient.invalidateQueries({ queryKey: ["todo", "last-calls"] });
  }, [queryClient]);

  const placeViaServer = async (phone: string, leadId: string): Promise<ServerPlacement> => {
    if (!dialpadUserId) throw new Error("Connect your Dialpad number in Dialpad Settings first.");
    const res = await dialpadCall.mutateAsync({ phone, dialpad_user_id: dialpadUserId, contact_id: leadId });
    return { callId: res.dialpad_call_id ?? null, state: res.state ?? null };
  };

  const place = useCallback(async (phone: string, lead: CallLead) => {
    if (!dockRef.current) {
      toast.error("The phone is still loading. Try again.");
      return;
    }
    setContactId(lead.contactId);
    await dockRef.current.placeCall(phone, lead);
  }, []);

  // The audio runs in this page, so following a link to another page drops the
  // call. (Closing or reloading the tab is guarded by the call bar itself.)
  useEffect(() => {
    if (!carriesAudio) return;
    const guard = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (link.origin !== window.location.origin || link.pathname === window.location.pathname) return;
      if (window.confirm("You're on a call through this page. Leaving will drop it. Leave anyway?")) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [carriesAudio]);

  return { dockRef, dialpadUserId, live, carriesAudio, contactId, onStateChange, placeViaServer, place };
}

export type PipelineCall = ReturnType<typeof usePipelineCall>;
