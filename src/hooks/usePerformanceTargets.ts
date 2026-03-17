import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  PerformanceTargetMetricKey,
  PerformanceTargetPeriodType,
  PerformanceTargetRecord,
  PerformanceTargetScopeType,
} from "@/lib/performanceTargets";

interface PerformanceTargetsTableClient {
  from: (table: string) => any;
}

export interface PerformanceTargetSaveInput {
  id?: string;
  scope_type: PerformanceTargetScopeType;
  period_type: PerformanceTargetPeriodType;
  metric_key: PerformanceTargetMetricKey;
  user_id: string | null;
  target_value: number;
}

const performanceTargetsDb = supabase as unknown as PerformanceTargetsTableClient;

function performanceTargetsTable() {
  return performanceTargetsDb.from("performance_targets");
}

export function usePerformanceTargets() {
  return useQuery({
    queryKey: ["performance-targets"],
    queryFn: async () => {
      const { data, error } = await performanceTargetsTable()
        .select("*")
        .order("scope_type", { ascending: true })
        .order("period_type", { ascending: true })
        .order("metric_key", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as PerformanceTargetRecord[];
    },
  });
}

export function useUpsertPerformanceTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: PerformanceTargetSaveInput) => {
      const normalizedPayload = {
        scope_type: payload.scope_type,
        period_type: payload.period_type,
        metric_key: payload.metric_key,
        user_id: payload.scope_type === "team" ? null : payload.user_id,
        target_value: Number(payload.target_value),
      };

      if (payload.id) {
        const { data, error } = await performanceTargetsTable()
          .update(normalizedPayload)
          .eq("id", payload.id)
          .select("*")
          .single();

        if (error) throw error;
        return data as PerformanceTargetRecord;
      }

      let lookupQuery = performanceTargetsTable()
        .select("id")
        .eq("scope_type", normalizedPayload.scope_type)
        .eq("period_type", normalizedPayload.period_type)
        .eq("metric_key", normalizedPayload.metric_key)
        .limit(1);

      lookupQuery = normalizedPayload.scope_type === "team"
        ? lookupQuery.is("user_id", null)
        : lookupQuery.eq("user_id", normalizedPayload.user_id);

      const { data: existingTarget, error: existingTargetError } = await lookupQuery.maybeSingle();
      if (existingTargetError) throw existingTargetError;

      if (existingTarget?.id) {
        const { data, error } = await performanceTargetsTable()
          .update(normalizedPayload)
          .eq("id", existingTarget.id)
          .select("*")
          .single();

        if (error) throw error;
        return data as PerformanceTargetRecord;
      }

      const { data, error } = await performanceTargetsTable()
        .insert(normalizedPayload)
        .select("*")
        .single();

      if (error) throw error;
      return data as PerformanceTargetRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance-targets"] });
    },
  });
}

export function useDeletePerformanceTarget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await performanceTargetsTable().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["performance-targets"] });
    },
  });
}
