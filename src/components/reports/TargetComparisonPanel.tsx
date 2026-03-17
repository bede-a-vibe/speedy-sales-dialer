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

  const repActuals = getPerformanceActualMetrics(metrics);
  const teamActuals = getPerformanceActualMetrics(teamMetrics);

  return (
    <ReportSection
      title="Target Comparison"
      description={getTargetPeriodDescription(periodType)}
    >
      <div className="space-y-4">
        {activeRepId ? (
          <>
            <TargetSection
              title={`${selectedRepLabel} — Setter Targets`}
              description="Setter goal progress for the selected rep."
              items={buildTargetProgressItems(individualTargets, repActuals, "setter")}
            />
            <TargetSection
              title={`${selectedRepLabel} — Closer Targets`}
              description="Closer goal progress for the selected rep."
              items={buildTargetProgressItems(individualTargets, repActuals, "closer")}
            />
            <TargetSection
              title="Team Context — Setter"
              description="Auto-calculated team setter goals."
              items={buildTargetProgressItems(teamTargets, teamActuals, "setter")}
            />
            <TargetSection
              title="Team Context — Closer"
              description="Auto-calculated team closer goals."
              items={buildTargetProgressItems(teamTargets, teamActuals, "closer")}
            />
          </>
        ) : (
          <>
            <TargetSection
              title="Team Targets — Setter"
              description="Auto-calculated from all individual setter targets."
              items={buildTargetProgressItems(teamTargets, teamActuals, "setter")}
            />
            <TargetSection
              title="Team Targets — Closer"
              description="Auto-calculated from all individual closer targets."
              items={buildTargetProgressItems(teamTargets, teamActuals, "closer")}
            />
          </>
        )}
      </div>
    </ReportSection>
  );
}
