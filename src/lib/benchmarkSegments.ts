/**
 * Custom multi-filter benchmark segments for the Custom Monitor.
 *
 * A "segment" is a saved combination of contact filters (the same vocabulary
 * the dialer uses) that becomes one row in the Custom Monitor's Segments
 * mode. Segments are either private (localStorage, per-user) or team-shared
 * (the `benchmark_segments` Supabase table).
 *
 * Matching happens entirely client-side against the joined `contacts` row
 * already loaded for the Custom Monitor — no extra metric queries.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentFilters = {
  states?: string[];
  industries?: string[];
  tradeTypes?: string[];
  workType?: string | null;
  businessSize?: string | null;
  prospectTier?: string | null;
  buyingSignalStrength?: string | null;
  phoneType?: string | null;
  hasGoogleAds?: string | null;
  hasFacebookAds?: string | null;
  hasDmPhone?: "yes" | "no" | null;
  minGbpRating?: number | null;
  minReviewCount?: number | null;
};

export type Segment = {
  id: string;
  name: string;
  color?: string | null;
  filters: SegmentFilters;
  shared: boolean;
  createdBy?: string | null;
  createdAt?: string;
};

export type SegmentInput = Omit<Segment, "id" | "createdBy" | "createdAt">;

type ContactSlice = {
  industry?: string | null;
  trade_type?: string | null;
  state?: string | null;
  business_size?: string | null;
  work_type?: string | null;
  prospect_tier?: string | null;
  buying_signal_strength?: string | null;
  phone_type?: string | null;
  has_google_ads?: string | null;
  has_facebook_ads?: string | null;
  dm_phone?: string | null;
  gbp_rating?: number | null;
  review_count?: number | null;
};

type RowWithContact = { contacts?: ContactSlice | null };

// ─────────────────────────────────────────────────────────────────────────────
// Matcher predicates
// ─────────────────────────────────────────────────────────────────────────────

function matchString(field: string | null | undefined, expected: string | null | undefined) {
  if (!expected || expected === "all") return true;
  return (field ?? "").toLowerCase() === expected.toLowerCase();
}

function matchAnyString(field: string | null | undefined, expectedList: string[] | undefined) {
  if (!expectedList || expectedList.length === 0) return true;
  const f = (field ?? "").toLowerCase();
  return expectedList.some((v) => v.toLowerCase() === f);
}

/**
 * Returns true if a row's joined contacts row matches every constraint in the
 * segment. Empty/null filter fields are treated as "no constraint".
 */
export function matchSegment(row: RowWithContact, segment: Segment): boolean {
  const c = row.contacts ?? {};
  const f = segment.filters ?? {};

  if (f.states && f.states.length > 0) {
    const state = (c.state ?? "").toUpperCase();
    const expected = f.states.map((s) => s.toUpperCase());
    if (!expected.includes(state)) return false;
  }

  // Industry / Trade — match either field against either bucket of values.
  // Treats `industries` and `tradeTypes` as a combined OR pool, mirroring
  // how the dialer's RPC normalizes between them.
  const industryPool: string[] = [];
  if (f.industries && f.industries.length > 0) industryPool.push(...f.industries);
  if (f.tradeTypes && f.tradeTypes.length > 0) industryPool.push(...f.tradeTypes);
  if (industryPool.length > 0) {
    const pool = industryPool.map((v) => v.toLowerCase());
    const ind = (c.industry ?? "").toLowerCase();
    const trade = (c.trade_type ?? "").toLowerCase();
    if (!pool.includes(ind) && !pool.includes(trade)) return false;
  }

  if (!matchString(c.work_type, f.workType)) return false;
  if (!matchString(c.business_size, f.businessSize)) return false;
  if (!matchString(c.prospect_tier, f.prospectTier)) return false;
  if (!matchString(c.buying_signal_strength, f.buyingSignalStrength)) return false;
  if (!matchString(c.phone_type, f.phoneType)) return false;
  if (!matchString(c.has_google_ads, f.hasGoogleAds)) return false;
  if (!matchString(c.has_facebook_ads, f.hasFacebookAds)) return false;

  if (f.hasDmPhone === "yes") {
    if (!c.dm_phone || c.dm_phone.trim() === "") return false;
  } else if (f.hasDmPhone === "no") {
    if (c.dm_phone && c.dm_phone.trim() !== "") return false;
  }

  if (typeof f.minGbpRating === "number" && f.minGbpRating > 0) {
    if ((c.gbp_rating ?? 0) < f.minGbpRating) return false;
  }
  if (typeof f.minReviewCount === "number" && f.minReviewCount > 0) {
    if ((c.review_count ?? 0) < f.minReviewCount) return false;
  }

  return true;
}

