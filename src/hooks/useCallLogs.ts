import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CallLog = Tables<"call_logs">;

const SYNC_REFRESH_INTERVAL_MS = 15000;
const CONTACT_CALL_LOGS_PAGE_SIZE = 5;

type ContactCallLogsPage = {
  items: CallLog[];
  totalCount: number;
  hasMore: boolean;
  nextPage: number;
};

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
    refetchInterval: SYNC_REFRESH_INTERVAL_MS,
  });
}

export function useTodayCallCount(userId?: string) {
  const today = new Date();
  const startOfDay = new Date(today);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  return useQuery({
    queryKey: ["today-call-count", userId, startOfDay.toISOString().slice(0, 10)],
    queryFn: async () => {
      if (!userId) return 0;

      const { count, error } = await supabase
        .from("call_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfDay.toISOString())
        .lte("created_at", endOfDay.toISOString());

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
    refetchInterval: SYNC_REFRESH_INTERVAL_MS,
  });
}

export function useContactCallLogs(contactId?: string, pageSize = CONTACT_CALL_LOGS_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: ["contact-call-logs", contactId, pageSize],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!contactId) {
        return {
          items: [],
          totalCount: 0,
          hasMore: false,
          nextPage: pageParam + 1,
        } satisfies ContactCallLogsPage;
      }

      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from("call_logs")
        .select("*", { count: "exact" })
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const items = (data ?? []) as CallLog[];
      const totalCount = count ?? items.length;

      return {
        items,
        totalCount,
        hasMore: from + items.length < totalCount,
        nextPage: pageParam + 1,
      } satisfies ContactCallLogsPage;
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextPage : undefined),
    enabled: !!contactId,
    refetchInterval: contactId ? SYNC_REFRESH_INTERVAL_MS : false,
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
    refetchInterval: SYNC_REFRESH_INTERVAL_MS,
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
    refetchInterval: SYNC_REFRESH_INTERVAL_MS,
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
      dialpad_call_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("call_logs")
        .insert([log])
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
      queryClient.invalidateQueries({ queryKey: ["call-logs-range"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["contact-call-logs"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
    },
  });
}
