import { useMemo } from "react";
import { ReportSection } from "@/components/reports/ReportSection";
import { TargetSection } from "@/components/targets/TargetSection";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import {
  buildTargetProgressItems,
  deriveAllTargets,
  getPerformanceActualMetrics,
  getTargetPeriodDescription,
  getTargetPeriodForDateRange,
} from "@/lib/performanceTargets";
import type { ReportMetrics } from "@/lib/reportMetrics";

interface TargetComparisonPanelProps {
  activeRepId?: string;
  selectedRepLabel: string;
  dateFrom: string;
  dateTo: string;
  metrics: ReportMetrics;
  teamMetrics: ReportMetrics;
}

export function TargetComparisonPanel({
  activeRepId,
  selectedRepLabel,
  dateFrom,
  dateTo,
  metrics,
  teamMetrics,
}: TargetComparisonPanelProps) {
  const { data: targets = [], isLoading } = usePerformanceTargets();
  const periodType = getTargetPeriodForDateRange(dateFrom, dateTo);

  const derived = useMemo(() => deriveAllTargets(targets), [targets]);

  const individualTargets = useMemo(
    () =>
      (periodType === "daily" ? derived.individualDaily : derived.individualWeekly).filter(
        (t) => t.user_id === activeRepId,
      ),
    [activeRepId, derived, periodType],
  );

  const teamTargets = useMemo(
    () => (periodType === "daily" ? derived.teamDaily : derived.teamWeekly),
    [derived, periodType],
  );

  if (isLoading) {
    return (
      <ReportSection title="Target Comparison" description="Loading target comparison…">
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground animate-pulse">
          Loading targets…
        </div>
      </ReportSection>
    );
  }

  return (
    <ReportSection
      title="Target Comparison"
      description={getTargetPeriodDescription(periodType)}
    >
      <div className="space-y-4">
        {activeRepId ? (
          <>
            <TargetSection
              title={`${selectedRepLabel} Targets`}
              description="Individual goal progress for the selected rep in this report range."
              items={buildTargetProgressItems(individualTargets, getPerformanceActualMetrics(metrics))}
            />
            <TargetSection
              title="Team Context"
              description="Auto-calculated team goals (sum of all reps, rates averaged)."
              items={buildTargetProgressItems(teamTargets, getPerformanceActualMetrics(teamMetrics))}
            />
          </>
        ) : (
          <TargetSection
            title="Team Targets"
            description="Auto-calculated from all individual targets (sum for counts, average for rates)."
            items={buildTargetProgressItems(teamTargets, getPerformanceActualMetrics(teamMetrics))}
          />
        )}
      </div>
    </ReportSection>
  );
}
