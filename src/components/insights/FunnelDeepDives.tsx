import { useMemo } from "react";
import { PhoneCall } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { ReportSection } from "@/components/reports/ReportSection";
import { MetricBarList } from "@/components/reports/MetricBarList";
import { ConversationFunnelPanel } from "@/components/reports/ConversationFunnelPanel";
import { OutboundDiagnosticPanel } from "@/components/reports/OutboundDiagnosticPanel";
import { OUTCOME_CONFIG, type CallOutcome } from "@/data/mockData";
import { formatDurationSeconds } from "@/lib/duration";
import type { ReportMetrics } from "@/lib/reportMetrics";

interface Props {
  dateFrom: string;
  dateTo: string;
  metrics: ReportMetrics;
  callLogs: any[];
  activeRepId?: string;
  selectedRepLabel?: string;
  repNameMap: Map<string, string>;
}

/**
 * Deep-dive sections under the Funnel tab (re-homed from the old Reports page):
 * conversation-stage funnel, bookings made, SOP outbound diagnostics.
 */
export function FunnelDeepDives({ dateFrom, dateTo, metrics, callLogs, activeRepId, selectedRepLabel, repNameMap }: Props) {
  const callOutcomeItems = useMemo(
    () =>
      (Object.keys(OUTCOME_CONFIG) as CallOutcome[]).map((outcome) => ({
        label: OUTCOME_CONFIG[outcome].label,
        count: metrics.outcomeCounts[outcome],
        pct: metrics.dialer.dials > 0 ? Math.round((metrics.outcomeCounts[outcome] / metrics.dialer.dials) * 100) : 0,
        toneClassName: OUTCOME_CONFIG[outcome].bgClass,
      })),
    [metrics],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <ReportSection
        title="Conversation Funnel"
        description={`Manual cold-call funnel tagged by reps — where conversations break down${activeRepId ? ` for ${selectedRepLabel}` : " across the team"}.`}
        collapsible
        defaultOpen={false}
      >
        <ConversationFunnelPanel
          callLogs={callLogs as never}
          from={dateFrom}
          to={dateTo}
          repUserId={activeRepId}
          repLabel={activeRepId ? selectedRepLabel : undefined}
          repNameMap={repNameMap}
        />
      </ReportSection>

      <ReportSection
        title="Bookings Made"
        description={`Bookings created from outbound activity${activeRepId ? ` (${selectedRepLabel})` : ""} in the selected range.`}
        collapsible
        defaultOpen={false}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard compact label="Total Bookings Made" value={metrics.bookingsMade.totalBookingsMade} />
          <StatCard compact label="Rebooked" value={metrics.bookingsMade.rebooked} />
          <StatCard compact label="New Bookings" value={metrics.bookingsMade.newBookings} />
          <StatCard compact label="Pick Ups to Booking %" value={`${metrics.bookingsMade.pickUpsToBookingRate}%`} subtext="bookings / pick ups" />
          <StatCard compact label="Same Day / Next Day %" value={`${metrics.bookingsMade.sameDayNextDayRate}%`} subtext="same/next day / bookings" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Same Day / Next Day Bookings</p>
            <p className="mt-2 font-mono text-3xl font-bold text-foreground">{metrics.bookingsMade.sameDayNextDayBookings}</p>
            <p className="mt-1 text-xs text-muted-foreground">Bookings scheduled for the same day or next day after they were created.</p>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-4 flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-primary" />
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Call Outcome Breakdown</h3>
            </div>
            <MetricBarList items={callOutcomeItems} emptyLabel="No call outcomes in this date range." />
          </div>
        </div>
      </ReportSection>

      <ReportSection
        title="Outbound Data Review (SOP)"
        description="Pickup → contact → dial efficiency → lead penetration → duration → rep flags."
        collapsible
        defaultOpen={false}
      >
        <OutboundDiagnosticPanel
          diagnostic={metrics.outboundDiagnostic}
          pickUpRate={metrics.dialer.pickUpRate}
          repNameMap={repNameMap}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard compact label="Unique Leads Dialed" value={metrics.dialer.uniqueLeadsDialed} />
          <StatCard compact label="# of Call Backs" value={metrics.dialer.callBacks} />
          <StatCard compact label="Pick Up to FU %" value={`${metrics.dialer.pickUpToFollowUpRate}%`} subtext="follow ups / pick ups" />
          <StatCard compact label="Avg Talk / Dial" value={formatDurationSeconds(metrics.dialer.averageTalkTimePerDialSeconds)} />
        </div>
      </ReportSection>
    </div>
  );
}
