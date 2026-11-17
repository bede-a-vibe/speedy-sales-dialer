import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Info, KeyRound, MoreHorizontal, Search, UserMinus, UserPlus, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useAdminAccess } from "@/hooks/useUserRole";
import { useRepMeetingStats, useTeamMembers, useUpdateGhlUser } from "@/hooks/useMeetings";
import { AddLoginDialog, LoginLinkDialog, useLoginLink, type LoginLinkResult } from "@/components/team/LoginLinks";
import {
  attentionItems,
  buildDirectory,
  lastSignInLabel,
  ROLE_HINT,
  ROLE_LABEL,
  ROLE_ORDER,
  type AppRole,
  type DirectoryPerson,
} from "@/lib/teamDirectory";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<AppRole, string> = {
  admin: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  sales_rep: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  coach: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

const FATHOM_LABEL = { connected: "Connected", problem: "Problem", not_connected: "Not connected" } as const;

/**
 * Team & settings > People. Everyone who takes meetings or can log in, in one
 * table: access, last sign-in, meeting numbers, Fathom, Dialpad, and an
 * actions menu (roles, login links, move to former).
 */
export function PeopleDirectory() {
  const { user } = useAuth();
  const { isAdmin } = useAdminAccess();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [formerOpen, setFormerOpen] = useState(false);
  const [addFor, setAddFor] = useState<{ email: string; name: string } | null>(null);
  const [linkResult, setLinkResult] = useState<LoginLinkResult | null>(null);
  const [confirmFormer, setConfirmFormer] = useState<DirectoryPerson | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [from] = useState(() => new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10));
  const { data: members = [], isLoading } = useTeamMembers();
  const { data: stats = [] } = useRepMeetingStats(from, today, true);
  const extras = useQuery({
    queryKey: ["team-directory-extras", isAdmin],
    staleTime: 15_000,
    queryFn: async () => {
      const [logins, roles, fathom] = await Promise.all([
        isAdmin ? supabase.rpc("admin_list_users_with_last_login") : Promise.resolve({ data: [], error: null }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("fathom_connections").select("user_id, status, last_synced_at"),
      ]);
      if (logins.error) throw logins.error;
      if (roles.error) throw roles.error;
      return {
        logins: (logins.data ?? []) as { user_id: string; email: string | null; display_name: string | null; last_sign_in_at: string | null }[],
        roles: (roles.data ?? []) as { user_id: string; role: AppRole }[],
        fathom: (fathom.data ?? []) as { user_id: string; status: string | null; last_synced_at: string | null }[],
      };
    },
  });

  const people = useMemo(
    () => buildDirectory(members, extras.data?.logins ?? [], extras.data?.roles ?? [], extras.data?.fathom ?? [], stats),
    [members, extras.data, stats],
  );
  const term = search.trim().toLowerCase();
  const matches = (p: DirectoryPerson) => !term || p.name.toLowerCase().includes(term) || (p.email ?? "").toLowerCase().includes(term);
  const active = people.filter((p) => p.isActive && matches(p));
  const former = people.filter((p) => !p.isActive && matches(p));
  const attention = isAdmin ? attentionItems(people) : [];
  const adminCount = people.filter((p) => p.isActive && p.roles.includes("admin")).length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["team-directory-extras"] });
    queryClient.invalidateQueries({ queryKey: ["team-members"] });
    queryClient.invalidateQueries({ queryKey: ["rep-meeting-stats"] });
    queryClient.invalidateQueries({ queryKey: ["user-role"] });
  };

  const setRole = useMutation({
    mutationFn: async ({ userId, role, on }: { userId: string; role: AppRole; on: boolean }) => {
      const { error } = on
        ? await supabase.from("user_roles").insert({ user_id: userId, role })
        : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) throw error;
    },
    onSuccess: (_d, v) => toast.success(`${v.on ? "Added" : "Removed"} ${ROLE_LABEL[v.role]}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not change the role"),
    onSettled: refresh,
  });

  const setActive = useMutation({
    mutationFn: async ({ person, active }: { person: DirectoryPerson; active: boolean }) => {
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>)(
        "admin_set_person_active",
        { _user_id: person.userId, _ghl_user_id: person.ghlUserId, _active: active },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => toast.success(v.active ? `${v.person.name} restored` : `${v.person.name} moved to former team members`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update that person"),
    onSettled: refresh,
  });

  const updateGhlUser = useUpdateGhlUser();
  const toggleDialpad = (p: DirectoryPerson, on: boolean) => {
    if (!p.ghlUserId) return;
    updateGhlUser.mutate(
      { ghlUserId: p.ghlUserId, patch: { needs_dialpad: on } },
      { onSettled: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }), onError: () => toast.error("Could not update Dialpad") },
    );
  };

  const loginLink = useLoginLink();
  const makeResetLink = (p: DirectoryPerson) => {
    if (!p.userId) return;
    loginLink.mutate(
      { action: "reset_link", user_id: p.userId },
      { onSuccess: setLinkResult, onError: (e) => toast.error(e instanceof Error ? e.message : "Could not make the link") },
    );
  };

  const renderRow = (p: DirectoryPerson, muted = false) => {
    const isSelf = !!user && p.userId === user.id;
    return (
      <TableRow key={p.key} className={cn(muted && "opacity-60")}>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-medium">{p.name}</span>
            {isSelf ? <Badge variant="outline" className="text-[10px]">You</Badge> : null}
          </div>
          <div className="text-xs text-muted-foreground">{p.email ?? "No email"}</div>
        </TableCell>
        <TableCell>
          {!p.hasLogin ? (
            <span className="text-xs text-muted-foreground" title="No dialer login: an admin records their outcomes">No login</span>
          ) : p.roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">No access</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {p.roles.map((r) => (
                <Badge key={r} variant="outline" className={cn("text-[10px]", ROLE_TONE[r])} title={ROLE_HINT[r]}>
                  {ROLE_LABEL[r]}
                </Badge>
              ))}
            </div>
          )}
        </TableCell>
        {isAdmin ? (
          <TableCell className="whitespace-nowrap text-sm text-muted-foreground" title={p.lastSignInAt ?? undefined}>
            {p.hasLogin ? lastSignInLabel(p.lastSignInAt) : "-"}
          </TableCell>
        ) : null}
        <TableCell className="text-right tabular-nums">{p.meetings || "-"}</TableCell>
        <TableCell className="text-right tabular-nums">
          {p.unrecorded ? <span className="text-amber-600 dark:text-amber-400">{p.unrecorded}</span> : "-"}
        </TableCell>
        <TableCell className="text-right tabular-nums">{p.showRatePct != null ? `${p.showRatePct}%` : "-"}</TableCell>
        <TableCell className="whitespace-nowrap text-xs">
          {p.fathom == null ? (
            <span className="text-muted-foreground">-</span>
          ) : (
            <span className={cn(p.fathom === "connected" ? "text-emerald-700 dark:text-emerald-300" : p.fathom === "problem" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
              {FATHOM_LABEL[p.fathom]}
            </span>
          )}
        </TableCell>
        <TableCell className="text-center">
          {p.inGhl ? (
            <Switch
              checked={p.needsDialpad || p.hasDialpadSeat}
              disabled={!isAdmin || muted || p.hasDialpadSeat}
              onCheckedChange={(on) => toggleDialpad(p, on)}
              aria-label={`Dialpad seat for ${p.name}`}
              title={p.hasDialpadSeat ? "Has an active Dialpad seat (manage on the Dialpad tab)" : "Flag that they need a Dialpad seat"}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{p.hasDialpadSeat ? "Seat" : "-"}</span>
          )}
        </TableCell>
        {isAdmin ? (
          <TableCell className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Actions for ${p.name}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {p.isActive && p.hasLogin && p.userId ? (
                  <>
                    <DropdownMenuLabel>Access</DropdownMenuLabel>
                    {ROLE_ORDER.map((r) => {
                      const has = p.roles.includes(r);
                      const locked = r === "admin" && has && (isSelf || adminCount <= 1);
                      return (
                        <DropdownMenuCheckboxItem
                          key={r}
                          checked={has}
                          disabled={locked || setRole.isPending}
                          onCheckedChange={(on) => setRole.mutate({ userId: p.userId!, role: r, on: !!on })}
                          onSelect={(e) => e.preventDefault()}
                        >
                          <div>
                            <div>{ROLE_LABEL[r]}</div>
                            <div className="text-[11px] text-muted-foreground">{locked ? (isSelf ? "You can't remove your own admin" : "The last admin") : ROLE_HINT[r]}</div>
                          </div>
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => makeResetLink(p)} disabled={loginLink.isPending}>
                      <KeyRound className="mr-2 h-4 w-4" /> Password reset link
                    </DropdownMenuItem>
                  </>
                ) : null}
                {p.isActive && !p.hasLogin ? (
                  <DropdownMenuItem onSelect={() => setAddFor({ email: p.email ?? "", name: p.name })}>
                    <UserPlus className="mr-2 h-4 w-4" /> Create login
                  </DropdownMenuItem>
                ) : null}
                {p.isActive ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={isSelf} onSelect={() => setConfirmFormer(p)} className="text-red-600 focus:text-red-600">
                      <UserMinus className="mr-2 h-4 w-4" /> Move to former
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onSelect={() => setActive.mutate({ person: p, active: true })}>
                    <UserRoundCheck className="mr-2 h-4 w-4" /> Restore to team
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        ) : null}
      </TableRow>
    );
  };

  const header = (
    <TableHeader>
      <TableRow>
        <TableHead>Person</TableHead>
        <TableHead>Access</TableHead>
        {isAdmin ? <TableHead>Last sign-in</TableHead> : null}
        <TableHead className="text-right" title="Meetings in the last 180 days">Meetings</TableHead>
        <TableHead className="text-right" title="Past meetings with no outcome recorded">Unrecorded</TableHead>
        <TableHead className="text-right">Show rate</TableHead>
        <TableHead>Fathom</TableHead>
        <TableHead className="text-center">Dialpad</TableHead>
        {isAdmin ? <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead> : null}
      </TableRow>
    </TableHeader>
  );

  return (
    <div className="space-y-4">
      {attention.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          {attention.map((a) => (
            <p key={a.key} className="flex items-start gap-2 text-xs text-foreground">
              {a.tone === "warn" ? (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              ) : (
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span>{a.text}</span>
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className="pl-9" aria-label="Search people" />
        </div>
        {isAdmin ? (
          <Button type="button" onClick={() => setAddFor({ email: "", name: "" })}>
            <UserPlus className="mr-1 h-4 w-4" /> Add login
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Team</h2>
          <span className="text-xs text-muted-foreground">{active.length} active · meeting numbers are the last 180 days</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            {header}
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`s${i}`}>
                      <TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))
                : active.map((p) => renderRow(p))}
              {!isLoading && active.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Nobody matches that search.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>

      {former.length > 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <button
            type="button"
            aria-expanded={formerOpen}
            onClick={() => setFormerOpen(!formerOpen)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn("h-4 w-4 transition-transform", formerOpen && "rotate-90")} aria-hidden="true" />
            <span className="text-sm font-semibold">Former team members</span>
            <span className="text-xs text-muted-foreground">({former.length}) no dialer access; past meetings stay attributed</span>
          </button>
          {formerOpen ? (
            <div className="overflow-x-auto border-t border-border">
              <Table>
                {header}
                <TableBody>{former.map((p) => renderRow(p, true))}</TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}

      <AddLoginDialog
        open={!!addFor}
        onOpenChange={(o) => !o && setAddFor(null)}
        onCreated={(r) => {
          setLinkResult(r);
          refresh();
        }}
        initialEmail={addFor?.email ?? ""}
        initialName={addFor?.name ?? ""}
      />
      <LoginLinkDialog result={linkResult} onClose={() => setLinkResult(null)} />

      <AlertDialog open={!!confirmFormer} onOpenChange={(o) => !o && setConfirmFormer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {confirmFormer?.name} to former team members?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmFormer?.hasLogin
                ? "Their dialer access is removed (all roles). Restoring them later does not give access back. "
                : ""}
              Their past meetings stay attributed, so show rates and source numbers don't change.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmFormer) setActive.mutate({ person: confirmFormer, active: false });
                setConfirmFormer(null);
              }}
            >
              Move to former
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
