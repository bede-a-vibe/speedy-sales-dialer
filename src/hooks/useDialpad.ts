import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface DialpadCallParams {
  phone: string;
  dialpad_user_id?: string;
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
