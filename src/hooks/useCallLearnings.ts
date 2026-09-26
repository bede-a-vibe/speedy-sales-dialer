import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCoachedCalls, type CoachingJson, STAGE_LABELS, SKILL_TAG_LABELS, PILLAR_ORDER } from "@/hooks/useCallCoaching";

/** A line a rep actually said on a call that booked. */
export interface WinningLine {
  line: string;
  businessName: string;
  skillTag: string | null;
  calledAt: string | null;
}

/** A real call that went sideways, paired with the better path the coach suggested. */
export interface RealDrill {
  id: string;
  businessName: string;
  outcome: string | null;
  skillTag: string | null;
  brokenStage: string | null;
  whatHappened: string;
  keyMoment: string;
  betterPath: string;
  drill: string;
  calledAt: string | null;
}

export interface StageLeak {
  stage: string;
  label: string;
  count: number;
  share: number;
}

export interface PillarAverage {
  pillar: string;
  average: number;
  samples: number;
}

/**
 * Everything the training pages show is derived here from real coached calls —
 * no hand-written example content. One shared query keeps the tabs cheap.
 */
export function useCallLearnings() {
  const coached = useCoachedCalls();

  const learnings = useMemo(() => {
    const calls = coached.data ?? [];

    const winningLines: WinningLine[] = [];
    const drills: RealDrill[] = [];
    const stageCounts = new Map<string, number>();
    const skillCounts = new Map<string, number>();
    const pillarTotals = new Map<string, { sum: number; n: number }>();

    for (const call of calls) {
      const c: CoachingJson = call.coaching ?? {};
      const booked = call.outcome === "booked";

      if (booked) {
        for (const line of c.example_lines ?? []) {
          const text = String(line ?? "").trim();
          if (text.length > 15) {
            winningLines.push({
              line: text,
              businessName: call.businessName,
              skillTag: c.skill_tag ?? null,
              calledAt: call.calledAt,
            });
          }
        }
        if (c.key_moment && c.key_moment.trim().length > 20) {
          winningLines.push({
            line: c.key_moment.trim(),
            businessName: call.businessName,
            skillTag: c.skill_tag ?? null,
            calledAt: call.calledAt,
          });
        }
      }

      if (!booked && c.better_path && c.what_happened) {
        drills.push({
          id: call.id,
          businessName: call.businessName,
          outcome: call.outcome,
          skillTag: c.skill_tag ?? null,
          brokenStage: c.first_broken_stage ?? null,
          whatHappened: c.what_happened,
          keyMoment: c.key_moment ?? "",
          betterPath: c.better_path,
          drill: c.drill ?? "",
          calledAt: call.calledAt,
        });
      }

      const stage = c.first_broken_stage;
      if (stage && stage !== "none") stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
      if (c.skill_tag) skillCounts.set(c.skill_tag, (skillCounts.get(c.skill_tag) ?? 0) + 1);

      for (const [pillar, score] of Object.entries(c.pillar_scores ?? {})) {
        if (typeof score !== "number") continue;
        const acc = pillarTotals.get(pillar) ?? { sum: 0, n: 0 };
        acc.sum += score;
        acc.n += 1;
        pillarTotals.set(pillar, acc);
      }
    }

    const stageTotal = [...stageCounts.values()].reduce((a, b) => a + b, 0);
    const stageLeaks: StageLeak[] = [...stageCounts.entries()]
      .map(([stage, count]) => ({
        stage,
        label: STAGE_LABELS[stage] ?? stage,
        count,
        share: stageTotal > 0 ? Math.round((count / stageTotal) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const skillLeaks = [...skillCounts.entries()]
      .map(([tag, count]) => ({ tag, label: SKILL_TAG_LABELS[tag] ?? tag, count }))
      .sort((a, b) => b.count - a.count);

    const pillarAverages: PillarAverage[] = PILLAR_ORDER.map((pillar) => {
      const acc = pillarTotals.get(pillar);
      return {
        pillar,
        average: acc && acc.n > 0 ? Math.round((acc.sum / acc.n) * 10) / 10 : 0,
        samples: acc?.n ?? 0,
      };
    });

    // Newest first, and never show the same line twice.
    const seen = new Set<string>();
    const dedupedLines = winningLines.filter((l) => {
      const key = l.line.toLowerCase().slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      callsAnalysed: calls.length,
      bookedAnalysed: calls.filter((c) => c.outcome === "booked").length,
      winningLines: dedupedLines,
      drills,
      stageLeaks,
      skillLeaks,
      pillarAverages,
    };
  }, [coached.data]);

  return { ...learnings, isLoading: coached.isLoading, error: coached.error };
}

export interface BankObjection {
  id: string;
  objectionText: string;
  category: string;
  source: string;
  timesSeen: number;
  bookedCount: number;
  responses: Array<{ response: string; source?: string }>;
}

/** Live objection bank — framework plays plus objections mined from transcripts. */
export function useObjectionBank() {
  return useQuery({
    queryKey: ["objection-bank"],
    staleTime: 60_000,
    queryFn: async (): Promise<BankObjection[]> => {
      const { data, error } = await supabase
        .from("objection_bank")
        .select("id, objection_text, category, example_responses, source, times_seen, booked_count")
        .neq("objection_text", "(no objection raised)")
        .order("times_seen", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        objectionText: r.objection_text,
        category: r.category,
        source: r.source,
        timesSeen: r.times_seen ?? 0,
        bookedCount: r.booked_count ?? 0,
        responses: Array.isArray(r.example_responses) ? r.example_responses : [],
      }));
    },
  });
}
