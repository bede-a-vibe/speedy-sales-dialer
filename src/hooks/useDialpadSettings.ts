import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DialpadSettings {
  id: string;
  user_id: string;
  dialpad_user_id: string;
  dialpad_phone_number: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DialpadSettingsWithProfile extends DialpadSettings {
  display_name?: string;
  email?: string;
}

// Admin: fetch all user Dialpad assignments
export function useAllDialpadSettings() {
  return useQuery({
    queryKey: ["dialpad-settings-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dialpad_settings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch profiles for display names
      const userIds = (data as DialpadSettings[]).map((s) => s.user_id);
      if (userIds.length === 0) return [] as DialpadSettingsWithProfile[];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      return (data as DialpadSettings[]).map((s) => ({
        ...s,
        display_name: profileMap.get(s.user_id)?.display_name || undefined,
        email: profileMap.get(s.user_id)?.email || undefined,
      })) as DialpadSettingsWithProfile[];
    },
  });
}

// Current user's Dialpad config
export function useMyDialpadSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dialpad-settings-mine", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("dialpad_settings")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as DialpadSettings | null;
    },
    enabled: !!user,
  });
}

// Admin: upsert dialpad settings for a user
export function useUpsertDialpadSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      user_id: string;
      dialpad_user_id: string;
      dialpad_phone_number?: string;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("dialpad_settings")
        .upsert(
          {
            user_id: params.user_id,
            dialpad_user_id: params.dialpad_user_id,
            dialpad_phone_number: params.dialpad_phone_number || null,
            is_active: params.is_active ?? true,
          },
          { onConflict: "user_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dialpad-settings-all"] });
      qc.invalidateQueries({ queryKey: ["dialpad-settings-mine"] });
    },
  });
}

// Admin: delete dialpad settings
export function useDeleteDialpadSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("dialpad_settings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dialpad-settings-all"] });
      qc.invalidateQueries({ queryKey: ["dialpad-settings-mine"] });
    },
  });
}

// Hook to initiate a Dialpad call via the edge function
export function useDialpadLogCall() {
  return useMutation({
    mutationFn: async (params: { phone: string; dialpad_user_id?: string }) => {
      const { data, error } = await supabase.functions.invoke("dialpad", {
        body: { action: "log_call", ...params },
      });
      if (error) throw error;
      return data;
    },
  });
}
