import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";

export type CallOpener = Tables<"call_openers">;

const KEY = ["call-openers"] as const;

export function useCallOpeners(includeInactive = false) {
  return useQuery({
    queryKey: [...KEY, includeInactive],
    queryFn: async () => {
      let q = supabase.from("call_openers").select("*").order("name", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CallOpener[];
    },
    staleTime: 60_000,
  });
}

export function useCreateCallOpener() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { name: string; script: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("call_openers")
        .insert([{ name: input.name, script: input.script, created_by: user.id }])
        .select("*")
        .single();
      if (error) throw error;
      return data as CallOpener;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCallOpener() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; script?: string; is_active?: boolean }) => {
      const { id, ...rest } = input;
      const { data, error } = await supabase
        .from("call_openers")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as CallOpener;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCallOpener() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("call_openers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
