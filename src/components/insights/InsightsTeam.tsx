import { useMemo } from "react";
import { ReportSection } from "@/components/reports/ReportSection";
import { RepPerformanceTab } from "@/components/analytics/RepPerformanceTab";
import { RepCoachingPanel } from "@/components/reports/RepCoachingPanel";
import { TeamCoachingPanel } from "@/components/insights/TeamCoachingPanel";
import { computeAllRepScorecards, computeRepCoachingScorecard } from "@/lib/repCoachingMetrics";

interface Props {
  callLogs: any[];
  bookings: any[];
  reps: { user_id: string; display_name: string | null; email: string | null }[];
  dateFrom: string;
  dateTo: string;
  activeRepId?: string;
  selectedRepLabel?: string;
  repNameMap: Map<string, string>;
}

/**
 * Insights → Team: ONE sortable leaderboard + ONE coaching section.
 * (Previously two overlapping leaderboards + three coaching surfaces across tabs.)
 */
export function InsightsTeam({ callLogs, bookings, reps, dateFrom, dateTo, activeRepId, selectedRepLabel, repNameMap }: Props) {
  const repScorecards = useMemo(() => {
    if (activeRepId) {
      return [computeRepCoachingScorecard(activeRepId, callLogs as never, bookings)];
    }
    const repIds = Array.from(
      new Set([
        ...callLogs.map((l) => l.user_id).filter(Boolean),
        ...bookings.map((b) => b.created_by).filter(Boolean),
      ]),
    );
    return computeAllRepScorecards(repIds, callLogs as never, bookings);
  }, [activeRepId, callLogs, bookings]);

  return (
    <div className="space-y-5">
      <ReportSection
        title="Rep Leaderboard"
        description="Sortable outbound performance per rep in the selected range."
      >
        <RepPerformanceTab callLogs={callLogs} bookings={bookings} reps={reps} from={dateFrom} to={dateTo} />
      </ReportSection>

      <ReportSection
        title="Per-Rep Coaching Scorecards"
        description={
          activeRepId
            ? `Where ${selectedRepLabel ?? "this rep"}'s calls fall apart, plus best pick-up and booking windows.`
            : "One scorecard per rep: biggest funnel leak, top exit reason, and timing intelligence. Sorted by dial volume."
        }
      >
        <RepCoachingPanel scorecards={repScorecards} repNameMap={repNameMap} expanded={!!activeRepId} />
      </ReportSection>

      <TeamCoachingPanel />
    </div>
  );
}
