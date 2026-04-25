import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, ShieldCheck, UserRound, GraduationCap, Phone, Clock } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  last_sign_in_at?: string | null;
}

interface RoleRow {
  user_id: string;
  role: AppRole;
}

interface UserWithRoles extends ProfileRow {
  roles: AppRole[];
}

const ROLE_META: Record<AppRole, { label: string; description: string; icon: typeof ShieldCheck; tone: string }> = {
  admin: {
    label: "Admin",
    description: "Full access — can manage users, contacts, targets, GHL sync.",
    icon: ShieldCheck,
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  sales_rep: {
    label: "Sales Rep",
    description: "Standard rep — dial, log calls, manage own pipeline.",
    icon: Phone,
    tone: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  coach: {
    label: "Coach",
    description: "Read-only demo mode — sees everything, writes nothing.",
    icon: GraduationCap,
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
};

const ROLE_ORDER: AppRole[] = ["admin", "coach", "sales_rep"];

export default function RolesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<
    | { kind: "grant" | "revoke"; userId: string; userLabel: string; role: AppRole }
    | null
  >(null);

  const usersQuery = useQuery<UserWithRoles[]>({
    queryKey: ["admin-users-with-roles"],
    staleTime: 15_000,
    queryFn: async () => {
      const [usersRes, rolesRes] = await Promise.all([
        supabase.rpc("admin_list_users_with_last_login"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (usersRes.error) throw usersRes.error;
      if (rolesRes.error) throw rolesRes.error;
      const rolesByUser = new Map<string, AppRole[]>();
      for (const row of (rolesRes.data ?? []) as RoleRow[]) {
        const arr = rolesByUser.get(row.user_id) ?? [];
        arr.push(row.role);
        rolesByUser.set(row.user_id, arr);
      }
      return ((usersRes.data ?? []) as ProfileRow[]).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.user_id) ?? [],
      }));
    },
  });

  const grantRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(`Granted ${ROLE_META[vars.role].label}`);
      queryClient.invalidateQueries({ queryKey: ["admin-users-with-roles"] });
      queryClient.invalidateQueries({ queryKey: ["user-role"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to grant role";
      toast.error(message);
    },
  });

  const revokeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(`Removed ${ROLE_META[vars.role].label}`);
      queryClient.invalidateQueries({ queryKey: ["admin-users-with-roles"] });
      queryClient.invalidateQueries({ queryKey: ["user-role"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to revoke role";
      toast.error(message);
    },
  });

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = usersQuery.data ?? [];
    if (!term) return list;
    return list.filter((u) => {
      const name = (u.display_name ?? "").toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [usersQuery.data, search]);

  const totals = useMemo(() => {
    const counts: Record<AppRole, number> = { admin: 0, sales_rep: 0, coach: 0 };
    for (const u of usersQuery.data ?? []) {
      for (const r of u.roles) counts[r] = (counts[r] ?? 0) + 1;
    }
    return counts;
  }, [usersQuery.data]);

  const isMutating = grantRole.isPending || revokeRole.isPending;

  return (
    <AppLayout title="User Roles">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ROLE_ORDER.map((role) => {
            const meta = ROLE_META[role];
            const Icon = meta.icon;
            return (
              <div key={role} className={`rounded-lg border p-4 ${meta.tone}`}>
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-widest">
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 text-2xl font-bold">{totals[role] ?? 0}</p>
                <p className="mt-1 text-xs opacity-80">{meta.description}</p>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Current Roles</TableHead>
                <TableHead className="text-right">Manage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.isLoading && (
                <>
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <TableRow key={`skeleton-${idx}`}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-40 ml-auto" /></TableCell>
                    </TableRow>
                  ))}
                </>
              )}
              {!usersQuery.isLoading && filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    No users match that search.
                  </TableCell>
                </TableRow>
              )}
              {filteredUsers.map((u) => {
                const isSelf = user?.id === u.user_id;
                const userLabel = u.display_name?.trim() || u.email || "Unknown";
                return (
                  <TableRow key={u.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{userLabel}</span>
                        {isSelf && (
                          <Badge variant="outline" className="text-[10px]">You</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      {u.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((r) => (
                            <Badge key={r} variant="outline" className={`text-[10px] ${ROLE_META[r].tone}`}>
                              {ROLE_META[r].label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {ROLE_ORDER.map((role) => {
                          const has = u.roles.includes(role);
                          const isLastAdmin =
                            role === "admin" && has && (totals.admin ?? 0) <= 1;
                          const blockSelfDemote =
                            role === "admin" && has && isSelf;
                          const disabled = isMutating || isLastAdmin || blockSelfDemote;
                          return (
                            <Button
                              key={role}
                              size="sm"
                              variant={has ? "secondary" : "outline"}
                              disabled={disabled}
                              title={
                                isLastAdmin
                                  ? "Cannot remove the last admin"
                                  : blockSelfDemote
                                    ? "Cannot remove your own admin role"
                                    : undefined
                              }
                              onClick={() =>
                                setConfirm({
                                  kind: has ? "revoke" : "grant",
                                  userId: u.user_id,
                                  userLabel,
                                  role,
                                })
                              }
                            >
                              {isMutating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : has ? (
                                `Remove ${ROLE_META[role].label}`
                              ) : (
                                `+ ${ROLE_META[role].label}`
                              )}
                            </Button>
                          );
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Roles are evaluated by the database on every request. A user can hold
          multiple roles simultaneously (e.g. admin + sales_rep). Admin and Coach
          unlock admin-section visibility; Coach also activates demo mode (no
          writes).
        </p>
      </div>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "grant"
                ? `Grant ${confirm ? ROLE_META[confirm.role].label : ""} role?`
                : `Remove ${confirm ? ROLE_META[confirm.role].label : ""} role?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "grant"
                ? `${confirm?.userLabel} will gain: ${confirm ? ROLE_META[confirm.role].description : ""}`
                : `${confirm?.userLabel} will lose access associated with the ${confirm ? ROLE_META[confirm.role].label : ""} role.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirm) return;
                const args = { userId: confirm.userId, role: confirm.role };
                if (confirm.kind === "grant") grantRole.mutate(args);
                else revokeRole.mutate(args);
                setConfirm(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}