import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PipelineItemCard } from "@/components/pipelines/PipelineItemCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { useUpdateContact } from "@/hooks/useContacts";
import {
  usePipelineItems,
  useSalesReps,
  useUpdatePipelineItem,
  type PipelineItemWithRelations,
} from "@/hooks/usePipelineItems";

function getRepLabel(displayName: string | null, email: string | null) {
  return displayName?.trim() || email || "Unassigned";
}

type HistoryFilter = "all" | "no_show" | "showed_closed" | "showed_no_close";

type RepHistoryStat = {
  repId: string;
  repName: string;
  total: number;
  noShow: number;
  closed: number;
  noClose: number;
  showed: number;
  showUpRate: number;
  closeRate: number;
};

function buildRepStats(
  items: PipelineItemWithRelations[],
  getRepId: (item: PipelineItemWithRelations) => string,
  repMap: Map<string, string>,
) {
  const stats = new Map<string, Omit<RepHistoryStat, "showUpRate" | "closeRate">>();

  items.forEach((item) => {
    const repId = getRepId(item);
    const current = stats.get(repId) ?? {
      repId,
      repName: repMap.get(repId) || "Unknown rep",
      total: 0,
      noShow: 0,
      closed: 0,
      noClose: 0,
      showed: 0,
    };

    current.total += 1;

    if (item.appointment_outcome === "no_show") current.noShow += 1;
    if (item.appointment_outcome === "showed_closed") {
      current.closed += 1;
      current.showed += 1;
    }
    if (item.appointment_outcome === "showed_no_close") {
      current.noClose += 1;
      current.showed += 1;
    }

    stats.set(repId, current);
  });

  return Array.from(stats.values())
    .map((stat) => ({
      ...stat,
      showUpRate: stat.total > 0 ? Math.round((stat.showed / stat.total) * 100) : 0,
      closeRate: stat.showed > 0 ? Math.round((stat.closed / stat.showed) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.closed - a.closed || a.repName.localeCompare(b.repName));
}

function RepStatsTable({
  title,
  description,
  stats,
}: {
  title: string;
  description: string;
  stats: RepHistoryStat[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 space-y-1">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {stats.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No completed appointments yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Rep</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Total</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">No-show</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Showed</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Show-up %</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Closed</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">No-close</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Close %</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={`${title}-${stat.repId}`} className="border-b border-border last:border-b-0">
                  <td className="py-3 font-medium text-foreground">{stat.repName}</td>
                  <td className="py-3 font-mono text-muted-foreground">{stat.total}</td>
                  <td className="py-3 font-mono text-muted-foreground">{stat.noShow}</td>
                  <td className="py-3 font-mono text-muted-foreground">{stat.showed}</td>
                  <td className="py-3 font-mono text-muted-foreground">{stat.showUpRate}%</td>
                  <td className="py-3 font-mono text-muted-foreground">{stat.closed}</td>
                  <td className="py-3 font-mono text-muted-foreground">{stat.noClose}</td>
                  <td className="py-3 font-mono text-muted-foreground">{stat.closeRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PipelinesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const activeTab = searchParams.get("tab") === "booked" || searchParams.get("tab") === "history" ? searchParams.get("tab")! : "follow_up";
  const { data: followUps = [], isLoading: followUpsLoading } = usePipelineItems("follow_up", "open");
  const { data: booked = [], isLoading: bookedLoading } = usePipelineItems("booked", "open");
  const { data: completedBooked = [], isLoading: historyLoading } = usePipelineItems("booked", "completed");
  const { data: reps = [] } = useSalesReps();
  const updatePipelineItem = useUpdatePipelineItem();
  const updateContact = useUpdateContact();

  const repMap = useMemo(
    () => new Map(reps.map((rep) => [rep.user_id, getRepLabel(rep.display_name, rep.email)])),
    [reps],
  );

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return completedBooked;
    return completedBooked.filter((item) => item.appointment_outcome === historyFilter);
  }, [completedBooked, historyFilter]);

  const setterStats = useMemo(
    () => buildRepStats(filteredHistory, (item) => item.created_by, repMap),
    [filteredHistory, repMap],
  );

  const closerStats = useMemo(
    () => buildRepStats(filteredHistory, (item) => item.assigned_user_id, repMap),
    [filteredHistory, repMap],
  );

  const handleComplete = async (id: string) => {
    try {
      await updatePipelineItem.mutateAsync({ id, status: "completed" });
      toast.success("Pipeline item completed.");
    } catch {
      toast.error("Failed to complete pipeline item.");
    }
  };

  const handleAssign = async (id: string, userId: string) => {
    try {
      await updatePipelineItem.mutateAsync({ id, assigned_user_id: userId });
      toast.success("Rep updated.");
    } catch {
      toast.error("Failed to update rep.");
    }
  };

  const handleReschedule = async (id: string, iso: string) => {
    try {
      await updatePipelineItem.mutateAsync({ id, scheduled_for: iso });
      toast.success("Follow-up rescheduled.");
    } catch {
      toast.error("Failed to reschedule follow-up.");
    }
  };

  const handleBookedOutcome = async (
    item: PipelineItemWithRelations,
    outcome: AppointmentOutcomeValue,
    notes: string,
    scheduledFor?: string,
  ) => {
    try {
      if (outcome === "rescheduled") {
        if (!scheduledFor) {
          toast.error("Pick a new appointment day first.");
          return;
        }

        await updatePipelineItem.mutateAsync({
          id: item.id,
          appointment_outcome: "rescheduled",
          outcome_notes: notes,
          scheduled_for: scheduledFor,
          status: "open",
          completed_at: null,
        });

        await updateContact.mutateAsync({
          id: item.contact_id,
          status: "called",
          latest_appointment_outcome: "rescheduled",
          latest_appointment_scheduled_for: scheduledFor,
          latest_appointment_recorded_at: new Date().toISOString(),
        });

        toast.success("Appointment rescheduled.");
        return;
      }

      await updatePipelineItem.mutateAsync({
        id: item.id,
        appointment_outcome: outcome,
        outcome_notes: notes,
        status: "completed",
      });

      await updateContact.mutateAsync({
        id: item.contact_id,
        status: "called",
        latest_appointment_outcome: outcome,
        latest_appointment_scheduled_for: item.scheduled_for,
        latest_appointment_recorded_at: new Date().toISOString(),
      });

      toast.success(`Appointment marked ${getAppointmentOutcomeLabel(outcome)}.`);
    } catch {
      toast.error("Failed to update appointment outcome.");
    }
  };

  const renderOpenItems = (items: PipelineItemWithRelations[], type: "follow_up" | "booked") => {
    if ((type === "follow_up" && followUpsLoading) || (type === "booked" && bookedLoading)) {
      return <div className="animate-pulse py-20 text-center text-sm font-mono text-muted-foreground">Loading...</div>;
    }

    if (items.length === 0) {
      return <div className="py-20 text-center text-sm text-muted-foreground">No open {type === "follow_up" ? "follow-ups" : "booked appointments"}.</div>;
    }

    return (
      <div className="space-y-3">
        {items.map((item) => (
          <PipelineItemCard
            key={item.id}
            item={item}
            repName={repMap.get(item.assigned_user_id) || "Unknown rep"}
            reps={reps}
            isSaving={updatePipelineItem.isPending || updateContact.isPending}
            onComplete={handleComplete}
            onAssign={handleAssign}
            onReschedule={type === "follow_up" ? handleReschedule : undefined}
            onRecordBookedOutcome={type === "booked" ? handleBookedOutcome : undefined}
          />
        ))}
      </div>
    );
  };

  const renderHistory = () => {
    if (historyLoading) {
      return <div className="animate-pulse py-20 text-center text-sm font-mono text-muted-foreground">Loading...</div>;
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Completed appointments</h3>
            <p className="text-xs text-muted-foreground">Review past booked outcomes and compare setter vs closer performance.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground">{filteredHistory.length} results</span>
            <Select value={historyFilter} onValueChange={(value) => setHistoryFilter(value as HistoryFilter)}>
              <SelectTrigger className="w-[220px] bg-background">
                <SelectValue placeholder="Filter outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All completed outcomes</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
                <SelectItem value="showed_closed">Showed - Closed</SelectItem>
                <SelectItem value="showed_no_close">Showed - No Close</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <RepStatsTable
            title="Appointment setters"
            description="Uses the rep who originally created the booked appointment."
            stats={setterStats}
          />
          <RepStatsTable
            title="Closers"
            description="Uses the rep currently assigned to the appointment when it was completed."
            stats={closerStats}
          />
        </div>

        {filteredHistory.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">No completed appointments match this filter.</div>
        ) : (
          <div className="space-y-3">
            {filteredHistory.map((item) => (
              <PipelineItemCard
                key={item.id}
                item={item}
                repName={repMap.get(item.assigned_user_id) || "Unknown rep"}
                reps={reps}
                isSaving={false}
                showActions={false}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppLayout title="Pipelines">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Appointment pipelines</h3>
            <p className="text-sm text-muted-foreground">Track open follow-ups, booked days, and final appointment results in one place.</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span>{followUps.length} follow-ups</span>
            <span>{booked.length} booked</span>
            <span>{completedBooked.length} completed</span>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })}>
          <TabsList>
            <TabsTrigger value="follow_up">Follow-ups</TabsTrigger>
            <TabsTrigger value="booked">Booked</TabsTrigger>
            <TabsTrigger value="history">Completed</TabsTrigger>
          </TabsList>
          <TabsContent value="follow_up" className="mt-4">
            {renderOpenItems(followUps, "follow_up")}
          </TabsContent>
          <TabsContent value="booked" className="mt-4">
            {renderOpenItems(booked, "booked")}
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            {renderHistory()}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}