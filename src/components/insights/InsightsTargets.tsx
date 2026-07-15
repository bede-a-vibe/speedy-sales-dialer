import { useMemo } from "react";
import { ReportSection } from "@/components/reports/ReportSection";
import { TargetComparisonPanel } from "@/components/reports/TargetComparisonPanel";
import { ForecastingTab } from "@/components/analytics/ForecastingTab";
import { TargetsBody } from "@/pages/TargetsPage";
import type { ReportMetrics } from "@/lib/reportMetrics";

interface Props {
  dateFrom: string;
  dateTo: string;
  metrics: ReportMetrics;
  teamMetrics: ReportMetrics;
  activeRepId?: string;
  selectedRepLabel: string;
  bookings: any[];
}

/**
 * Insights → Targets: progress vs targets, forecasting, and target config —
 * everything target-shaped on exactly one tab.
 */
export function InsightsTargets({ dateFrom, dateTo, metrics, teamMetrics, activeRepId, selectedRepLabel, bookings }: Props) {
  const rangeDays = useMemo(() => {
    const a = new Date(dateFrom).getTime();
    const b = new Date(dateTo).getTime();
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  }, [dateFrom, dateTo]);

  const openBookings = useMemo(
    () => bookings.filter((b) => !b.appointment_outcome && b.status === "open"),
    [bookings],
  );
  const openBookingsValue = useMemo(
    () => openBookings.reduce((s, b) => s + Number(b.deal_value ?? 0) + Number(b.monthly_recurring_value ?? 0) * 12, 0),
    [openBookings],
  );

  return (
    <div className="space-y-5">
      <TargetComparisonPanel
        activeRepId={activeRepId}
        selectedRepLabel={selectedRepLabel}
        dateFrom={dateFrom}
        dateTo={dateTo}
        metrics={metrics}
        teamMetrics={teamMetrics}
      />

      <ReportSection
        title="Forecasting"
        description="Forward projection from current pace + open pipeline."
        collapsible
        defaultOpen={false}
      >
        <ForecastingTab
          metrics={metrics}
          rangeDays={rangeDays}
          openBookingsCount={openBookings.length}
          openBookingsValue={openBookingsValue}
        />
      </ReportSection>

      <TargetsBody />
    </div>
  );
}
