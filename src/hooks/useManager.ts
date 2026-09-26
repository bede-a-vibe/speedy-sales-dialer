import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RepProfile { user_id: string; name: string }

export function useRepProfiles() {
  return useQuery({
    queryKey: ["manager-rep-profiles"],
    staleTime: 300_000,
    queryFn: async (): Promise<RepProfile[]> => {
      const { data, error } = await supabase.from("profiles").select("user_id, display_name, email, is_active").eq("is_active", true);
      if (error) throw error;
      return (data ?? [])
        .map((p) => ({ user_id: p.user_id, name: p.display_name || p.email?.split("@")[0] || "Unknown" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export interface ReviewableCall {
  id: string; user_id: string; outcome: string; created_at: string;
  talk: number | null; transcript: string | null; summary: string | null; notes: string | null;
  business: string | null;
}

export interface CallReview {
  id: string; call_log_id: string; rep_user_id: string; reviewer_id: string;
  score: number; went_well: string | null; improve: string | null; created_at: string; seen_at?: string | null; stage_problem_solution?: boolean | null; stage_solution_commit?: boolean | null;
}

/** Calls worth a manager's ear from the last 14 days: booked or a real conversation (60s+). */
export function useReviewQueue() {
  return useQuery({
    queryKey: ["review-queue"],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const [calls, reviews] = await Promise.all([
        supabase.from("call_logs")
          .select("id, user_id, outcome, created_at, dialpad_talk_time_seconds, dialpad_transcript, dialpad_summary, notes, contacts(business_name)")
          .gte("created_at", since)
          .or("outcome.eq.booked,dialpad_talk_time_seconds.gte.60")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("call_reviews").select("*").gte("created_at", new Date(Date.now() - 60 * 86_400_000).toISOString()),
      ]);
      if (calls.error) throw calls.error;
      if (reviews.error) throw reviews.error;
      const list: ReviewableCall[] = (calls.data ?? []).map((c: any) => ({
        id: c.id, user_id: c.user_id, outcome: c.outcome, created_at: c.created_at,
        talk: c.dialpad_talk_time_seconds, transcript: c.dialpad_transcript, summary: c.dialpad_summary,
        notes: c.notes, business: c.contacts?.business_name ?? null,
      }));
      return { calls: list, reviews: (reviews.data ?? []) as CallReview[] };
    },
  });
}

export function useSaveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { call_log_id: string; rep_user_id: string; score: number; went_well: string; improve: string; stage_problem_solution?: boolean | null; stage_solution_commit?: boolean | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("call_reviews").upsert(
        { ...r, reviewer_id: auth.user!.id, seen_at: null },
        { onConflict: "call_log_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      qc.invalidateQueries({ queryKey: ["my-call-reviews"] });
      qc.invalidateQueries({ queryKey: ["kpi-scorecard"] });
    },
  });
}

/** Number of manager reviews the signed-in rep hasn't opened yet. */
export function useUnseenReviewCount() {
  return useQuery({
    queryKey: ["unseen-reviews"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return 0;
      const { count } = await supabase.from("call_reviews").select("id", { count: "exact", head: true })
        .eq("rep_user_id", auth.user.id).is("seen_at", null);
      return count ?? 0;
    },
  });
}

export function useMarkReviewsSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => { await supabase.rpc("mark_my_reviews_seen"); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unseen-reviews"] }),
  });
}

export function useMyReviews(userId?: string) {
  return useQuery({
    queryKey: ["my-call-reviews", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_reviews")
        .select("*, call_logs(created_at, outcome, dialpad_talk_time_seconds, contacts(business_name))")
        .eq("rep_user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface OneOnOne { id: string; rep_user_id: string; manager_id: string; meeting_date: string; notes: string | null; action_items: string | null }

export function useOneOnOnes(repId?: string) {
  return useQuery({
    queryKey: ["one-on-ones", repId],
    enabled: !!repId,
    queryFn: async () => {
      const { data, error } = await supabase.from("manager_one_on_ones").select("*").eq("rep_user_id", repId!).order("meeting_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OneOnOne[];
    },
  });
}

export function useSaveOneOnOne() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: { rep_user_id: string; meeting_date: string; notes: string; action_items: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("manager_one_on_ones").insert({ ...r, manager_id: auth.user!.id });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["one-on-ones", v.rep_user_id] }),
  });
}

export function useRoleplayRounds() {
  return useQuery({
    queryKey: ["manager-roleplay-rounds"],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { data, error } = await supabase.from("roleplay_rounds")
        .select("user_id, mode, persona, level, passed, failed_milestone, created_at")
        .gte("created_at", since).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
