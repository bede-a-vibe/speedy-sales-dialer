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
import { useBookedAppointmentsByDateRange, useRescheduleSlotsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { getReportMetrics, shiftDateKey, todayDateKey } from "@/lib/reportMetrics";
import { computeFunnel, filterFunnelLogs } from "@/lib/funnelMetrics";
import { InsightsOverview } from "@/components/insights/InsightsOverview";
import { InsightsTeam } from "@/components/insights/InsightsTeam";
import { InsightsTiming } from "@/components/insights/InsightsTiming";
import { ClosingTracker } from "@/components/insights/ClosingTracker";
import { FunnelTracker } from "@/components/insights/FunnelTracker";
import { SetterTracker } from "@/components/insights/SetterTracker";
import { trackerDefaultFrom } from "@/lib/funnelTracker";
import { FunnelDeepDives } from "@/components/insights/FunnelDeepDives";
import { InsightsFunnel, ALL_SOURCES } from "@/components/insights/InsightsFunnel";
import { channelSlug, filterBookingsBySource } from "@/lib/sourceFunnelTotals";
import { useNewClients } from "@/hooks/useNewClients";

const ALL_REPS_VALUE = "all";

const TABS = ["overview", "funnel", "setters", "closing", "tracker"] as const;
type InsightsTab = (typeof TABS)[number];

/** Setters holds three views (18 Nov 2026): the setter tracker, Team and Timing. */
const SETTER_VIEWS = ["tracker", "team", "timing"] as const;
type SetterView = (typeof SETTER_VIEWS)[number];

const TITLES: Record<InsightsTab, string> = {
  overview: "Insights · Overview",
  funnel: "Insights · Funnel",
  setters: "Insights · Setters",
  closing: "Insights · Closing",
  tracker: "Insights · Tracker",
};
const SETTER_TITLES: Record<SetterView, string> = {
  tracker: "Insights · Setters",
  team: "Insights · Setters · Team",
  timing: "Insights · Setters · Timing",
};

/** Tabs folded into others (3 Nov and 18 Nov 2026). Old links land on the new home. */
const LEGACY_TABS: Record<string, { tab: InsightsTab; source?: string; view?: SetterView }> = {
  sources: { tab: "overview" },
  leads: { tab: "overview" },
  ads: { tab: "funnel", source: "ads" },
  team: { tab: "setters", view: "team" },
  talktime: { tab: "setters", view: "timing" },
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

  const urlView = searchParams.get("view");
  const setterView: SetterView = (SETTER_VIEWS as readonly string[]).includes(urlView ?? "") ? (urlView as SetterView) : "tracker";
  const handleSetterViewChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "setters");
    if (value === "tracker") next.delete("view");
    else next.set("view", value);
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
    if (legacy.view) next.set("view", legacy.view);
    setSearchParams(next, { replace: true });
  }, [urlTab, searchParams, setSearchParams]);

  // ── ONE shared filter set + ONE data fetch for the whole Insights section ──
  // Local (Melbourne) dates. toISOString() is the UTC date: before 11am AEDT it
  // made "today" yesterday and left this morning's dials out of the default range.
  const today = todayDateKey();
  const thirtyDaysAgo = shiftDateKey(today, -30);
  // Opening straight on the Tracker starts on its year-so-far range. Starting
  // on 30 days and switching after the first render loaded the call logs,
  // bookings and reschedules twice (19 Nov).
  const [dateFrom, setDateFrom] = useState(() => (activeTab === "tracker" ? trackerDefaultFrom(today) : thirtyDaysAgo));
  const [dateTo, setDateTo] = useState(today);
  const [selectedRepId, setSelectedRepId] = useState(ALL_REPS_VALUE);

  // The Tracker stacks months like the sheet: opening it on the untouched
  // default range switches the page to the year so far (1 Jan, or the first
  // month with data if later, to today). A range picked by hand stays.
  useEffect(() => {
    if (activeTab !== "tracker") return;
    if (dateFrom === thirtyDaysAgo && dateTo === today) setDateFrom(trackerDefaultFrom(today));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const { data: callLogs = [], isLoading: callsLoading, isError: callsError, refetch: refetchCalls } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookings = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);
  const { data: rescheduleSlots = [] } = useRescheduleSlotsByDateRange(dateFrom, dateTo);
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
    () => getReportMetrics({ callLogs, bookedItems: bookings, rescheduleSlots, from: dateFrom, to: dateTo, repUserId: activeRepId, contacts: contactAttempts }),
    [activeRepId, bookings, callLogs, contactAttempts, dateFrom, dateTo, rescheduleSlots],
  );
  // The Funnel tab's lead source picker also filters the call funnel's meeting
  // stages and the deep dives. Other tabs keep every source.
  const sourceBookings = useMemo(() => filterBookingsBySource(bookings, source, ALL_SOURCES), [bookings, source]);
  const sourceSlots = useMemo(() => filterBookingsBySource(rescheduleSlots, source, ALL_SOURCES), [rescheduleSlots, source]);
  const funnelMetrics = useMemo(
    () => source === ALL_SOURCES
      ? metrics
      : getReportMetrics({ callLogs, bookedItems: sourceBookings, rescheduleSlots: sourceSlots, from: dateFrom, to: dateTo, repUserId: activeRepId, contacts: contactAttempts }),
    [source, metrics, callLogs, sourceBookings, sourceSlots, dateFrom, dateTo, activeRepId, contactAttempts],
  );
  // One "won" rule: new clients in the revenue records, by lead source.
  const { data: newClients = [] } = useNewClients(dateFrom, dateTo);
  const winsAll = useMemo(() => ({ count: newClients.length }), [newClients]);
  const winsForSource = useMemo(
    () => ({ count: source === ALL_SOURCES ? newClients.length : newClients.filter((n) => channelSlug(n.channel || "Unattributed") === source).length }),
    [newClients, source],
  );
  const teamMetrics = useMemo(
    () => getReportMetrics({ callLogs, bookedItems: bookings, rescheduleSlots, from: dateFrom, to: dateTo }),
    [bookings, callLogs, dateFrom, dateTo, rescheduleSlots],
  );
  const funnel = useMemo(() => {
    const filtered = filterFunnelLogs(callLogs as never, { from: dateFrom, to: dateTo, repUserId: activeRepId });
    return computeFunnel(filtered);
  }, [callLogs, dateFrom, dateTo, activeRepId]);

  return (
    <AppLayout title={activeTab === "setters" ? SETTER_TITLES[setterView] : TITLES[activeTab]}>
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

        {callsError ? (
          <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            <span>Call data didn't load for this range, so dial and pick-up numbers below are not real zeros.</span>
            <button type="button" className="underline" onClick={() => refetchCalls()}>Try again</button>
          </div>
        ) : callsLoading ? (
          <p className="mb-4 text-xs text-muted-foreground">Loading call data for this range. Long ranges take a few seconds; dial numbers read 0 until it lands.</p>
        ) : null}

        <Tabs value={activeTab} onValueChange={handleChange}>
          <TabsList className="mb-4 h-auto flex-wrap gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            <TabsTrigger value="setters">Setters</TabsTrigger>
            <TabsTrigger value="closing">Closing</TabsTrigger>
            <TabsTrigger value="tracker">Tracker</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <InsightsOverview
              dateFrom={dateFrom}
              dateTo={dateTo}
              metrics={metrics}
              funnel={funnel}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
              wins={activeRepId ? null : winsAll}
            />
          </TabsContent>

          <TabsContent value="funnel">
            <InsightsFunnel
              dateFrom={dateFrom}
              dateTo={dateTo}
              source={source}
              onSourceChange={handleSourceChange}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
              coldCallDetail={
                <div className="space-y-5">
                  <CallFunnelBody controlled={{ dateFrom, dateTo, selectedRepId, source, wins: activeRepId ? null : winsForSource }} />
                  <FunnelDeepDives
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    metrics={funnelMetrics}
                    callLogs={callLogs}
                    activeRepId={activeRepId}
                    selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
                    repNameMap={repNameMap}
                  />
                </div>
              }
            />
          </TabsContent>

          <TabsContent value="setters">
            <Tabs value={setterView} onValueChange={handleSetterViewChange}>
              <TabsList className="mb-4 h-auto flex-wrap gap-1" aria-label="Setter views">
                <TabsTrigger value="tracker">Setter tracker</TabsTrigger>
                <TabsTrigger value="team">Team</TabsTrigger>
                <TabsTrigger value="timing">Timing</TabsTrigger>
              </TabsList>
              <TabsContent value="tracker">
                <SetterTracker
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  callLogs={callLogs}
                  bookings={bookings}
                  rescheduleSlots={rescheduleSlots}
                  reps={reps}
                  activeRepId={activeRepId}
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
              <TabsContent value="timing">
                <InsightsTiming
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  callLogs={callLogs}
                  bookings={bookings}
                  rescheduleSlots={rescheduleSlots}
                  activeRepId={activeRepId}
                  selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>



          <TabsContent value="closing">
            <ClosingTracker
              dateFrom={dateFrom}
              dateTo={dateTo}
              bookings={bookings}
              rescheduleSlots={rescheduleSlots}
              activeRepId={activeRepId}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
            />
          </TabsContent>

          <TabsContent value="tracker">
            <FunnelTracker
              dateFrom={dateFrom}
              dateTo={dateTo}
              callLogs={callLogs}
              bookings={bookings}
              rescheduleSlots={rescheduleSlots}
              reps={reps}
              activeRepId={activeRepId}
              selectedRepLabel={activeRepId ? selectedRepLabel : undefined}
            />
          </TabsContent>



        </Tabs>
      </div>
    </AppLayout>
  );
}
