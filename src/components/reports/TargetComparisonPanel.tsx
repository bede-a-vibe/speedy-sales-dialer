import { useMemo } from "react";
import { ReportSection } from "@/components/reports/ReportSection";
import { TargetSection } from "@/components/targets/TargetSection";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import {
  buildRolledUpIndividualTargets,
  buildTargetProgressItems,
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

  const teamTargets = useMemo(
    () => targets.filter((target) => target.scope_type === "team" && target.period_type === periodType),
    [periodType, targets],
  );

  const rolledUpIndividualTargets = useMemo(
    () => buildRolledUpIndividualTargets(targets, periodType),
    [periodType, targets],
  );

  const individualTargets = useMemo(
    () =>
      targets.filter(
        (target) =>
          target.scope_type === "individual" &&
          target.period_type === periodType &&
          target.user_id === activeRepId,
      ),
    [activeRepId, periodType, targets],
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
              description="Manual team goals for the same period, using team-wide actuals."
              items={buildTargetProgressItems(teamTargets, getPerformanceActualMetrics(teamMetrics))}
            />
          </>
        ) : (
          <>
            <TargetSection
              title="Manual Team Targets"
              description="Admin-set team targets for this reporting period."
              items={buildTargetProgressItems(teamTargets, getPerformanceActualMetrics(teamMetrics))}
            />
            <TargetSection
              title="Rolled-Up Individual Targets"
              description="Count goals are summed across reps; show-up rate goals are averaged."
              items={buildTargetProgressItems(rolledUpIndividualTargets, getPerformanceActualMetrics(teamMetrics))}
            />
          </>
        )}
      </div>
    </ReportSection>
  );
}
