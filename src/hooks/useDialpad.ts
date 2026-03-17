import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DialpadCallParams {
  phone: string;
  dialpad_user_id?: string;
  contact_id?: string;
}

interface LinkDialpadCallLogParams {
  dialpad_call_id: string;
  call_log_id: string;
}

interface CancelDialpadCallParams {
  call_id: string;
}

export interface DialpadActionResponse {
  ok: boolean;
  action?: string;
  state: string | null;
  terminal: boolean;
  already_ended: boolean;
  dialpad_call_id: string | null;
  tracking_warning?: string | null;
  message?: string | null;
  details?: unknown;
}

function normalizeDialpadResponse(data: unknown): DialpadActionResponse {
  const payload = typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
  const state = typeof payload.state === "string" ? payload.state.toLowerCase() : null;
  const dialpadCallId = typeof payload.dialpad_call_id === "string"
    ? payload.dialpad_call_id
    : typeof payload.call_id === "string"
      ? payload.call_id
      : typeof payload.call_id === "number"
        ? String(payload.call_id)
        : null;

  return {
    ok: payload.ok === false ? false : true,
    action: typeof payload.action === "string" ? payload.action : undefined,
    state,
    terminal: payload.terminal === true || state === "hangup",
    already_ended: payload.already_ended === true,
    dialpad_call_id: dialpadCallId,
    tracking_warning: typeof payload.tracking_warning === "string" ? payload.tracking_warning : null,
    message: typeof payload.message === "string" ? payload.message : null,
    details: payload.details,
  };
}

function getDialpadErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return fallback;
}

async function invokeDialpadAction(body: Record<string, unknown>, fallbackMessage: string) {
  const { data, error } = await supabase.functions.invoke("dialpad", { body });

  if (error) {
    throw new Error(getDialpadErrorMessage(error, fallbackMessage));
  }

  const response = normalizeDialpadResponse(data);
  if (!response.ok) {
    throw new Error(response.message || fallbackMessage);
  }

  return response;
}

export function useDialpadCall() {
  return useMutation({
    mutationFn: async (params: DialpadCallParams) => invokeDialpadAction(
      { action: "initiate_call", ...params },
      "Unable to place Dialpad call.",
    ),
  });
}

export function useDialpadCallStatus() {
  return useMutation({
    mutationFn: async (callId: string) => invokeDialpadAction(
      { action: "get_call_status", call_id: callId },
      "Unable to fetch Dialpad call status.",
    ),
    retry: false,
  });
}

export function useCancelDialpadCall() {
  return useMutation({
    mutationFn: async ({ call_id }: CancelDialpadCallParams) => invokeDialpadAction(
      { action: "hangup_call", call_id },
      "Unable to cancel the active call.",
    ),
  });
}

export function useLinkDialpadCallLog() {
  return useMutation({
    mutationFn: async ({ dialpad_call_id, call_log_id }: LinkDialpadCallLogParams) => {
      const { error } = await supabase
        .from("dialpad_calls")
        .update({ call_log_id })
        .eq("dialpad_call_id", dialpad_call_id);

      if (error) throw error;
    },
  });
}
