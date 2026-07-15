import { BarChart3 } from "lucide-react";
import { ReportSection } from "@/components/reports/ReportSection";
import { HeadlineKpiStrip } from "@/components/reports/HeadlineKpiStrip";
import { SalesEfficiencyPanel } from "@/components/reports/SalesEfficiencyPanel";
import { DailyVolumeChart } from "@/components/reports/DailyVolumeChart";
import { EndToEndFunnel } from "@/components/funnel/EndToEndFunnel";
import { ClientRevenueSummary } from "@/components/insights/ClientRevenueSummary";
import { DialEconomicsCard } from "@/components/insights/DialEconomicsCard";
import type { ReportMetrics } from "@/lib/reportMetrics";
import type { FunnelMetrics } from "@/lib/funnelMetrics";

interface Props {
  dateFrom: string;
  dateTo: string;
  metrics: ReportMetrics;
  funnel: FunnelMetrics;
  selectedRepLabel?: string;
}

/**
 * Insights → Overview: a true at-a-glance summary.
 * Revenue + dial economics + one KPI strip + one funnel + one volume chart.
 * Deep dives live on the other tabs.
 */
export function InsightsOverview({ dateFrom, dateTo, metrics, funnel, selectedRepLabel }: Props) {
  return (
    <div className="space-y-5">
      <ClientRevenueSummary />
      <DialEconomicsCard dateFrom={dateFrom} dateTo={dateTo} />
      <HeadlineKpiStrip metrics={metrics} />

      <ReportSection
        title="End-to-End Funnel"
        description="Dial → conversation → booking → close for the selected range. Full breakdowns live on the Funnel tab."
      >
        <EndToEndFunnel metrics={metrics} funnel={funnel} />
      </ReportSection>

      <ReportSection
        title="Daily Call Volume"
        description="Total dials per day across the selected range."
        collapsible
      >
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Dials per Day</h3>
          </div>
          <DailyVolumeChart data={metrics.dailyVolume} />
        </div>
      </ReportSection>

      <ReportSection
        title="Sales Efficiency"
        description={`Dial → sale economics${selectedRepLabel ? ` for ${selectedRepLabel}` : " across the team"}, at 3/6/9/12-month client-lifetime horizons.`}
        collapsible
        defaultOpen={false}
      >
        <SalesEfficiencyPanel metrics={metrics} />
      </ReportSection>
    </div>
  );
}
