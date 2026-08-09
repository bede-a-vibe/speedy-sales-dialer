import { useState } from "react";
import { Link } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { CalendarCheck, CheckCircle2, ExternalLink, RotateCcw } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MeetingOutcomeDialog } from "@/components/meetings/MeetingOutcomeDialog";
import { useCanViewAdmin } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import {
  useMeetingsNeedingOutcome,
  useMyGhlUserId,
  useRecentMeetings,
  useRepMeetingStats,
  useUpcomingMeetings,
  type MeetingRow,
} from "@/hooks/useMeetings";
import {
  OUTCOME_LABELS,
  outcomeTone,
  reasonLabel,
  type RecordableOutcome,
} from "@/lib/meetingOutcomes";
import { cn } from "@/lib/utils";

function formatWhen(iso: string | null) {
  if (!iso) return "No date";
  const date = new Date(iso);
  if (isToday(date)) return `Today, ${format(date, "h:mmaaa")}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, "h:mmaaa")}`;
  return format(date, "EEE d MMM, h:mmaaa");
}

function MeetingCard({
  meeting,
  onDisposition,
  showRep,
}: {
  meeting: MeetingRow;
  onDisposition?: (meeting: MeetingRow, outcome: RecordableOutcome | null) => void;
  showRep: boolean;
}) {
  const name = meeting.business_name || meeting.contact_person || meeting.title || "Unknown contact";
  const outcome = meeting.resolved_outcome;
  const isTerminal = outcome !== "pending" && outcome !== "upcoming";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          {meeting.contact_id ? (
            <Link
              to={`/contacts/${meeting.contact_id}`}
              className="truncate font-medium text-foreground hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="truncate font-medium text-muted-foreground">{name}</span>
          )}

          <Badge variant="outline" className="text-[10px]">
            {meeting.channel}
          </Badge>

          {meeting.stream === "dialer" ? (
            <Badge variant="secondary" className="text-[10px]">
              dialer
            </Badge>
          ) : null}

          {meeting.reschedule_count > 0 ? (
            <Badge variant="outline" className="gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <RotateCcw className="h-3 w-3" />
              moved {meeting.reschedule_count}×
            </Badge>
          ) : null}

          {isTerminal ? (
            <Badge className={cn("text-[10px]", outcomeTone(outcome))}>
              {OUTCOME_LABELS[outcome]}
              {meeting.outcome_reason ? ` · ${reasonLabel(meeting.outcome_reason)}` : ""}
            </Badge>
          ) : null}

          {meeting.led_to_deal ? (
            <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">won</Badge>
          ) : null}
        </div>

        <p className="truncate text-xs text-muted-foreground">
          {formatWhen(meeting.start_time)}
          {meeting.meeting_type ? ` · ${meeting.meeting_type}` : ""}
          {showRep ? ` · ${meeting.rep_name}` : ""}
          {!meeting.is_linked ? " · not in the dialer" : ""}
        </p>
      </div>

      {onDisposition ? (
        meeting.stream === "dialer" ? (
          // Dialer bookings carry a richer outcome (showed_closed, showed_verbal_commitment,
          // showed_no_close…) that the Clients page reads. Flattening it to "showed" here
          // would destroy that detail, so send the rep to the pipeline instead.
          <Button asChild variant="outline" size="sm">
            <Link to="/pipelines">
              Record in pipeline
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => onDisposition(meeting, "showed")}>
              Showed
            </Button>
            <Button size="sm" variant="outline" onClick={() => onDisposition(meeting, "noshow")}>
              No-show
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDisposition(meeting, null)}>
              Other
            </Button>
          </div>
        )
      ) : meeting.meeting_link ? (
        <Button asChild variant="ghost" size="sm">
          <a href={meeting.meeting_link} target="_blank" rel="noreferrer">
            Join
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </a>
        </Button>
      ) : null}
    </div>
  );
}

