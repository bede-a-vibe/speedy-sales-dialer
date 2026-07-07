import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Caller ID rotation.
 *
 * Every rep can be assigned a pool of up to 8 outbound caller ID numbers.
 * The dialer rotates which one is used every 50 dials so no single number gets
 * spam-flagged as the team scales.
 *
 * Formula: pool[floor(rotation_dial_count / 50) % pool.length]
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
}

const ROTATION_INTERVAL = 50;

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
        .select("id, user_id, phone_number, label, position, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
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

  let activeNumber: string | null = null;
  let activeIndex = 0;
  if (pool.length > 0) {
    activeIndex = Math.floor(count / ROTATION_INTERVAL) % pool.length;
    activeNumber = pool[activeIndex]?.phone_number ?? null;
  }

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
    activeNumber,
    activeIndex,
    rotationCount: count,
    rotationInterval: ROTATION_INTERVAL,
    dialsUntilNext: pool.length > 1 ? ROTATION_INTERVAL - (count % ROTATION_INTERVAL) : null,
    hasPool: pool.length > 0,
    isLoading: poolQuery.isLoading || countQuery.isLoading,
    incrementCounter,
  };
}