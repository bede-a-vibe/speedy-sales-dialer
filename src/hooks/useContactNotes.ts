import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
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

export const getContactNotesQueryKey = (contactId?: string) => ["contact-notes", contactId] as const;
export const getPaginatedContactNotesQueryKey = (contactId?: string, pageSize = CONTACT_NOTES_PAGE_SIZE) => ["contact-notes-paginated", contactId, pageSize] as const;

export async function fetchContactNotes(contactId?: string) {
  if (!contactId) return [] as ContactNote[];

  const { data, error } = await supabase
    .from("contact_notes")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ContactNote[];
}

export async function prefetchContactNotes(queryClient: QueryClient, contactId?: string) {
  if (!contactId) return;

  await queryClient.prefetchQuery({
    queryKey: getContactNotesQueryKey(contactId),
    queryFn: () => fetchContactNotes(contactId),
    staleTime: 15_000,
  });
}

export function useContactNotes(contactId?: string, options: UseContactNotesOptions = {}) {
  const isEnabled = Boolean(contactId) && (options.enabled ?? true);

  return useQuery({
    queryKey: getContactNotesQueryKey(contactId),
    queryFn: () => fetchContactNotes(contactId),
    enabled: isEnabled,
    refetchInterval: isEnabled ? options.refetchInterval ?? SYNC_REFRESH_INTERVAL_MS : false,
  });
}

export function usePaginatedContactNotes(contactId?: string, pageSize = CONTACT_NOTES_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: getPaginatedContactNotesQueryKey(contactId, pageSize),
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

type AddContactNoteInput = {
  contactId: string;
  content: string;
  createdBy: string;
  source?: string;
};

/**
 * Optimistic contact-note insert.
 *
 * Prepends a temp-id row to every notes cache that the ActivityTimeline /
 * ContactDetailPage read from, then reconciles onSettled. On error the
 * previous snapshots are restored so the UI never gets stuck with a ghost.
 */
export function useAddContactNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, content, createdBy, source = "manual" }: AddContactNoteInput) => {
      const { data, error } = await supabase
        .from("contact_notes")
        .insert({ contact_id: contactId, content, created_by: createdBy, source: source as any })
        .select("*")
        .single();
      if (error) throw error;
      return data as ContactNote;
    },
    onMutate: async ({ contactId, content, createdBy, source = "manual" }) => {
      const flatKey = getContactNotesQueryKey(contactId);
      const paginatedKey = getPaginatedContactNotesQueryKey(contactId);
      const allKey = ["contact-notes-all"] as const;

      await Promise.all([
        queryClient.cancelQueries({ queryKey: flatKey }),
        queryClient.cancelQueries({ queryKey: paginatedKey }),
        queryClient.cancelQueries({ queryKey: allKey }),
      ]);

      const tempId = `optimistic-${crypto.randomUUID()}`;
      const nowIso = new Date().toISOString();
      const optimisticNote = {
        id: tempId,
        contact_id: contactId,
        content,
        created_by: createdBy,
        source,
        created_at: nowIso,
        updated_at: nowIso,
      } as unknown as ContactNote;

      const previousFlat = queryClient.getQueryData<ContactNote[]>(flatKey);
      const previousPaginated = queryClient.getQueryData<InfiniteData<ContactNotesPage>>(paginatedKey);
      const previousAll = queryClient.getQueryData<ContactNote[]>(allKey);

      if (previousFlat) {
        queryClient.setQueryData<ContactNote[]>(flatKey, [optimisticNote, ...previousFlat]);
      }
      if (previousPaginated && previousPaginated.pages.length > 0) {
        const [firstPage, ...restPages] = previousPaginated.pages;
        queryClient.setQueryData<InfiniteData<ContactNotesPage>>(paginatedKey, {
          ...previousPaginated,
          pages: [
            {
              ...firstPage,
              items: [optimisticNote, ...firstPage.items],
              totalCount: firstPage.totalCount + 1,
            },
            ...restPages,
          ],
        });
      }
      if (previousAll) {
        queryClient.setQueryData<ContactNote[]>(allKey, [optimisticNote, ...previousAll]);
      }

      return { tempId, flatKey, paginatedKey, allKey, previousFlat, previousPaginated, previousAll };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      if (context.previousFlat) queryClient.setQueryData(context.flatKey, context.previousFlat);
      if (context.previousPaginated) queryClient.setQueryData(context.paginatedKey, context.previousPaginated);
      if (context.previousAll) queryClient.setQueryData(context.allKey, context.previousAll);
    },
    onSettled: (_data, _error, { contactId }) => {
      // Precise invalidation — only the three note caches, nothing broader.
      queryClient.invalidateQueries({ queryKey: getContactNotesQueryKey(contactId) });
      queryClient.invalidateQueries({ queryKey: getPaginatedContactNotesQueryKey(contactId) });
      queryClient.invalidateQueries({ queryKey: ["contact-notes-all"] });
    },
  });
}
