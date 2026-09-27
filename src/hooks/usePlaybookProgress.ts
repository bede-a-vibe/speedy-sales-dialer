import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-rep "I've worked through this" state for Playbook modules, stored in
 * training_progress under playbook:<sectionId>. Reps manage their own rows
 * (RLS); managers can read everyone's for the progress view.
 */
export const playbookStepKey = (sectionId: string) => `playbook:${sectionId}`;

export function useMyPlaybookProgress() {
  return useQuery({
    queryKey: ["playbook-progress", "me"],
    staleTime: 30_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return new Set();
      const { data, error } = await supabase
        .from("training_progress")
        .select("step_key")
        .eq("user_id", auth.user.id)
        .like("step_key", "playbook:%");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.step_key.replace(/^playbook:/, "")));
    },
  });
}

/** Everyone's playbook progress — managers only in practice (RLS). */
export function useTeamPlaybookProgress() {
  return useQuery({
    queryKey: ["playbook-progress", "team"],
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, Set<string>>> => {
      const { data, error } = await supabase
        .from("training_progress")
        .select("user_id, step_key, completed_at")
        .like("step_key", "playbook:%");
      if (error) throw error;
      const m = new Map<string, Set<string>>();
      for (const r of data ?? []) {
        const set = m.get(r.user_id) ?? new Set<string>();
        set.add(r.step_key.replace(/^playbook:/, ""));
        m.set(r.user_id, set);
      }
      return m;
    },
  });
}

export function useSetPlaybookProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sectionId, done }: { sectionId: string; done: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not signed in");
      const key = playbookStepKey(sectionId);
      if (done) {
        const { error } = await supabase
          .from("training_progress")
          .upsert({ user_id: auth.user.id, step_key: key }, { onConflict: "user_id,step_key" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("training_progress")
          .delete()
          .eq("user_id", auth.user.id)
          .eq("step_key", key);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playbook-progress"] }),
  });
}
