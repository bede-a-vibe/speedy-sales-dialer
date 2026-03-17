import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ContactNote = Tables<"contact_notes">;

const SYNC_REFRESH_INTERVAL_MS = 15000;
const CONTACT_NOTES_PAGE_SIZE = 5;

type ContactNotesPage = {
  items: ContactNote[];
  totalCount: number;
  hasMore: boolean;
  nextPage: number;
};

type UseContactNotesOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

export function useContactNotes(contactId?: string, options: UseContactNotesOptions = {}) {
  const isEnabled = Boolean(contactId) && (options.enabled ?? true);

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
    enabled: isEnabled,
    refetchInterval: isEnabled ? options.refetchInterval ?? SYNC_REFRESH_INTERVAL_MS : false,
  });
}

export function usePaginatedContactNotes(contactId?: string, pageSize = CONTACT_NOTES_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: ["contact-notes-paginated", contactId, pageSize],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!contactId) {
        return {
          items: [],
          totalCount: 0,
          hasMore: false,
          nextPage: pageParam + 1,
        } satisfies ContactNotesPage;
      }

      const from = pageParam * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await supabase
        .from("contact_notes")
        .select("*", { count: "exact" })
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const items = (data ?? []) as ContactNote[];
      const totalCount = count ?? items.length;

      return {
        items,
        totalCount,
        hasMore: from + items.length < totalCount,
        nextPage: pageParam + 1,
      } satisfies ContactNotesPage;
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextPage : undefined),
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
