import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Manager-controlled locks on Playbook content.
 *
 * A new setter is only calling one or two industries in week one, and the rest
 * is noise that makes the page feel bottomless. Managers can lock anything a
 * rep does not need yet; locks are team-wide, stored as simple keys.
 *
 * Key format:
 *   industry:<Industry name>   e.g. "industry:Solar & battery"
 *   section:<section id>       e.g. "section:calls"
 *
 * Absent row = unlocked. Only admins and coaches can write (enforced by RLS),
 * so a rep cannot unlock their own content from the client.
 */

export type LockKey = string;

export const industryLockKey = (name: string): LockKey => `industry:${name}`;
export const sectionLockKey = (id: string): LockKey => `section:${id}`;

export function usePlaybookLocks() {
  return useQuery({
    queryKey: ["playbook-locks"],
    staleTime: 60_000,
    queryFn: async (): Promise<Set<LockKey>> => {
      const { data, error } = await supabase
        .from("playbook_locks")
        .select("lock_key, locked")
        .eq("locked", true);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.lock_key));
    },
  });
}

export function useSetPlaybookLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, locked }: { key: LockKey; locked: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("playbook_locks")
        .upsert(
          { lock_key: key, locked, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() },
          { onConflict: "lock_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playbook-locks"] }),
  });
}