/** Convenience aliases so callers can spell out their intent. */
export const matchSegmentForCallLog = matchSegment;
export const matchSegmentForBooking = matchSegment;

// ─────────────────────────────────────────────────────────────────────────────
// Filter summary (used as the row subtitle)
// ─────────────────────────────────────────────────────────────────────────────

function joinList(list?: string[] | null): string | null {
  if (!list || list.length === 0) return null;
  if (list.length <= 2) return list.join(", ");
  return `${list.slice(0, 2).join(", ")} +${list.length - 2}`;
}

export function summarizeSegmentFilters(segment: Segment): string {
  const f = segment.filters ?? {};
  const parts: string[] = [];

  const states = joinList(f.states);
  if (states) parts.push(states);

  const industryPool: string[] = [];
  if (f.tradeTypes) industryPool.push(...f.tradeTypes);
  if (f.industries) industryPool.push(...f.industries);
  const industries = joinList(industryPool);
  if (industries) parts.push(industries);

  if (f.workType && f.workType !== "all") parts.push(f.workType);
  if (f.businessSize && f.businessSize !== "all") parts.push(f.businessSize);
  if (f.prospectTier && f.prospectTier !== "all") parts.push(f.prospectTier);
  if (f.buyingSignalStrength && f.buyingSignalStrength !== "all") parts.push(`${f.buyingSignalStrength} signal`);
  if (f.phoneType && f.phoneType !== "all") {
    const label = f.phoneType.charAt(0).toUpperCase() + f.phoneType.slice(1);
    parts.push(label);
  }
  if (f.hasGoogleAds && f.hasGoogleAds !== "all") parts.push(`Google: ${f.hasGoogleAds}`);
  if (f.hasFacebookAds && f.hasFacebookAds !== "all") parts.push(`FB: ${f.hasFacebookAds}`);
  if (f.hasDmPhone === "yes") parts.push("Has DM phone");
  if (f.hasDmPhone === "no") parts.push("No DM phone");
  if (typeof f.minGbpRating === "number" && f.minGbpRating > 0) parts.push(`${f.minGbpRating}+ stars`);
  if (typeof f.minReviewCount === "number" && f.minReviewCount > 0) parts.push(`${f.minReviewCount}+ reviews`);

  if (parts.length === 0) return "All contacts";
  return parts.join(" · ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Match-count query (for the editor footer + segment row size column)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count contacts in the database matching a segment's filters. Used by the
 * editor dialog to show "X contacts match these filters" live, and by the
 * segment row to show the overall pool size.
 */
export async function countContactsForSegment(filters: SegmentFilters): Promise<number> {
  let query = supabase.from("contacts").select("id", { head: true, count: "exact" });

  if (filters.states && filters.states.length > 0) {
    query = query.in("state", filters.states);
  }

  // Industry / trade — apply only if at least one bucket has values.
  const industryPool: string[] = [];
  if (filters.industries && filters.industries.length > 0) industryPool.push(...filters.industries);
  if (filters.tradeTypes && filters.tradeTypes.length > 0) industryPool.push(...filters.tradeTypes);
  if (industryPool.length > 0) {
    // Match either the industry or trade_type column (Supabase OR filter).
    const escaped = industryPool.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",");
    query = query.or(`industry.in.(${escaped}),trade_type.in.(${escaped})`);
  }

  if (filters.workType && filters.workType !== "all") query = query.eq("work_type", filters.workType);
  if (filters.businessSize && filters.businessSize !== "all") query = query.eq("business_size", filters.businessSize);
  if (filters.prospectTier && filters.prospectTier !== "all") query = query.eq("prospect_tier", filters.prospectTier);
  if (filters.buyingSignalStrength && filters.buyingSignalStrength !== "all") query = query.eq("buying_signal_strength", filters.buyingSignalStrength);
  if (filters.phoneType && filters.phoneType !== "all") query = query.eq("phone_type", filters.phoneType);
  if (filters.hasGoogleAds && filters.hasGoogleAds !== "all") query = query.eq("has_google_ads", filters.hasGoogleAds);
  if (filters.hasFacebookAds && filters.hasFacebookAds !== "all") query = query.eq("has_facebook_ads", filters.hasFacebookAds);

  if (filters.hasDmPhone === "yes") {
    query = query.not("dm_phone", "is", null).not("dm_phone", "eq", "");
  } else if (filters.hasDmPhone === "no") {
    query = query.or("dm_phone.is.null,dm_phone.eq.");
  }

  if (typeof filters.minGbpRating === "number" && filters.minGbpRating > 0) {
    query = query.gte("gbp_rating", filters.minGbpRating);
  }
  if (typeof filters.minReviewCount === "number" && filters.minReviewCount > 0) {
    query = query.gte("review_count", filters.minReviewCount);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage: localStorage (private) + Supabase (team), merged
// ─────────────────────────────────────────────────────────────────────────────

function privateStorageKey(userId?: string) {
  return `funnel:benchmark-segments:${userId ?? "anon"}:v1`;
}

function readPrivateSegments(userId?: string): Segment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(privateStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s === "object" && typeof s.id === "string")
      .map((s) => ({ ...s, shared: false } as Segment));
  } catch {
    return [];
  }
}

function writePrivateSegments(userId: string | undefined, segments: Segment[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      privateStorageKey(userId),
      JSON.stringify(segments.map((s) => ({ ...s, shared: false }))),
    );
  } catch {
    // ignore quota
  }
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  return `seg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type TeamRow = {
  id: string;
  name: string;
  color: string | null;
  filters: SegmentFilters;
  created_by: string;
  created_at: string;
};

function teamRowToSegment(row: TeamRow): Segment {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    filters: (row.filters ?? {}) as SegmentFilters,
    shared: true,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const TEAM_QUERY_KEY = ["benchmark-segments", "team"] as const;

/**
 * Returns the merged list of team-shared + private segments, plus mutators.
 * Team segments are sorted first (everyone benefits), then private.
 */
export function useSegmentsStore() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  const [privateSegments, setPrivateSegments] = useState<Segment[]>(() => readPrivateSegments(userId));

  // Re-load private list when user changes (login / logout).
  useEffect(() => {
    setPrivateSegments(readPrivateSegments(userId));
  }, [userId]);

  // Persist private list whenever it changes.
  useEffect(() => {
    writePrivateSegments(userId, privateSegments);
  }, [userId, privateSegments]);

  const teamQuery = useQuery({
    queryKey: TEAM_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("benchmark_segments")
        .select("id, name, color, filters, created_by, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => teamRowToSegment(r as unknown as TeamRow));
    },
    staleTime: 60_000,
  });

  const teamSegments = teamQuery.data ?? [];

  const segments = useMemo<Segment[]>(() => {
    return [...teamSegments, ...privateSegments];
  }, [teamSegments, privateSegments]);

  const refetchTeam = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY });
  }, [queryClient]);

  const create = useCallback(
    async (input: SegmentInput): Promise<Segment> => {
      if (input.shared) {
        if (!userId) throw new Error("Sign in to share segments with the team");
        const { data, error } = await supabase
          .from("benchmark_segments")
          .insert({
            name: input.name,
            color: input.color ?? null,
            filters: (input.filters ?? {}) as never,
            created_by: userId,
          })
          .select("id, name, color, filters, created_by, created_at")
          .single();
        if (error) throw error;
        const created = teamRowToSegment(data as unknown as TeamRow);
        refetchTeam();
        return created;
      }

      const created: Segment = {
        id: genId(),
        name: input.name,
        color: input.color ?? null,
        filters: input.filters ?? {},
        shared: false,
        createdBy: userId ?? null,
        createdAt: new Date().toISOString(),
      };
      setPrivateSegments((prev) => [created, ...prev]);
      return created;
    },
    [userId, refetchTeam],
  );

  const update = useCallback(
    async (id: string, input: SegmentInput): Promise<Segment> => {
      const existing = segments.find((s) => s.id === id);
      if (!existing) throw new Error("Segment not found");

      // Sharing toggled — promote/demote between localStorage and Supabase.
      if (existing.shared !== input.shared) {
        if (input.shared) {
          if (!userId) throw new Error("Sign in to share segments with the team");
          const { data, error } = await supabase
            .from("benchmark_segments")
            .insert({
              name: input.name,
              color: input.color ?? null,
              filters: (input.filters ?? {}) as never,
              created_by: userId,
            })
            .select("id, name, color, filters, created_by, created_at")
            .single();
          if (error) throw error;
          // Remove from local
          setPrivateSegments((prev) => prev.filter((s) => s.id !== id));
          refetchTeam();
          return teamRowToSegment(data as unknown as TeamRow);
        }

        // Demote: delete the team row, save to local
        const { error } = await supabase.from("benchmark_segments").delete().eq("id", id);
        if (error) throw error;
        const demoted: Segment = {
          id: genId(),
          name: input.name,
          color: input.color ?? null,
          filters: input.filters ?? {},
          shared: false,
          createdBy: userId ?? null,
          createdAt: new Date().toISOString(),
        };
        setPrivateSegments((prev) => [demoted, ...prev]);
        refetchTeam();
        return demoted;
      }

      // Same sharing scope — update in place.
      if (input.shared) {
        const { data, error } = await supabase
          .from("benchmark_segments")
          .update({
            name: input.name,
            color: input.color ?? null,
            filters: (input.filters ?? {}) as never,
          })
          .eq("id", id)
          .select("id, name, color, filters, created_by, created_at")
          .single();
        if (error) throw error;
        refetchTeam();
        return teamRowToSegment(data as unknown as TeamRow);
      }

      const updated: Segment = {
        ...existing,
        name: input.name,
        color: input.color ?? null,
        filters: input.filters ?? {},
      };
      setPrivateSegments((prev) => prev.map((s) => (s.id === id ? updated : s)));
      return updated;
    },
    [segments, userId, refetchTeam],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      const existing = segments.find((s) => s.id === id);
      if (!existing) return;
      if (existing.shared) {
        const { error } = await supabase.from("benchmark_segments").delete().eq("id", id);
        if (error) throw error;
        refetchTeam();
        return;
      }
      setPrivateSegments((prev) => prev.filter((s) => s.id !== id));
    },
    [segments, refetchTeam],
  );

  /** True if the current user can edit/delete the given segment. */
  const canEdit = useCallback(
    (segment: Segment): boolean => {
      if (!segment.shared) return true; // private segments are always yours
      if (!userId) return false;
      // Admin check happens server-side in RLS; client just shows the affordance.
      return segment.createdBy === userId;
    },
    [userId],
  );

  return {
    segments,
    teamSegments,
    privateSegments,
    isLoading: teamQuery.isLoading,
    create,
    update,
    remove,
    canEdit,
  };
}
