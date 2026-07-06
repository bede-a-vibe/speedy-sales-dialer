import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SmartList = {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  created_by: string | null;
  is_shared: boolean;
  created_at: string;
};

const SMART_LISTS_KEY = ["smart-lists"] as const;

export function useSmartLists() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: SMART_LISTS_KEY,
    queryFn: async (): Promise<SmartList[]> => {
      const { data, error } = await supabase
        .from("smart_lists" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SmartList[];
    },
  });

  const create = useMutation({
    mutationFn: async ({ name, filters }: { name: string; filters: Record<string, unknown> }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");
      const { data, error } = await supabase
        .from("smart_lists" as never)
        .insert({ name, filters, created_by: uid, is_shared: true } as never)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as SmartList;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SMART_LISTS_KEY }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("smart_lists" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SMART_LISTS_KEY }),
  });

  return {
    smartLists: list.data ?? [],
    isLoading: list.isLoading,
    createSmartList: create.mutateAsync,
    deleteSmartList: remove.mutateAsync,
  };
}