function MeetingList({
  meetings,
  isLoading,
  emptyTitle,
  emptyBody,
  onDisposition,
  showRep,
}: {
  meetings: MeetingRow[];
  isLoading: boolean;
  emptyTitle: string;
  emptyBody: string;
  onDisposition?: (meeting: MeetingRow, outcome: RecordableOutcome | null) => void;
  showRep: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-12 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
        <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{emptyBody}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {meetings.map((meeting) => (
        <MeetingCard
          key={`${meeting.stream}-${meeting.id}`}
          meeting={meeting}
          onDisposition={onDisposition}
          showRep={showRep}
        />
      ))}
    </div>
  );
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const isAdmin = useCanViewAdmin();
  const { data: myGhlUserId } = useMyGhlUserId();

  // Reps only ever see their own calendar. "Mine" is the default for everyone —
  // the queue is a personal to-do, not a report. Admins can switch to another rep,
  // which is how meetings taken by people without a dialer login get recorded.
  const [scope, setScope] = useState<string>("mine");
  const today = new Date().toISOString().split("T")[0];
  const rangeStart = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
  const { data: reps = [] } = useRepMeetingStats(rangeStart, today);

  const mine = scope === "mine";
  const everyone = scope === "all";
  const selectedRep = reps.find((rep) => (rep.ghl_user_id ?? rep.rep_user_id) === scope);

  const filters = mine
    ? { ghlUserId: myGhlUserId ?? null, repUserId: user?.id ?? null }
    : everyone
      ? {}
      : { ghlUserId: selectedRep?.ghl_user_id ?? null, repUserId: selectedRep?.rep_user_id ?? null };

  const { data: pending = [], isLoading: pendingLoading } = useMeetingsNeedingOutcome(filters);
  const { data: upcoming = [], isLoading: upcomingLoading } = useUpcomingMeetings(filters);
  const { data: recent = [], isLoading: recentLoading } = useRecentMeetings(filters);

  const [dialogMeeting, setDialogMeeting] = useState<MeetingRow | null>(null);
  const [dialogOutcome, setDialogOutcome] = useState<RecordableOutcome | null>(null);

  const handleDisposition = (meeting: MeetingRow, outcome: RecordableOutcome | null) => {
    setDialogMeeting(meeting);
    setDialogOutcome(outcome);
  };

  const unlinkedIdentity = mine && !myGhlUserId;
  const showRep = !mine;

  return (
    <AppLayout title="Meetings">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {mine
                  ? "Your meetings, from GHL calendars and the dialer."
                  : everyone
                    ? "Everyone's meetings, from GHL calendars and the dialer."
                    : `${selectedRep?.rep_name ?? "Rep"}'s meetings.`}
              </p>
              <p className="text-xs text-muted-foreground">
                A meeting with no recorded outcome is left out of show rate entirely — it counts as
                unknown, not as a no-show. Reschedules are tracked separately, so moving a meeting
                never reads as a miss. Pick a rep above to record outcomes for someone who does not
                have a dialer login of their own.
              </p>
            </div>
          </div>

          {isAdmin ? (
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">My meetings</SelectItem>
                <SelectItem value="all">Everyone</SelectItem>
                {reps
                  .filter((rep) => (rep.ghl_user_id ?? rep.rep_user_id) && rep.rep_name !== "Unassigned")
                  .map((rep) => {
                    const value = (rep.ghl_user_id ?? rep.rep_user_id) as string;
                    return (
                      <SelectItem key={value} value={value}>
                        {rep.rep_name}
                        {rep.pending > 0 ? ` (${rep.pending} to record)` : ""}
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {unlinkedIdentity ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <p className="font-medium text-foreground">Your account is not linked to GHL yet.</p>
            <p className="mt-1 text-muted-foreground">
              Meetings booked on your GHL calendar will not appear here until an admin sets your GHL
              user on the{" "}
              <Link to="/admin/team" className="font-medium underline underline-offset-2">
                Team page
              </Link>
              .
            </p>
          </div>
        ) : null}

        <Tabs defaultValue="pending">
          <TabsList className="mb-4">
            <TabsTrigger value="pending">
              Needs outcome
              {pending.length > 0 ? (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {pending.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              Upcoming
              {upcoming.length > 0 ? (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  {upcoming.length}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="recent">Recorded</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <MeetingList
              meetings={pending}
              isLoading={pendingLoading}
              onDisposition={handleDisposition}
              showRep={showRep}
              emptyTitle="Nothing waiting on an outcome"
              emptyBody="Every past meeting has been recorded. Show rate is fully measured."
            />
          </TabsContent>

          <TabsContent value="upcoming">
            <MeetingList
              meetings={upcoming}
              isLoading={upcomingLoading}
              showRep={showRep}
              emptyTitle="No meetings scheduled"
              emptyBody="Bookings from GHL calendars and the dialer will appear here."
            />
          </TabsContent>

          <TabsContent value="recent">
            <MeetingList
              meetings={recent}
              isLoading={recentLoading}
              onDisposition={handleDisposition}
              showRep={showRep}
              emptyTitle="Nothing recorded yet"
              emptyBody="Outcomes you record will show up here so you can correct them."
            />
          </TabsContent>
        </Tabs>
      </div>

      <MeetingOutcomeDialog
        meeting={dialogMeeting}
        initialOutcome={dialogOutcome}
        onOpenChange={(open) => {
          if (!open) {
            setDialogMeeting(null);
            setDialogOutcome(null);
          }
        }}
      />
    </AppLayout>
  );
}
