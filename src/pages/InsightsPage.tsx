import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { CallFunnelBody } from "@/pages/CallFunnelPage";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useContactAttemptCounts } from "@/hooks/useContactAttemptCounts";
import { useBookedAppointmentsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { getReportMetrics } from "@/lib/reportMetrics";
import { computeFunnel, filterFunnelLogs } from "@/lib/funnelMetrics";
import { InsightsOverview } from "@/components/insights/InsightsOverview";
import { InsightsTeam } from "@/components/insights/InsightsTeam";
import { InsightsTiming } from "@/components/insights/InsightsTiming";
import { ClosingTracker } from "@/components/insights/ClosingTracker";
import { FunnelDeepDives } from "@/components/insights/FunnelDeepDives";
import { InsightsFunnel, ALL_SOURCES } from "@/components/insights/InsightsFunnel";

const ALL_REPS_VALUE = "all";

const TABS = ["overview", "funnel", "closing", "team", "talktime"] as const;
type InsightsTab = (typeof TABS)[number];

const TITLES: Record<InsightsTab, string> = {
  overview: "Insights · Overview",
  funnel: "Insights · Funnel",
  closing: "Insights · Closing",
  team: "Insights · Team",
  talktime: "Insights · Timing",
};

/** Tabs that were folded into others on 3 Nov 2026. Old links land on the new home. */
const LEGACY_TABS: Record<string, { tab: InsightsTab; source?: string }> = {
  sources: { tab: "overview" },
  leads: { tab: "overview" },
  ads: { tab: "funnel", source: "ads" },
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

  const source = searchParams.get("source") || ALL_SOURCES;
  const handleSourceChange = (slug: string) => {
    const next = new URLSearchParams(searchParams);
    if (slug === ALL_SOURCES) next.delete("source");
    else next.set("source", slug);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const legacy = urlTab ? LEGACY_TABS[urlTab] : undefined;
    if (!legacy) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", legacy.tab);
    if (legacy.source) next.set("source", legacy.source);
    setSearchParams(next, { replace: true });
  }, [urlTab, searchParams, setSearchParams]);

  // ── ONE shared filter set + ONE data fetch for the whole Insights section ──
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [selectedRepId, setSelectedRepId] = useState(ALL_REPS_VALUE);

  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookings = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();

  const { data: contactAttempts = [] } = useContactAttemptCounts();

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
            <TabsTrigger value="closing">Closing</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="talktime">Timing</TabsTrigger>
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

          <TabsContent value="funnel">
            <InsightsFunnel
              dateFrom={dateFrom}
              dateTo={dateTo}
              source={source}
              onSourceChange={handleSourceChange}
              coldCallDetail={
                <div className="space-y-5">
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
                </div>
              }
            />
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

          <TabsContent value="closing">
            <ClosingTracker
              dateFrom={dateFrom}
              dateTo={dateTo}
              bookings={bookings}
              activeRepId={activeRepId}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
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

        </Tabs>
      </div>
    </AppLayout>
  );
}
