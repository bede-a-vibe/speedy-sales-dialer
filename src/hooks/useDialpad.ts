import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

interface DialpadCallParams {
  phone: string;
  dialpad_user_id?: string;
  contact_id?: string;
  caller_id?: string;
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
  call_resolved: boolean;
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
    call_resolved: payload.call_resolved !== false, // default true for backwards compat
    tracking_warning: typeof payload.tracking_warning === "string" ? payload.tracking_warning : null,
    message: typeof payload.message === "string" ? payload.message : null,
    details: payload.details,
  };
}

// supabase-js hides every non-2xx behind "Edge Function returned a non-2xx status code".
// The dialpad function always answers with { error, message, status_code, details }, and
// that body is the only thing that says WHY (Dialpad 429, DND stuck, bad number, 5xx).
// Without it the toast is useless and the 409/429 retry matching below never fires.
async function readFunctionErrorBody(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  const response = error.context as Response | undefined;
  if (!response || typeof response.text !== "function") return null;
  try {
    const raw = await response.text();
    if (!raw.trim()) return `Dialpad function returned ${response.status}`;
    let body: Record<string, unknown> | null = null;
    try { body = JSON.parse(raw) as Record<string, unknown>; } catch { body = null; }
    if (!body) return `Dialpad function returned ${response.status}: ${raw.slice(0, 200)}`;
    const headline = typeof body.error === "string" && body.error.trim() ? body.error.trim() : null;
    const detail = typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;
    const status = typeof body.status_code === "number" ? body.status_code : response.status;
    const parts = [headline ?? `Dialpad function returned ${status}`];
    if (!headline?.includes(`[${status}]`) && !String(headline).includes(String(status))) parts[0] += ` [${status}]`;
    if (detail && detail !== headline) parts.push(detail);
    return parts.join(": ");
  } catch {
    return `Dialpad function returned ${response.status}`;
  }
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
    const detailed = await readFunctionErrorBody(error);
    throw new Error(detailed ?? getDialpadErrorMessage(error, fallbackMessage));
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

interface ResolveDialpadCallParams {
  phone: string;
  dialpad_user_id: string;
  contact_id?: string;
}

interface ForceHangupParams {
  dialpad_user_id: string;
  phone: string;
}

export function useForceHangupCall() {
  return useMutation({
    mutationFn: async (params: ForceHangupParams) => invokeDialpadAction(
      { action: "force_hangup", ...params },
      "Unable to force hangup the active call.",
    ),
  });
}

export function useResolveDialpadCall() {
  return useMutation({
    mutationFn: async (params: ResolveDialpadCallParams) => invokeDialpadAction(
      { action: "resolve_call", ...params },
      "Unable to resolve Dialpad call.",
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

export interface DialpadCallerIdOption {
  number: string;
  label: string;
}

export function useDialpadCallerIds(dialpadUserId: string | undefined) {
  return useQuery({
    queryKey: ["dialpad-caller-ids", dialpadUserId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("dialpad", {
        body: { action: "get_caller_ids", dialpad_user_id: dialpadUserId },
      });
      if (error) throw error;
      return (data?.numbers ?? []) as DialpadCallerIdOption[];
    },
    enabled: !!dialpadUserId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
