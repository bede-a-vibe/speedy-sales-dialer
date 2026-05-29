import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnalyticsKpiTile } from "./AnalyticsKpiTile";
import { BookingHeatMap } from "@/components/reports/BookingHeatMap";
import { PickupHeatMap } from "@/components/reports/PickupHeatMap";
import { MetricBarList } from "@/components/reports/MetricBarList";
import { getBookingHeatMapData, getPickupHeatMapData } from "@/lib/hourlyMetrics";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import type { ReportMetrics } from "@/lib/reportMetrics";
import { formatDurationSeconds } from "@/lib/duration";
import { getDailyActivity } from "@/lib/analyticsMetrics";

interface Props {
  metrics: ReportMetrics;
  callLogs: any[];
  bookings: any[];
  from: string;
  to: string;
  repUserId?: string;
}

export function ActivityTab({ metrics, callLogs, bookings, from, to, repUserId }: Props) {
  const daily = useMemo(() => getDailyActivity(callLogs, bookings, from, to), [callLogs, bookings, from, to]);
  const heatMap = useMemo(() => getBookingHeatMapData(bookings as never, repUserId), [bookings, repUserId]);
  const pickupHeat = useMemo(() => getPickupHeatMapData(callLogs as never, repUserId), [callLogs, repUserId]);

  const outcomeItems = useMemo(
    () =>
      (Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((o) => ({
        label: OUTCOME_CONFIG[o].label,
        count: metrics.outcomeCounts[o],
        pct: metrics.dialer.dials > 0 ? Math.round((metrics.outcomeCounts[o] / metrics.dialer.dials) * 100) : 0,
        toneClassName: OUTCOME_CONFIG[o].bgClass,
      })),
    [metrics],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AnalyticsKpiTile label="Total Dials" value={metrics.dialer.dials} accent="primary" />
        <AnalyticsKpiTile label="Talk Time" value={formatDurationSeconds(metrics.dialer.totalTalkTimeSeconds)} sublabel={`avg ${formatDurationSeconds(metrics.dialer.averageTalkTimePerDialSeconds)}/dial`} />
        <AnalyticsKpiTile label="Pickup %" value={`${metrics.dialer.pickUpRate}%`} sublabel={`${metrics.dialer.pickUps.toLocaleString()} pickups`} />
        <AnalyticsKpiTile label="Voicemails" value={metrics.outcomeCounts.voicemail} />
        <AnalyticsKpiTile label="No Answer" value={metrics.outcomeCounts.no_answer} />
        <AnalyticsKpiTile label="Hung Up Fast" value={metrics.dialer.immediateHangUps} accent="warning" sublabel={`${metrics.dialer.immediateHangUpRate}% of dials`} />
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Daily Activity</h3>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={daily} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="dials" fill="hsl(var(--primary))" />
              <Bar dataKey="conversations" fill="#3b82f6" />
              <Bar dataKey="bookings" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Call Outcomes</h3>
          <MetricBarList items={outcomeItems} emptyLabel="No call outcomes in this date range." />
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Pickup Heat Map</h3>
          <PickupHeatMap cells={pickupHeat} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Booking Heat Map</h3>
        <BookingHeatMap cells={heatMap} />
      </div>
    </div>
  );
}
