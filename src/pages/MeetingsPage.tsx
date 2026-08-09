import { useState } from "react";
import { Link } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { CalendarClock, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  DISPOSITION_OPTIONS,
  useMeetingsNeedingDisposition,
  useSetMeetingOutcome,
  useUpcomingMeetings,
  type MeetingOutcome,
  type MeetingRow,
} from "@/hooks/useMeetings";

function formatWhen(iso: string | null) {
  if (!iso) return "No date";
  const date = new Date(iso);
  if (isToday(date)) return `Today, ${format(date, "h:mmaaa")}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, "h:mmaaa")}`;
  return format(date, "EEE d MMM, h:mmaaa");
}

function MeetingIdentity({ meeting }: { meeting: MeetingRow }) {
  const name = meeting.business_name || meeting.contact_person || "Unknown contact";

  return (
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
          <span className="truncate font-medium text-muted-foreground">
            {meeting.title || "Not in the dialer"}
          </span>
        )}

        <Badge variant="outline" className="text-[10px]">
          {meeting.channel}
        </Badge>

        {meeting.stream === "dialer" ? (
          <Badge variant="secondary" className="text-[10px]">
            dialer
          </Badge>
        ) : null}

        {meeting.led_to_deal ? (
          <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">won</Badge>
        ) : null}
      </div>

      <p className="truncate text-xs text-muted-foreground">
        {formatWhen(meeting.start_time)}
        {meeting.meeting_type ? ` · ${meeting.meeting_type}` : ""}
        {!meeting.is_linked ? " · no dialer contact" : ""}
      </p>
    </div>
  );
}

function DispositionRow({ meeting }: { meeting: MeetingRow }) {
  const { toast } = useToast();
  const setOutcome = useSetMeetingOutcome();
  const [busy, setBusy] = useState<MeetingOutcome | null>(null);

  const handle = async (outcome: MeetingOutcome) => {
    setBusy(outcome);
    try {
      await setOutcome.mutateAsync({ meetingId: meeting.id, stream: meeting.stream, outcome });
      toast({ description: `Marked as ${outcome === "noshow" ? "no-show" : outcome}.` });
    } catch (error) {
      toast({
        variant: "destructive",
        description: error instanceof Error ? error.message : "Could not save that outcome.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <MeetingIdentity meeting={meeting} />

      {meeting.stream === "dialer" ? (
        // Dialer bookings carry a richer outcome (showed_closed, showed_verbal_commitment,
        // showed_no_close…) that the Clients page depends on. Flattening it to "showed"
        // here would destroy that detail, so send the rep to the pipeline instead.
        <Button asChild variant="outline" size="sm">
          <Link to="/pipelines">
            Record in pipeline
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {DISPOSITION_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={option.value === "showed" ? "default" : "outline"}
              disabled={busy !== null}
              onClick={() => handle(option.value)}
            >
              {busy === option.value ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingList({
  meetings,
  isLoading,
  emptyTitle,
  emptyBody,
  disposition,
}: {
  meetings: MeetingRow[];
  isLoading: boolean;
  emptyTitle: string;
  emptyBody: string;
  disposition: boolean;
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
      {meetings.map((meeting) =>
        disposition ? (
          <DispositionRow key={`${meeting.stream}-${meeting.id}`} meeting={meeting} />
        ) : (
          <div
            key={`${meeting.stream}-${meeting.id}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
          >
            <MeetingIdentity meeting={meeting} />
            {meeting.meeting_link ? (
              <Button asChild variant="ghost" size="sm">
                <a href={meeting.meeting_link} target="_blank" rel="noreferrer">
                  Join
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
          </div>
        ),
      )}
    </div>
  );
}

export default function MeetingsPage() {
  const { data: pending = [], isLoading: pendingLoading } = useMeetingsNeedingDisposition();
  const { data: upcoming = [], isLoading: upcomingLoading } = useUpcomingMeetings();

  return (
    <AppLayout title="Meetings">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              Every meeting, from GHL calendars and the dialer.
            </p>
            <p className="text-xs text-muted-foreground">
              A meeting with no recorded outcome is left out of show rate entirely — it counts as
              unknown, not as a no-show. Clearing the queue below is what turns{" "}
              <Link to="/insights?tab=sources" className="font-medium underline underline-offset-2">
                show rate and close rate by source
              </Link>{" "}
              into numbers worth acting on.
            </p>
          </div>
        </div>

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
          </TabsList>

          <TabsContent value="pending">
            <MeetingList
              meetings={pending}
              isLoading={pendingLoading}
              disposition
              emptyTitle="Nothing waiting on an outcome"
              emptyBody="Every past meeting has been dispositioned. Show rate is fully measured."
            />
          </TabsContent>

          <TabsContent value="upcoming">
            <MeetingList
              meetings={upcoming}
              isLoading={upcomingLoading}
              disposition={false}
              emptyTitle="No meetings scheduled"
              emptyBody="Bookings from GHL calendars and the dialer will appear here."
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
