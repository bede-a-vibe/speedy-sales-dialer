import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Phone } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ReportSection } from "@/components/reports/ReportSection";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  useRepMeetingStats,
  useTeamMembers,
  useUpdateGhlUser,
  type TeamMember,
} from "@/hooks/useMeetings";

function TeamTable({
  members,
  statsFor,
  onToggleDialpad,
  muted,
}: {
  members: TeamMember[];
  statsFor: (member: TeamMember) => { meetings_booked: number; pending: number; show_rate_pct: number | null } | undefined;
  onToggleDialpad?: (member: TeamMember, value: boolean) => void;
  muted?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Meetings</TableHead>
            <TableHead className="text-right">Unrecorded</TableHead>
            <TableHead className="text-right">Show rate</TableHead>
            <TableHead>Records own outcomes</TableHead>
            {onToggleDialpad ? <TableHead className="text-right">Dialpad</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => {
            const stats = statsFor(member);
            const key = member.ghl_user_id ?? member.dialer_user_id ?? member.name;
            return (
              <TableRow key={key} className={muted ? "opacity-60" : undefined}>
                <TableCell className="font-medium">{member.name}</TableCell>
                <TableCell className="text-muted-foreground">{member.email ?? "—"}</TableCell>
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
                  {member.has_dialer_login ? (
                    <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">yes</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">
                      admin records
                    </Badge>
                  )}
                </TableCell>
                {onToggleDialpad ? (
                  <TableCell className="text-right">
                    <Switch
                      checked={member.needs_dialpad}
                      disabled={!member.in_ghl}
                      onCheckedChange={(checked) => onToggleDialpad(member, checked)}
                      aria-label={`Toggle Dialpad requirement for ${member.name}`}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TeamPage() {
  const { toast } = useToast();
  const { data: members = [], isLoading } = useTeamMembers();
  const updateGhlUser = useUpdateGhlUser();

  const today = new Date().toISOString().split("T")[0];
  const [from] = useState(new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0]);
  const { data: repStats = [] } = useRepMeetingStats(from, today, true);

  const statsFor = useMemo(() => {
    const byGhl = new Map(repStats.filter((s) => s.ghl_user_id).map((s) => [s.ghl_user_id, s]));
    const byUser = new Map(repStats.filter((s) => s.rep_user_id).map((s) => [s.rep_user_id, s]));
    return (member: TeamMember) =>
      (member.ghl_user_id ? byGhl.get(member.ghl_user_id) : undefined) ??
      (member.dialer_user_id ? byUser.get(member.dialer_user_id) : undefined);
  }, [repStats]);

  const active = members.filter((m) => m.is_active);
  const former = members.filter((m) => !m.is_active);

  // People taking meetings who cannot log in. Their outcomes have to be recorded
  // by an admin from the rep picker on the Meetings page, or they never get recorded.
  const needsAdminRecording = active.filter(
    (m) => !m.has_dialer_login && (statsFor(m)?.pending ?? 0) > 0,
  );
  const totalUnrecorded = needsAdminRecording.reduce(
    (sum, m) => sum + (statsFor(m)?.pending ?? 0),
    0,
  );

  const dialpadFlagged = active.filter((m) => m.needs_dialpad).length;
  const dialpadSeats = active.filter((m) => m.has_dialpad_seat).length;

  const handleToggle = async (member: TeamMember, needsDialpad: boolean) => {
    if (!member.ghl_user_id) return;
    try {
      await updateGhlUser.mutateAsync({
        ghlUserId: member.ghl_user_id,
        patch: { needs_dialpad: needsDialpad },
      });
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
        {needsAdminRecording.length > 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1 text-xs">
              <p className="font-medium text-foreground">
                {totalUnrecorded} meetings taken by{" "}
                {needsAdminRecording.map((m) => m.name).join(" and ")} have no outcome recorded.
              </p>
              <p className="text-muted-foreground">
                They take calls but have no dialer login, so nobody can record their outcomes but
                you. Pick their name from the rep list on the{" "}
                <Link to="/meetings" className="font-medium underline underline-offset-2">
                  Meetings page
                </Link>{" "}
                to work through the queue.
              </p>
            </div>
          </div>
        ) : null}

        <ReportSection
          title="Team"
          description="Everyone who can take a meeting, from GHL and the dialer. A dialer login lets someone record their own outcomes; a Dialpad seat is only needed for outbound dialling and costs per head."
        >
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <TeamTable members={active} statsFor={statsFor} onToggleDialpad={handleToggle} />
          )}

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3 w-3" />
              {dialpadSeats} active Dialpad {dialpadSeats === 1 ? "seat" : "seats"} · {dialpadFlagged}{" "}
              flagged as needing one
            </span>
            <span>Only tick Dialpad for people who actually dial out.</span>
          </div>
        </ReportSection>

        {former.length > 0 ? (
          <ReportSection
            title="Former team members"
            description="Kept out of the rep leaderboard. Their historical meetings stay attributed, so past show rates and source numbers are unchanged."
            collapsible
            defaultOpen={false}
          >
            <TeamTable members={former} statsFor={statsFor} muted />
          </ReportSection>
        ) : null}
      </div>
    </AppLayout>
  );
}
