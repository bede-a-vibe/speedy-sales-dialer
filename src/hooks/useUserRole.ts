import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useUserRole() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["user-role", user?.id],
    staleTime: 30_000,
    queryFn: async () => {
      if (!user) return [] as string[];
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (error) throw error;
      return data?.map((r) => r.role) || [];
    },
    enabled: !!user,
  });
}

export function useAdminAccess() {
  const roleQuery = useUserRole();
  const roles = roleQuery.data ?? [];

  return {
    ...roleQuery,
    roles,
    isAdmin: roles.includes("admin"),
    isCoach: roles.includes("coach"),
    canViewAdmin: roles.includes("admin") || roles.includes("coach"),
    canWrite: roles.includes("admin") || (!roles.includes("coach")),
    isDemoMode: roles.includes("coach") && !roles.includes("admin"),
  };
}

export function useIsAdmin() {
  return useAdminAccess().isAdmin;
}

export function useIsCoach() {
  return useAdminAccess().isCoach;
}

export function useCanViewAdmin() {
  return useAdminAccess().canViewAdmin;
}

export function useIsDemoMode() {
  return useAdminAccess().isDemoMode;
}
