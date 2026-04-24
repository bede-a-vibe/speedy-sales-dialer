import { useMemo, useState } from "react";
import { ReportSection } from "@/components/reports/ReportSection";
import { TargetProgressRow } from "@/components/targets/TargetProgressRow";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePerformanceTargets } from "@/hooks/usePerformanceTargets";
import {
  buildTargetProgressItems,
  deriveAllTargets,
  getPerformanceActualMetrics,
  getTargetPeriodForDateRange,
  PERFORMANCE_TARGET_METRIC_DEFINITIONS,
  type TargetProgressItem,
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

type TabValue = "my-setter" | "my-closer" | "team-setter" | "team-closer";

function splitItems(items: TargetProgressItem[]) {
  const inputs: TargetProgressItem[] = [];
  const derived: TargetProgressItem[] = [];
  for (const item of items) {
    const def = PERFORMANCE_TARGET_METRIC_DEFINITIONS[item.key];
    (def.isDerived ? derived : inputs).push(item);
  }
  return { inputs, derived };
}

function ProgressList({
  items,
  showDerived,
}: {
  items: TargetProgressItem[];
  showDerived: boolean;
}) {
  const { inputs, derived } = splitItems(items);
  if (inputs.length === 0 && derived.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No targets configured for this view.
      </p>
    );
  }
  return (
    <div className="space-y-0.5">
      {inputs.map((item) => (
        <TargetProgressRow key={item.key} item={item} />
      ))}
      {showDerived && derived.length > 0 ? (
        <>
          <div className="my-2 flex items-center gap-2 px-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Derived
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          {derived.map((item) => (
            <TargetProgressRow key={item.key} item={item} />
          ))}
        </>
      ) : null}
    </div>
  );
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
  const [showDerived, setShowDerived] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>(
    activeRepId ? "my-setter" : "team-setter",
  );

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
      <ReportSection title="Target Comparison">
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground animate-pulse">
          Loading targets…
        </div>
      </ReportSection>
    );
  }

  const repActuals = getPerformanceActualMetrics(metrics);
  const teamActuals = getPerformanceActualMetrics(teamMetrics);

  const periodLabel = periodType === "daily" ? "Daily" : "Weekly";

  const headerExtra = (
    <div className="flex items-center gap-3">
      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {periodLabel}
      </span>
      <div className="flex items-center gap-1.5">
        <Switch
          id="show-derived"
          checked={showDerived}
          onCheckedChange={setShowDerived}
          className="scale-75"
        />
        <Label htmlFor="show-derived" className="cursor-pointer text-xs text-muted-foreground">
          Show derived
        </Label>
      </div>
    </div>
  );

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Target Comparison</h2>
        {headerExtra}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="h-9">
          {activeRepId ? (
            <>
              <TabsTrigger value="my-setter" className="text-xs">
                {selectedRepLabel} — Setter
              </TabsTrigger>
              <TabsTrigger value="my-closer" className="text-xs">
                {selectedRepLabel} — Closer
              </TabsTrigger>
              <TabsTrigger value="team-setter" className="text-xs">
                Team Setter
              </TabsTrigger>
              <TabsTrigger value="team-closer" className="text-xs">
                Team Closer
              </TabsTrigger>
            </>
          ) : (
            <>
              <TabsTrigger value="team-setter" className="text-xs">
                Team Setter
              </TabsTrigger>
              <TabsTrigger value="team-closer" className="text-xs">
                Team Closer
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {activeRepId ? (
          <>
            <TabsContent value="my-setter" className="mt-3">
              <ProgressList
                items={buildTargetProgressItems(individualTargets, repActuals, "setter")}
                showDerived={showDerived}
              />
            </TabsContent>
            <TabsContent value="my-closer" className="mt-3">
              <ProgressList
                items={buildTargetProgressItems(individualTargets, repActuals, "closer")}
                showDerived={showDerived}
              />
            </TabsContent>
          </>
        ) : null}
        <TabsContent value="team-setter" className="mt-3">
          <ProgressList
            items={buildTargetProgressItems(teamTargets, teamActuals, "setter")}
            showDerived={showDerived}
          />
        </TabsContent>
        <TabsContent value="team-closer" className="mt-3">
          <ProgressList
            items={buildTargetProgressItems(teamTargets, teamActuals, "closer")}
            showDerived={showDerived}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
