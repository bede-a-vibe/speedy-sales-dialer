import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type CallLog = Tables<"call_logs">;
type CallLogWithContact = CallLog & { contacts?: Tables<"contacts"> | null };

const CONTACT_CALL_LOGS_PAGE_SIZE = 5;
const CALL_LOGS_CACHE_LIMIT = 500;
const BATCH_SIZE = 1000;

type ContactCallLogsPage = {
  items: CallLog[];
  totalCount: number;
  hasMore: boolean;
  nextPage: number;
};

export const getContactCallLogsQueryKey = (contactId?: string, pageSize = CONTACT_CALL_LOGS_PAGE_SIZE) => ["contact-call-logs", contactId, pageSize] as const;

function getLocalDayKey(date: Date = new Date()) {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);
  return localDate.toISOString().slice(0, 10);
}

function injectCallLogIntoCache(queryClient: QueryClient, callLog: CallLogWithContact) {
  queryClient.setQueryData<CallLogWithContact[]>(["call-logs"], (current = []) => {
    const next = [callLog, ...current.filter((item) => item.id !== callLog.id)];

    return next
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, CALL_LOGS_CACHE_LIMIT);
  });

  if (getLocalDayKey(new Date(callLog.created_at)) === getLocalDayKey()) {
    queryClient.setQueryData<number>(["today-call-count", callLog.user_id, getLocalDayKey()], (current = 0) => current + 1);
  }
}

async function fetchContactCallLogsPage(contactId?: string, pageSize = CONTACT_CALL_LOGS_PAGE_SIZE, pageParam = 0) {
  if (!contactId) {
    return { items: [], totalCount: 0, hasMore: false, nextPage: pageParam + 1 } satisfies ContactCallLogsPage;
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
}

export async function prefetchContactCallLogs(queryClient: QueryClient, contactId?: string, pageSize = CONTACT_CALL_LOGS_PAGE_SIZE) {
  if (!contactId) return;

  await queryClient.prefetchInfiniteQuery({
    queryKey: getContactCallLogsQueryKey(contactId, pageSize),
    queryFn: ({ pageParam }) => fetchContactCallLogsPage(contactId, pageSize, Number(pageParam ?? 0)),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextPage : undefined),
    staleTime: 15_000,
  });
}

/**
 * Weekly call logs for Team Leaderboard — server-filtered to current week (Monday–Sunday local time).
 */
export function useWeeklyCallLogs() {
  const queryClient = useQueryClient();

  const now = new Date();
  const day = now.getDay(); // 0=Sun … 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const mondayISO = monday.toISOString();
  const sundayISO = sunday.toISOString();

  useEffect(() => {
    const channel = supabase
      .channel("weekly-call-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["weekly-call-logs"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["weekly-call-logs", mondayISO.slice(0, 10)],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("id, user_id, outcome, created_at")
        .gte("created_at", mondayISO)
        .lte("created_at", sundayISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}

/**
 * Dashboard data is realtime-first, with polling as a fallback if a subscription misses an event.
 */
export function useCallLogs() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("call-logs-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["call-logs"] });
          queryClient.invalidateQueries({ queryKey: ["today-call-count"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["call-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("*, contacts(*)")
        .order("created_at", { ascending: false })
        .limit(CALL_LOGS_CACHE_LIMIT);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15_000,
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
    refetchInterval: 15_000,
  });
}

export function useContactCallLogs(contactId?: string, pageSize = CONTACT_CALL_LOGS_PAGE_SIZE, enabled = true) {
  return useInfiniteQuery({
    queryKey: getContactCallLogsQueryKey(contactId, pageSize),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchContactCallLogsPage(contactId, pageSize, Number(pageParam ?? 0)),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextPage : undefined),
    enabled: !!contactId && enabled,
    refetchInterval: contactId && enabled ? 15_000 : false,
  });
}

/**
 * Batched fetching — loops in 1000-row pages to avoid Supabase's silent 1000-row cap.
 */
export function useCallLogsByDateRange(from?: string, to?: string) {
  return useQuery({
    queryKey: ["call-logs-range", from, to],
    queryFn: async () => {
      const allRows: any[] = [];
      let page = 0;

      while (true) {
        const rangeFrom = page * BATCH_SIZE;
        const rangeTo = rangeFrom + BATCH_SIZE - 1;

        let query = supabase
          .from("call_logs")
          .select("*, contacts(business_name, industry)")
          .order("created_at", { ascending: false })
          .range(rangeFrom, rangeTo);

        if (from) query = query.gte("created_at", from);
        if (to) query = query.lte("created_at", `${to}T23:59:59`);

        const { data, error } = await query;
        if (error) throw error;

        const rows = data ?? [];
        allRows.push(...rows);

        if (rows.length < BATCH_SIZE) break;
        page++;
      }

      return allRows;
    },
    enabled: true,
    refetchInterval: 60_000,
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
        .order("follow_up_date", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60_000,
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
        .select("*")
        .single();
      if (error) throw error;
      return data as CallLogWithContact;
    },
    onSuccess: (createdLog) => {
      injectCallLogIntoCache(queryClient, createdLog);
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
      queryClient.invalidateQueries({ queryKey: ["call-logs-range"] });
      queryClient.invalidateQueries({ queryKey: ["follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["contact-call-logs"] });
      queryClient.invalidateQueries({ queryKey: ["today-call-count"] });
    },
    onError: (error) => {
      console.error("[useCreateCallLog] Failed to save call log:", error);
    },
  });
}
