import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ContactNote = Tables<"contact_notes">;

const SYNC_REFRESH_INTERVAL_MS = 15000;

export function useContactNotes(contactId?: string) {
  return useQuery({
    queryKey: ["contact-notes", contactId],
    queryFn: async () => {
      if (!contactId) return [] as ContactNote[];

      const { data, error } = await supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ContactNote[];
    },
    enabled: !!contactId,
    refetchInterval: contactId ? SYNC_REFRESH_INTERVAL_MS : false,
  });
}

export function useAllContactNotes() {
  return useQuery({
    queryKey: ["contact-notes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_notes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ContactNote[];
    },
    refetchInterval: SYNC_REFRESH_INTERVAL_MS,
  });
}
