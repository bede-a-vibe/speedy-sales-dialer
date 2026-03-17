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

export function useDialpadCall() {
  return useMutation({
    mutationFn: async (params: DialpadCallParams) => {
      const { data, error } = await supabase.functions.invoke("dialpad", {
        body: { action: "initiate_call", ...params },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useDialpadCallStatus() {
  return useMutation({
    mutationFn: async (callId: string) => {
      const { data, error } = await supabase.functions.invoke("dialpad", {
        body: { action: "get_call_status", call_id: callId },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useCancelDialpadCall() {
  return useMutation({
    mutationFn: async ({ call_id }: CancelDialpadCallParams) => {
      const { data, error } = await supabase.functions.invoke("dialpad", {
        body: { action: "hangup_call", call_id },
      });
      if (error) throw error;
      return data;
    },
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
