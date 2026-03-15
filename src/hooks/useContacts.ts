import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Contact = Tables<"contacts">;

export function useContacts(industry?: string) {
  return useQuery({
    queryKey: ["contacts", industry],
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("*")
        .eq("is_dnc", false)
        .order("created_at", { ascending: true });

      if (industry && industry !== "all") {
        query = query.eq("industry", industry);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Contact[];
    },
  });
}

export function useAllContacts(industry?: string) {
  return useQuery({
    queryKey: ["all-contacts", industry],
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: true });

      if (industry && industry !== "all") {
        query = query.eq("industry", industry);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Contact[];
    },
  });
}

export function useUncalledContacts(industry?: string) {
  return useQuery({
    queryKey: ["uncalled-contacts", industry],
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("*")
        .eq("status", "uncalled")
        .eq("is_dnc", false)
        .order("created_at", { ascending: true });

      if (industry && industry !== "all") {
        query = query.eq("industry", industry);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Contact[];
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Contact> & { id: string }) => {
      const { error } = await supabase.from("contacts").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["all-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["uncalled-contacts"] });
    },
  });
}
