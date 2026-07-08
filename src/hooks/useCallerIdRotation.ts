import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { deriveLeadAreaCode, AREA_CODE_TO_REGION_LABEL, type AuAreaCode } from "@/lib/callingCompliance";

/**
 * Caller ID rotation.
 *
 * Every rep can be assigned a pool of up to 8 outbound caller ID numbers.
 * The dialer rotates which one is used every 40 dials so no single number
 * gets spam-flagged as the team scales.
 *
 * LOCAL PRESENCE: when the CURRENT lead has a derivable AU area code, we
 * prefer to rotate among owned pool numbers that MATCH that area code
 * (lifts pickup rates). Fall back to full-pool rotation only when no
 * matching owned number exists.
 *
 * COMPLIANCE: only numbers that are `is_active AND owned_attested` are
 * eligible for rotation — no blank / unattested CLI.
 *
 * Formula (per candidate subset):
 *   subset[floor(rotation_dial_count / 40) % subset.length]
 *
 * If the pool is empty this hook returns `activeNumber = null` and the dialer
 * falls back to its existing single-number behaviour (`selectedCallerId` /
 * `dialpad_phone_number`). This keeps the system fully inert until numbers
 * are added by an admin.
 */

export interface CallerIdPoolEntry {
  id: string;
  user_id: string;
  phone_number: string;
  label: string | null;
  position: number;
  is_active: boolean;
  area_code: string | null;
  region: string | null;
  owned_attested: boolean;
  attested_at: string | null;
}

const ROTATION_INTERVAL = 40;

export type CallerIdSelectionReason = "local" | "rotation" | "fallback";

export interface CallerIdSelection {
  number: string | null;
  entry: CallerIdPoolEntry | null;
  reason: CallerIdSelectionReason;
  areaCode: AuAreaCode | null;
  regionLabel: string | null;
  poolSubsetSize: number;
  activeIndex: number;
}

export function useCallerIdRotation(userId: string | undefined) {
  const qc = useQueryClient();

  const poolQuery = useQuery({
    queryKey: ["caller-id-pool", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) return [] as CallerIdPoolEntry[];
      const { data, error } = await supabase
        .from("caller_id_pool")
        .select("id, user_id, phone_number, label, position, is_active, area_code, region, owned_attested, attested_at")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("owned_attested", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CallerIdPoolEntry[];
    },
  });

  const countQuery = useQuery({
    queryKey: ["caller-id-rotation-count", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!userId) return 0;
      const { data, error } = await supabase
        .from("dialpad_settings")
        .select("rotation_dial_count")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.rotation_dial_count ?? 0);
    },
  });

  const pool = poolQuery.data ?? [];
  const count = countQuery.data ?? 0;

  // Default (no-lead) selection: rotate across the full attested pool.
  const defaultSelection: CallerIdSelection = (() => {
    if (pool.length === 0) {
      return { number: null, entry: null, reason: "fallback", areaCode: null, regionLabel: null, poolSubsetSize: 0, activeIndex: 0 };
    }
    const idx = Math.floor(count / ROTATION_INTERVAL) % pool.length;
    return {
      number: pool[idx]?.phone_number ?? null,
      entry: pool[idx] ?? null,
      reason: "rotation",
      areaCode: (pool[idx]?.area_code ?? null) as AuAreaCode | null,
      regionLabel: pool[idx]?.region ?? null,
      poolSubsetSize: pool.length,
      activeIndex: idx,
    };
  })();

  /**
   * Pick a caller ID for a SPECIFIC lead — prefer local-presence match.
   * Contact shape is intentionally loose (dialer passes the raw Contact).
   */
  const pickForContact = useCallback((contact: {
    phone?: string | null;
    phone_e164?: string | null;
    state?: string | null;
  } | null | undefined): CallerIdSelection => {
    if (pool.length === 0) return defaultSelection;
    const leadAreaCode = contact ? deriveLeadAreaCode(contact) : null;
    if (leadAreaCode) {
      const local = pool.filter((p) => p.area_code === leadAreaCode);
      if (local.length > 0) {
        const idx = Math.floor(count / ROTATION_INTERVAL) % local.length;
        return {
          number: local[idx].phone_number,
          entry: local[idx],
          reason: "local",
          areaCode: leadAreaCode,
          regionLabel: AREA_CODE_TO_REGION_LABEL[leadAreaCode] ?? local[idx].region ?? null,
          poolSubsetSize: local.length,
          activeIndex: idx,
        };
      }
    }
    return defaultSelection;
  }, [pool, count, defaultSelection]);

  const incrementCounter = useCallback(async () => {
    if (!userId) return;
    try {
      // Fire-and-forget: never block the dialer on this.
      const { data } = await supabase.rpc("increment_rotation_dial_count", {
        _user_id: userId,
      });
      if (typeof data === "number") {
        qc.setQueryData(["caller-id-rotation-count", userId], data);
      } else {
        qc.invalidateQueries({ queryKey: ["caller-id-rotation-count", userId] });
      }
    } catch {
      // Silent — rotation counter is non-critical.
    }
  }, [userId, qc]);

  return {
    pool,
    poolSize: pool.length,
    activeNumber: defaultSelection.number,
    activeIndex: defaultSelection.activeIndex,
    defaultSelection,
    pickForContact,
    rotationCount: count,
    rotationInterval: ROTATION_INTERVAL,
    dialsUntilNext: pool.length > 1 ? ROTATION_INTERVAL - (count % ROTATION_INTERVAL) : null,
    hasPool: pool.length > 0,
    isLoading: poolQuery.isLoading || countQuery.isLoading,
    incrementCounter,
  };
}