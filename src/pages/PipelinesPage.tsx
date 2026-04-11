import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PipelineItemCard } from "@/components/pipelines/PipelineItemCard";
import { BookedAppointmentsTable } from "@/components/pipelines/BookedAppointmentsTable";
import { BookedPipelineBoard } from "@/components/pipelines/BookedPipelineBoard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAppointmentOutcomeLabel, type AppointmentOutcomeValue } from "@/lib/appointments";
import { getAppointmentOutcomeGhlSync } from "@/lib/pipelineMappings";

import {
  usePipelineItems,
  useSalesReps,
  useUpdatePipelineItem,
  type PipelineItemWithRelations,
  type FollowUpMethod,
} from "@/hooks/usePipelineItems";
import { useAuth } from "@/hooks/useAuth";
import { useGHLSync } from "@/hooks/useGHLSync";
import { useGHLContactLink } from "@/hooks/useGHLContactLink";
import { findDefaultBookedPipeline, findDefaultBookedStage, findDefaultFollowUpPipeline, findDefaultFollowUpStage, useGHLPipelines } from "@/hooks/useGHLConfig";
import { TwoPipelineGuide } from "@/components/ghl/TwoPipelineGuide";
import { PipelineMirrorCards } from "@/components/ghl/PipelineMirrorCards";

function getRepLabel(displayName: string | null, email: string | null) {
  return displayName?.trim() || email || "Unassigned";
}

type HistoryFilter = "all" | "no_show" | "showed_closed" | "showed_no_close" | "showed_verbal_commitment";
type HistorySortKey = "repName" | "total" | "closed" | "showUpRate" | "closeRate";
type SortDirection = "asc" | "desc";

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

type HistorySort = {
  key: HistorySortKey;
  direction: SortDirection;
};

const DEFAULT_HISTORY_SORT: HistorySort = {
  key: "total",
  direction: "desc",
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
    if (item.appointment_outcome === "showed_verbal_commitment") {
      current.showed += 1;
    }
    if (item.appointment_outcome === "showed_no_close") {
      current.noClose += 1;
      current.showed += 1;
    }

    stats.set(repId, current);
  });

  return Array.from(stats.values()).map((stat) => ({
    ...stat,
    showUpRate: stat.total > 0 ? Math.round((stat.showed / stat.total) * 100) : 0,
    closeRate: stat.showed > 0 ? Math.round((stat.closed / stat.showed) * 100) : 0,
  }));
}

function sortRepStats(stats: RepHistoryStat[], sort: HistorySort) {
  return [...stats].sort((a, b) => {
    const direction = sort.direction === "asc" ? 1 : -1;

    if (sort.key === "repName") {
      return a.repName.localeCompare(b.repName) * direction;
    }

    const difference = a[sort.key] - b[sort.key];
    if (difference !== 0) return difference * direction;

    return a.repName.localeCompare(b.repName);
  });
}

function getSortLabel(key: HistorySortKey) {
  switch (key) {
    case "repName":
      return "rep";
    case "total":
      return "total appointments";
    case "closed":
      return "closes";
    case "showUpRate":
      return "show-up rate";
    case "closeRate":
      return "close rate";
  }
}

