import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AppLayout } from "@/components/AppLayout";
import { ReportsToolbar } from "@/components/reports/ReportsToolbar";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useSalesReps } from "@/hooks/usePipelineItems";
import { getReportMetrics } from "@/lib/reportMetrics";
import { computeFunnel, filterFunnelLogs } from "@/lib/funnelMetrics";
import { SummaryTab } from "@/components/analytics/SummaryTab";
import { ActivityTab } from "@/components/analytics/ActivityTab";
import { FunnelTab } from "@/components/analytics/FunnelTab";
import { RepPerformanceTab } from "@/components/analytics/RepPerformanceTab";
import { SourcesTab } from "@/components/analytics/SourcesTab";
import { ForecastingTab } from "@/components/analytics/ForecastingTab";
import { LeadTrackerTab } from "@/components/analytics/LeadTrackerTab";

const ALL_REPS = "all";

interface AnalyticsBodyProps {
  initialTab?: string;
}

export function AnalyticsBody({ initialTab }: AnalyticsBodyProps = {}) {
  const today = new Date().toISOString().split("T")[0];
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [dateFrom, setDateFrom] = useState(thirtyAgo);
  const [dateTo, setDateTo] = useState(today);
  const [repId, setRepId] = useState(ALL_REPS);
  const [tab, setTab] = useState(initialTab ?? "summary");

  const { data: callLogs = [], isLoading: callsLoading } = useCallLogsByDateRange(dateFrom, dateTo);
  const { data: bookings = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(dateFrom, dateTo);
  const { data: reps = [], isLoading: repsLoading } = useSalesReps();

  const activeRepId = repId === ALL_REPS ? undefined : repId;

  const metrics = useMemo(
    () => getReportMetrics({ callLogs: callLogs as never, bookedItems: bookings as never, from: dateFrom, to: dateTo, repUserId: activeRepId }),
    [callLogs, bookings, dateFrom, dateTo, activeRepId],
  );

  const funnel = useMemo(() => {
    const filtered = filterFunnelLogs(callLogs as never, { from: dateFrom, to: dateTo, repUserId: activeRepId });
    return computeFunnel(filtered);
  }, [callLogs, dateFrom, dateTo, activeRepId]);

  const rangeDays = useMemo(() => {
    const a = new Date(dateFrom).getTime();
    const b = new Date(dateTo).getTime();
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  }, [dateFrom, dateTo]);

  const openBookings = useMemo(
    () => (bookings as any[]).filter((b) => !b.appointment_outcome && b.status === "open"),
    [bookings],
  );
  const openBookingsValue = useMemo(
    () => openBookings.reduce((s, b) => s + Number(b.deal_value ?? 0) + Number(b.monthly_recurring_value ?? 0) * 12, 0),
    [openBookings],
  );

  return (
    <>
      <ReportsToolbar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        selectedRepId={repId}
        onSelectedRepIdChange={setRepId}
        reps={reps}
        allRepsValue={ALL_REPS}
        isLoading={callsLoading || bookingsLoading || repsLoading}
      />

      <div className="mx-auto max-w-7xl pt-5">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 h-auto flex-wrap gap-1">
            <TabsTrigger value="summary" className="text-xs sm:text-sm">Summary</TabsTrigger>
            <TabsTrigger value="activity" className="text-xs sm:text-sm">Activity</TabsTrigger>
            <TabsTrigger value="funnel" className="text-xs sm:text-sm">Funnel</TabsTrigger>
            <TabsTrigger value="reps" className="text-xs sm:text-sm">Rep Performance</TabsTrigger>
            <TabsTrigger value="sources" className="text-xs sm:text-sm">Sources</TabsTrigger>
            <TabsTrigger value="forecast" className="text-xs sm:text-sm">Forecasting</TabsTrigger>
            <TabsTrigger value="leads" className="text-xs sm:text-sm">Lead Tracker</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <SummaryTab metrics={metrics} funnel={funnel} callLogs={callLogs as any} bookings={bookings as any} from={dateFrom} to={dateTo} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityTab metrics={metrics} callLogs={callLogs as any} bookings={bookings as any} from={dateFrom} to={dateTo} repUserId={activeRepId} />
          </TabsContent>
          <TabsContent value="funnel">
            <FunnelTab metrics={metrics} funnel={funnel} callLogs={callLogs as any} bookings={bookings as any} from={dateFrom} to={dateTo} />
          </TabsContent>
          <TabsContent value="reps">
            <RepPerformanceTab callLogs={callLogs as any} bookings={bookings as any} reps={reps} from={dateFrom} to={dateTo} />
          </TabsContent>
          <TabsContent value="sources">
            <SourcesTab callLogs={callLogs as any} bookings={bookings as any} from={dateFrom} to={dateTo} />
          </TabsContent>
          <TabsContent value="forecast">
            <ForecastingTab metrics={metrics} rangeDays={rangeDays} openBookingsCount={openBookings.length} openBookingsValue={openBookingsValue} />
          </TabsContent>
          <TabsContent value="leads">
            <LeadTrackerTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <AppLayout title="Analytics">
      <AnalyticsBody />
    </AppLayout>
  );
}
