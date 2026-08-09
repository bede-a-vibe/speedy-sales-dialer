import { useMemo, useState } from "react";
import { AlertTriangle, Phone, UserPlus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ReportSection } from "@/components/reports/ReportSection";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useGhlUsers, useRepMeetingStats, useUpdateGhlUser } from "@/hooks/useMeetings";

export default function TeamPage() {
  const { toast } = useToast();
  const { data: ghlUsers = [], isLoading } = useGhlUsers();
  const updateUser = useUpdateGhlUser();

  const today = new Date().toISOString().split("T")[0];
  const [from] = useState(new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0]);
  const { data: repStats = [] } = useRepMeetingStats(from, today);

  const statsByGhlId = useMemo(
    () => new Map(repStats.map((stat) => [stat.ghl_user_id, stat])),
    [repStats],
  );

  const missingAccounts = ghlUsers.filter((user) => !user.provisioned_user_id);
  const missingWithMeetings = missingAccounts.filter(
    (user) => (statsByGhlId.get(user.ghl_user_id)?.meetings_booked ?? 0) > 0,
  );

  const dialpadCount = ghlUsers.filter((user) => user.needs_dialpad).length;

  const handleToggle = async (ghlUserId: string, needsDialpad: boolean) => {
    try {
      await updateUser.mutateAsync({ ghlUserId, patch: { needs_dialpad: needsDialpad } });
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Could not update that user.",
      });
    }
  };

  return (
    <AppLayout title="Team">
      <div className="mx-auto max-w-5xl space-y-4">
        {missingWithMeetings.length > 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1 text-xs">
              <p className="font-medium text-foreground">
                {missingWithMeetings.length}{" "}
                {missingWithMeetings.length === 1 ? "person is" : "people are"} taking meetings with
                no dialer login.
              </p>
              <p className="text-muted-foreground">
                Their meetings sync in and sit unrecorded, because they have no way to log in and say
                what happened. Between them:{" "}
                {missingWithMeetings.reduce(
                  (sum, user) => sum + (statsByGhlId.get(user.ghl_user_id)?.pending ?? 0),
                  0,
                )}{" "}
                meetings are waiting on an outcome.
              </p>
            </div>
          </div>
        ) : null}

        <ReportSection
          title="GHL users and dialer accounts"
          description="Everyone in the GHL location. A dialer login is what lets someone record their own meeting outcomes; a Dialpad seat is only needed if they make outbound calls."
        >
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Meetings</TableHead>
                    <TableHead className="text-right">Unrecorded</TableHead>
                    <TableHead className="text-right">Show rate</TableHead>
                    <TableHead>Dialer login</TableHead>
                    <TableHead className="text-right">Needs Dialpad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ghlUsers.map((user) => {
                    const stats = statsByGhlId.get(user.ghl_user_id);
                    return (
                      <TableRow key={user.ghl_user_id}>
                        <TableCell className="font-medium">{user.name}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stats?.meetings_booked ?? 0}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stats?.pending ? (
                            <span className="text-amber-600 dark:text-amber-400">{stats.pending}</span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {stats?.show_rate_pct != null ? `${stats.show_rate_pct}%` : "—"}
                        </TableCell>
                        <TableCell>
                          {user.provisioned_user_id ? (
                            <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">
                              active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <UserPlus className="h-3 w-3" />
                              none
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={user.needs_dialpad}
                            onCheckedChange={(checked) => handleToggle(user.ghl_user_id, checked)}
                            aria-label={`Toggle Dialpad requirement for ${user.name}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              {dialpadCount} of {ghlUsers.length} flagged as needing a Dialpad seat
            </span>
            <span>
              A dialer login costs nothing. Only tick Dialpad for people who actually dial out.
            </span>
          </div>
        </ReportSection>

        {missingAccounts.length > 0 ? (
          <ReportSection
            title="Waiting on an account"
            description="Provisioning creates the login and links it to the GHL user in one step, so their calendar appears on their Meetings page immediately."
          >
            <ul className="space-y-2">
              {missingAccounts.map((user) => (
                <li
                  key={user.ghl_user_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2.5 text-sm"
                >
                  <span>
                    <span className="font-medium">{user.name}</span>{" "}
                    <span className="text-muted-foreground">{user.email}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {statsByGhlId.get(user.ghl_user_id)?.meetings_booked ?? 0} meetings ·{" "}
                    {statsByGhlId.get(user.ghl_user_id)?.pending ?? 0} unrecorded
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
              Accounts are created by emailed invite, so each person sets their own password and it
              is never handled by anyone else. Provisioning is not wired up yet — it needs a
              service-role edge function, which is the next step.
            </p>
          </ReportSection>
        ) : null}
      </div>
    </AppLayout>
  );
}