function RepStatsTable({
  title,
  description,
  stats,
  sort,
  onSortChange,
}: {
  title: string;
  description: string;
  stats: RepHistoryStat[];
  sort: HistorySort;
  onSortChange: (key: HistorySortKey) => void;
}) {
  const renderSortableHeader = (label: string, key: HistorySortKey) => {
    const isActive = sort.key === key;
    const indicator = !isActive ? "↕" : sort.direction === "asc" ? "↑" : "↓";

    return (
      <button
        type="button"
        onClick={() => onSortChange(key)}
        className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        aria-label={`Sort ${title.toLowerCase()} by ${getSortLabel(key)}`}
      >
        <span>{label}</span>
        <span className="text-[11px] text-muted-foreground">{indicator}</span>
      </button>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          Sorted by {getSortLabel(sort.key)} {sort.direction}
        </p>
      </div>

      {stats.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No completed appointments yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2">{renderSortableHeader("Rep", "repName")}</th>
                <th className="pb-2">{renderSortableHeader("Total", "total")}</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">No-show</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Showed</th>
                <th className="pb-2">{renderSortableHeader("Show-up %", "showUpRate")}</th>
                <th className="pb-2">{renderSortableHeader("Closed", "closed")}</th>
                <th className="pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">No-close</th>
                <th className="pb-2">{renderSortableHeader("Close %", "closeRate")}</th>
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
  const [setterSort, setSetterSort] = useState<HistorySort>(DEFAULT_HISTORY_SORT);
  const [closerSort, setCloserSort] = useState<HistorySort>(DEFAULT_HISTORY_SORT);
  
  
  const activeTab = searchParams.get("tab") === "history" ? "history" : "booked";
  const { data: booked = [], isLoading: bookedLoading } = usePipelineItems("booked", "open");
  const { data: completedBooked = [], isLoading: historyLoading } = usePipelineItems("booked", "completed");
  const { data: reps = [] } = useSalesReps();
  const updatePipelineItem = useUpdatePipelineItem();
  const { user } = useAuth();
  const ghlSync = useGHLSync();
  const ghlLink = useGHLContactLink();
  const { data: ghlPipelines = [] } = useGHLPipelines();

  const defaultFollowUpPipeline = useMemo(
    () => findDefaultFollowUpPipeline(ghlPipelines),
    [ghlPipelines],
  );

  const defaultBookedPipeline = useMemo(
    () => findDefaultBookedPipeline(ghlPipelines),
    [ghlPipelines],
  );

  const defaultFollowUpStage = useMemo(
    () => findDefaultFollowUpStage(defaultFollowUpPipeline),
    [defaultFollowUpPipeline],
  );

  const defaultBookedStage = useMemo(
    () => findDefaultBookedStage(defaultBookedPipeline),
    [defaultBookedPipeline],
  );

  const repMap = useMemo(
    () => new Map(reps.map((rep) => [rep.user_id, getRepLabel(rep.display_name, rep.email)])),
    [reps],
  );

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return completedBooked;
    return completedBooked.filter((item) => item.appointment_outcome === historyFilter);
  }, [completedBooked, historyFilter]);

  const setterStats = useMemo(
    () => sortRepStats(buildRepStats(filteredHistory, (item) => item.created_by, repMap), setterSort),
    [filteredHistory, repMap, setterSort],
  );

  const closerStats = useMemo(
    () => sortRepStats(buildRepStats(filteredHistory, (item) => item.assigned_user_id, repMap), closerSort),
    [filteredHistory, repMap, closerSort],
  );

  const handleHistorySortChange = (currentSort: HistorySort, setSort: (sort: HistorySort) => void, key: HistorySortKey) => {
    setSort(
      currentSort.key === key
        ? { key, direction: currentSort.direction === "desc" ? "asc" : "desc" }
        : { key, direction: key === "repName" ? "asc" : "desc" },
    );
  };

  const handleAssign = async (id: string, userId: string) => {
    try {
      await updatePipelineItem.mutateAsync({ id, assigned_user_id: userId });
      toast.success("Rep updated.");
    } catch {
      toast.error("Failed to update rep.");
    }
  };

  const handleBookedOutcome = async (
    item: PipelineItemWithRelations,
    outcome: AppointmentOutcomeValue,
    notes: string,
    scheduledFor?: string,
    dealValue?: number,
    followUpDate?: string,
    followUpMethod?: FollowUpMethod,
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

        toast.success("Appointment rescheduled.");
      } else {
        await updatePipelineItem.mutateAsync({
          id: item.id,
          appointment_outcome: outcome,
          outcome_notes: notes,
          status: "completed",
          ...(outcome === "showed_closed" && dealValue != null ? { deal_value: dealValue } : {}),
        });

        toast.success(`Appointment marked ${getAppointmentOutcomeLabel(outcome)}.`);
      }

      if (followUpDate) {
        toast.success("Follow-up requested in GHL.");
      }

      // ── GHL Sync for booking outcomes (fire-and-forget) ──
      // Auto-link contact to GHL if not already linked
      const contactGhlId =
        item.contacts?.ghl_contact_id
        ?? (item.contacts ? await ghlLink.ensureGHLLink(item.contacts as any).catch(() => null) : null);
      if (contactGhlId) {
        // Push outcome note to GHL
        const outcomeLabel = getAppointmentOutcomeLabel(outcome);
        const outcomeSync = getAppointmentOutcomeGhlSync(outcome);
        const noteParts = [`\uD83D\uDCCB Appointment Result: ${outcomeLabel}`];
        if (notes) noteParts.push(`Notes: ${notes}`);
        if (dealValue != null && outcome === "showed_closed") noteParts.push(`Deal Value: $${dealValue.toLocaleString()}`);
        if (outcome === "rescheduled" && scheduledFor) noteParts.push(`Rescheduled to: ${new Date(scheduledFor).toLocaleString("en-AU")}`);
        noteParts.push(`Recorded via Speedy Sales Dialer at ${new Date().toLocaleString("en-AU")}`);
        ghlSync.pushCallNote({
          ghlContactId: contactGhlId,
          outcome: outcomeSync.callOutcome,
          notes: noteParts.join("\n"),
        }).catch(() => {});

        // Push follow-up task to GHL if one was created
        if (followUpDate && outcomeSync.createsFollowUpTask) {
          ghlSync.pushFollowUp({
            ghlContactId: contactGhlId,
            scheduledFor: followUpDate,
            title: `Follow-up after ${outcomeLabel}`,
            description: notes || undefined,
            method: followUpMethod || "call",
          }).catch(() => {});
        }
      }
    } catch {
      toast.error("Failed to update appointment outcome.");
    }
  };

  // Stale count for summary badge
  const staleCount = useMemo(
    () => booked.filter((item) => item.scheduled_for && new Date(item.scheduled_for) < new Date() && !item.appointment_outcome).length,
    [booked],
  );

  const followUpHandoffCount = useMemo(
    () => completedBooked.filter((item) => item.appointment_outcome === "no_show" || item.appointment_outcome === "showed_verbal_commitment").length,
    [completedBooked],
  );

  const closedWonCount = useMemo(
    () => completedBooked.filter((item) => item.appointment_outcome === "showed_closed").length,
    [completedBooked],
  );

  const bookedMirrorStats = useMemo(() => {
    const linked = booked.filter((item) => !!item.ghl_opportunity_id).length;
    const fullyMapped = booked.filter(
      (item) =>
        !!item.ghl_opportunity_id &&
        !!item.ghl_pipeline_id &&
        !!item.ghl_stage_id,
    ).length;
    const onConfiguredBookedStage = booked.filter(
      (item) =>
        !!item.ghl_opportunity_id &&
        (!!defaultBookedPipeline?.id ? item.ghl_pipeline_id === defaultBookedPipeline.id : !!item.ghl_pipeline_id) &&
        (!!defaultBookedStage?.id ? item.ghl_stage_id === defaultBookedStage.id : !!item.ghl_stage_id),
    ).length;

    return {
      linked,
      fullyMapped,
      onConfiguredBookedStage,
      needsLink: booked.length - linked,
    };
  }, [booked, defaultBookedPipeline?.id, defaultBookedStage?.id]);

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
                <SelectItem value="showed_verbal_commitment">Verbal Commitment</SelectItem>
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
            sort={setterSort}
            onSortChange={(key) => handleHistorySortChange(setterSort, setSetterSort, key)}
          />
          <RepStatsTable
            title="Closers"
            description="Uses the rep currently assigned to the appointment when it was completed."
            stats={closerStats}
            sort={closerSort}
            onSortChange={(key) => handleHistorySortChange(closerSort, setCloserSort, key)}
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
                setterName={repMap.get(item.created_by) || "Unknown rep"}
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
            <p className="text-sm text-muted-foreground">Track booked days and final appointment results. Follow-ups are now managed in GHL tasks.</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span>{booked.length} booked{staleCount > 0 ? ` (${staleCount} stale)` : ""}</span>
            <span>{completedBooked.length} completed</span>
          </div>
        </div>

        <TwoPipelineGuide
          currentView="pipelines"
          bookedPipelineName={defaultBookedPipeline?.name ?? "Sales & Growth Sessions"}
          bookedStageName={defaultBookedStage?.name ?? undefined}
          followUpPipelineName={defaultFollowUpPipeline?.name ?? "Outbound Prospecting"}
          followUpStageName={defaultFollowUpStage?.name ?? "Follow Up"}
        />

        <PipelineMirrorCards
          bookedPipelineName={defaultBookedPipeline?.name ?? "Sales & Growth Sessions"}
          bookedStageName={defaultBookedStage?.name ?? "Booked Appointment"}
          bookedOpenCount={booked.length}
          bookedCompletedCount={completedBooked.length}
          bookedStaleCount={staleCount}
          followUpPipelineName={defaultFollowUpPipeline?.name ?? "Outbound Prospecting"}
          followUpStageName={defaultFollowUpStage?.name ?? "Follow Up"}
          followUpHandoffCount={followUpHandoffCount}
        />

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Booked queue</p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{booked.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {staleCount > 0
                ? `${staleCount} booked appointment${staleCount === 1 ? " needs" : "s need"} an outcome.`
                : "All open booked appointments have been reviewed so far."}
            </p>
          </div>
          <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
            <p className="text-[10px] uppercase tracking-widest text-sky-700">GHL mirror coverage</p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{bookedMirrorStats.onConfiguredBookedStage}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {bookedMirrorStats.fullyMapped} linked to an opportunity, {bookedMirrorStats.onConfiguredBookedStage} sitting on the configured booked pipeline and stage.
            </p>
            <p className="mt-3 text-[11px] font-mono text-muted-foreground">
              {bookedMirrorStats.needsLink} need GHL linking
            </p>
          </div>
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-[10px] uppercase tracking-widest text-primary">Follow-up handoffs</p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{followUpHandoffCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Completed booked outcomes that should continue in the follow-up task queue.
            </p>
            <Link to="/follow-ups" className="mt-3 inline-flex text-xs font-medium text-primary hover:underline">
              Open follow-ups
            </Link>
          </div>
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <p className="text-[10px] uppercase tracking-widest text-emerald-600">Closed from booked</p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{closedWonCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Completed booked appointments recorded as showed and closed.
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })}>
          <TabsList>
            <TabsTrigger value="booked">Booked</TabsTrigger>
            <TabsTrigger value="history">Completed</TabsTrigger>
          </TabsList>
          <TabsContent value="booked" className="mt-4 space-y-4">
            {bookedLoading ? (
              <div className="animate-pulse py-20 text-center text-sm font-mono text-muted-foreground">Loading...</div>
            ) : (
              <>
                <BookedPipelineBoard
                  items={booked}
                  repMap={repMap}
                  bookedPipelineName={defaultBookedPipeline?.name ?? "Sales & Growth Sessions"}
                  bookedEntryStageName={defaultBookedStage?.name ?? null}
                />
                <BookedAppointmentsTable
                  items={booked}
                  reps={reps}
                  repMap={repMap}
                  isSaving={updatePipelineItem.isPending}
                  onAssign={handleAssign}
                  onRecordOutcome={handleBookedOutcome}
                />
              </>
            )}
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            {renderHistory()}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
