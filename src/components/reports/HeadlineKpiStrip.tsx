import { StatCard } from "@/components/StatCard";
import { formatDurationSeconds } from "@/lib/duration";
import type { ReportMetrics } from "@/lib/reportMetrics";

interface HeadlineKpiStripProps {
  metrics: ReportMetrics;
}

export function HeadlineKpiStrip({ metrics }: HeadlineKpiStripProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard compact label="Dials" value={metrics.dialer.dials} />
      <StatCard compact label="Pick Ups" value={metrics.dialer.pickUps} />
      <StatCard compact label="Pick Up Rate" value={`${metrics.dialer.pickUpRate}%`} />
      <StatCard compact label="Talk Time" value={formatDurationSeconds(metrics.dialer.totalTalkTimeSeconds)} />
      <StatCard
        compact
        label="Avg Talk / Pickup"
        value={formatDurationSeconds(metrics.dialer.averageTalkTimePerPickupSeconds)}
      />
      <StatCard
        compact
        label="Immediate Hang-Ups"
        value={metrics.dialer.immediateHangUps}
        subtext={`${metrics.dialer.immediateHangUpRate}% of dials`}
      />
    </div>
  );
}