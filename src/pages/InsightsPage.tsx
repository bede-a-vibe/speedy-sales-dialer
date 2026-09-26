import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { CallFunnelBody } from "@/pages/CallFunnelPage";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { getReportMetrics } from "@/lib/reportMetrics";
import { computeFunnel, filterFunnelLogs } from "@/lib/funnelMetrics";
import { InsightsOverview } from "@/components/insights/InsightsOverview";
import { InsightsTeam } from "@/components/insights/InsightsTeam";
import { InsightsTiming } from "@/components/insights/InsightsTiming";
import { InsightsTargets } from "@/components/insights/InsightsTargets";
import { FunnelDeepDives } from "@/components/insights/FunnelDeepDives";
import { LeadTrackerTab } from "@/components/analytics/LeadTrackerTab";
import { InsightsSources } from "@/components/insights/InsightsSources";

const ALL_REPS_VALUE = "all";

const TABS = ["overview", "funnel", "sources", "team", "talktime", "targets", "leads"] as const;
type InsightsTab = (typeof TABS)[number];

const TITLES: Record<InsightsTab, string> = {
  overview: "Insights · Overview",
  funnel: "Insights · Funnel",
  sources: "Insights · Sources",
  team: "Insights · Team",
  talktime: "Insights · Timing",
  targets: "Insights · Targets",
  leads: "Insights · Leads",
};

interface InsightsPageProps {
  defaultTab?: InsightsTab;
}

export default function InsightsPage({ defaultTab = "overview" }: InsightsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as InsightsTab | null;
  const activeTab: InsightsTab = useMemo(() => {
    if (urlTab && (TABS as readonly string[]).includes(urlTab)) return urlTab;
    return defaultTab;
  }, [urlTab, defaultTab]);

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  // ── ONE shared filter set + ONE data fetch for the whole Insights section ──
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedRepId, setSelectedRepId] = useState(ALL_REPS_VALUE);

  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookings = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();

  const { data: contactAttempts = [] } = useQuery({
    queryKey: ["contacts-attempt-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, call_attempt_count")
        .gt("call_attempt_count", 0);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const activeRepId = selectedRepId === ALL_REPS_VALUE ? undefined : selectedRepId;
  const selectedRepLabel =
    reps.find((rep) => rep.user_id === activeRepId)?.display_name ||
    reps.find((rep) => rep.user_id === activeRepId)?.email ||
    "Selected rep";

  const repNameMap = useMemo(
    () => new Map(reps.map((rep) => [rep.user_id, rep.display_name || rep.email || "Unnamed rep"])),
    [reps],
  );

  const metrics = useMemo(
    () => getReportMetrics({ callLogs, bookedItems: bookings, from: dateFrom, to: dateTo, repUserId: activeRepId, contacts: contactAttempts }),
    [activeRepId, bookings, callLogs, contactAttempts, dateFrom, dateTo],
  );
  const teamMetrics = useMemo(
    () => getReportMetrics({ callLogs, bookedItems: bookings, from: dateFrom, to: dateTo }),
    [bookings, callLogs, dateFrom, dateTo],
  );
  const funnel = useMemo(() => {
    const filtered = filterFunnelLogs(callLogs as never, { from: dateFrom, to: dateTo, repUserId: activeRepId });
    return computeFunnel(filtered);
  }, [callLogs, dateFrom, dateTo, activeRepId]);

  return (
    <AppLayout title={TITLES[activeTab]}>
      <div className="mx-auto max-w-7xl space-y-4">
        <ReportsToolbar
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          selectedRepId={selectedRepId}
          onSelectedRepIdChange={setSelectedRepId}
          reps={reps}
          allRepsValue={ALL_REPS_VALUE}
          isLoading={callsLoading || bookingsLoading || repsLoading}
        />

        <Tabs value={activeTab} onValueChange={handleChange}>
          <TabsList className="mb-4 h-auto flex-wrap gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="talktime">Timing</TabsTrigger>
            <TabsTrigger value="targets">Targets</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <InsightsOverview
              dateFrom={dateFrom}
              dateTo={dateTo}
              metrics={metrics}
              funnel={funnel}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
            />
          </TabsContent>

          <TabsContent value="funnel" className="space-y-5">
            <CallFunnelBody controlled={{ dateFrom, dateTo, selectedRepId }} />
            <FunnelDeepDives
              dateFrom={dateFrom}
              dateTo={dateTo}
              metrics={metrics}
              callLogs={callLogs}
              activeRepId={activeRepId}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
              repNameMap={repNameMap}
            />
          </TabsContent>

          <TabsContent value="sources">
            <InsightsSources dateFrom={dateFrom} dateTo={dateTo} />
          </TabsContent>

          <TabsContent value="team">
            <InsightsTeam
              callLogs={callLogs}
              bookings={bookings}
              reps={reps}
              dateFrom={dateFrom}
              dateTo={dateTo}
              activeRepId={activeRepId}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
              repNameMap={repNameMap}
            />
          </TabsContent>

          <TabsContent value="talktime">
            <InsightsTiming
              dateFrom={dateFrom}
              dateTo={dateTo}
              callLogs={callLogs}
              bookings={bookings}
              activeRepId={activeRepId}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
            />
          </TabsContent>

          <TabsContent value="targets">
            <InsightsTargets
              dateFrom={dateFrom}
              dateTo={dateTo}
              metrics={metrics}
              teamMetrics={teamMetrics}
              activeRepId={activeRepId}
              selectedRepLabel={selectedRepLabel}
              bookings={bookings}
            />
          </TabsContent>

          <TabsContent value="leads">
            <LeadTrackerTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
