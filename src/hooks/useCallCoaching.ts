import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Shape produced by the coach_calls AI pass — all fields optional, render defensively. */
export interface CoachingJson {
  summary?: string;
  key_moment?: string;
  what_happened?: string;
  better_path?: string;
  example_lines?: string[];
  skill_tag?: string;
  went_well?: string;
  drill?: string;
  first_broken_stage?: string;
  pillar_scores?: Record<string, number | null>;
  stream?: string;
  stream_mismatch?: boolean;
}

/** Lead streams — grading severity scales with intent (cold lenient → re-engagement strictest). */
export const STREAM_LABELS: Record<string, string> = {
  cold_first_touch: "Cold first touch",
  cold_follow_up: "Cold follow-up",
  inbound_ad: "Inbound ad lead",
  cold_email: "Cold email reply",
  re_engagement: "Re-engagement",
};

export const STAGE_LABELS: Record<string, string> = {
  opener: "Opener",
  resistance: "First-minute resistance",
  discovery: "Discovery",
  problem_awareness: "Problem awareness",
  gap_build: "Gap build",
  ask: "The ask",
  objections: "Objections",
  none: "Clean call",
};

/** Pillars in Matt Ryder's priority order — fix top-first. */
export const PILLAR_ORDER = ["tonality", "command_of_call", "probing", "word_economy", "objection_handling"] as const;

export const PILLAR_LABELS: Record<string, string> = {
  tonality: "Tonality",
  command_of_call: "Command",
  probing: "Probing",
  word_economy: "Word economy",
  objection_handling: "Objections",
};

export interface CoachedCall {
  id: string;
  callLogId: string;
  userId: string;
  outcome: string | null;
  coaching: CoachingJson;
  createdAt: string;
  businessName: string;
  calledAt: string | null;
}

export interface FocusArea {
  area?: string;
  skill_tag?: string;
  evidence?: string;
  better_path?: string;
  drill?: string;
}

export interface RepCoachingProfile {
  userId: string;
  focusAreas: FocusArea[];
  strengths: { area?: string; evidence?: string }[];
  callsAnalyzed: number;
  updatedAt: string;
}

export const SKILL_TAG_LABELS: Record<string, string> = {
  opening: "Opening",
  discovery: "Discovery",
  objection_handling: "Objections",
  gatekeeper: "Gatekeeper",
  closing_ask: "Closing ask",
  follow_up_setup: "Follow-up setup",
  tonality_pace: "Tonality & pace",
};

export function useCoachedCalls() {
  return useQuery({
    queryKey: ["call-coaching"],
    staleTime: 60_000,
    queryFn: async (): Promise<CoachedCall[]> => {
      const { data, error } = await supabase
        .from("call_coaching")
        .select("id, call_log_id, user_id, outcome, coaching, created_at, contact:contacts(business_name), call_log:call_logs(created_at)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        callLogId: r.call_log_id,
        userId: r.user_id,
        outcome: r.outcome,
        coaching: (r.coaching ?? {}) as CoachingJson,
        createdAt: r.created_at,
        businessName: r.contact?.business_name ?? "Unknown business",
        calledAt: r.call_log?.created_at ?? null,
      }));
    },
  });
}

export function useRepCoachingProfiles() {
  return useQuery({
    queryKey: ["rep-coaching-profiles"],
    staleTime: 60_000,
    queryFn: async (): Promise<RepCoachingProfile[]> => {
      const { data, error } = await supabase
        .from("rep_coaching_profile")
        .select("user_id, focus_areas, strengths, calls_analyzed, updated_at");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        userId: r.user_id,
        focusAreas: Array.isArray(r.focus_areas) ? r.focus_areas : [],
        strengths: Array.isArray(r.strengths) ? r.strengths : [],
        callsAnalyzed: r.calls_analyzed ?? 0,
        updatedAt: r.updated_at,
      }));
    },
  });
}
