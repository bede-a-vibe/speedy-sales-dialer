import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CallLog = Tables<"call_logs">;

export function useCallLogs() {
  return useQuery({
    queryKey: ["call-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("*, contacts(*)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useCallLogsByDateRange(from?: string, to?: string) {
  return useQuery({
    queryKey: ["call-logs-range", from, to],
    queryFn: async () => {
      let query = supabase
        .from("call_logs")
        .select("*, contacts(business_name, industry)")
        .order("created_at", { ascending: false });

      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", `${to}T23:59:59`);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: true,
  });
}

export function useFollowUps() {
  return useQuery({
    queryKey: ["follow-ups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("*, contacts(*)")
        .eq("outcome", "follow_up")
        .not("follow_up_date", "is", null)
        .order("follow_up_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCallLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (log: {
      contact_id: string;
      user_id: string;
      outcome: "no_answer" | "voicemail" | "not_interested" | "dnc" | "follow_up" | "booked" | "wrong_number";
      notes?: string;
      follow_up_date?: string | null;
    }) => {
      const { error } = await supabase.from("call_logs").insert([log]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
      queryClient.invalidateQueries({ queryKey: ["call-logs-range"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
    },
  });
}
