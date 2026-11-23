import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EarningsPlanner } from "@/components/earnings/EarningsPlanner";
import { useObservedEarnings } from "@/components/earnings/useObservedEarnings";
import { useEarningTargets } from "@/hooks/useEarningsPlan";
import { useRepCompPlans, useSetterFirstDeals, useSetterVerbalDeals } from "@/hooks/useFunnelTracker";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { dayKeyOf, monthOf, type CompPlanRow } from "@/lib/funnelTracker";
import { repPayThisMonth } from "@/lib/repPay";

function RepCard({ name, plan, plans, days, target }: { name: string; plan: CompPlanRow; plans: CompPlanRow[]; days: number; target: number | null }) {
  const { observed, failed } = useObservedEarnings(plan.user_id, days);
  const { data: deals } = useSetterFirstDeals(true);
  const { data: verbals } = useSetterVerbalDeals(true);
  const pay = useMemo(() => {
    if (!deals) return null;
    const today = dayKeyOf(new Date().toISOString());
    return repPayThisMonth(deals, plans, plan.user_id, monthOf(today), today, verbals ?? []);
  }, [deals, verbals, plans, plan.user_id]);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-sm">{name}</CardTitle></CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-muted-foreground">Could not load {name}'s numbers. Refresh to try again.</p>
        ) : observed ? (
          <EarningsPlanner userId={plan.user_id} observed={observed} baseAnnual={plan.base_annual} pay={pay} target={target} canEditTarget={false} windowDays={days} />
        ) : (
          <Skeleton className="h-48 w-full" />
        )}
      </CardContent>
    </Card>
  );
}

/** Manager view: every setter's earnings planner, the same one they see on their Dashboard, with the target they set. */
export function EarningsProjection() {
  const [lookback, setLookback] = useState("60");
  const days = Number(lookback);
  const { data: plans = [], isLoading } = useRepCompPlans();
  const { data: reps = [] } = useSalesReps();
  const { data: targets } = useEarningTargets();
  const setters = useMemo(() => {
    const name = new Map(reps.map((r) => [r.user_id, r.display_name || r.email?.split("@")[0] || "Rep"]));
    return plans
      .filter((p) => p.role === "setter" && p.plan_key === "setter_2026_marginal")
      .map((p) => ({ plan: p, name: name.get(p.user_id) ?? "Rep" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plans, reps]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Rep earnings projection</h3>
          <p className="text-xs text-muted-foreground">
            Each setter's own funnel through the plan they are paid on, the same planner they see on their Dashboard. Change any number to see what it is worth to them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Observed over</span>
          <Select value={lookback} onValueChange={setLookback}>
            <SelectTrigger className="h-8 w-[130px] bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="14">last 14 days</SelectItem>
              <SelectItem value="30">last 30 days</SelectItem>
              <SelectItem value="60">last 60 days</SelectItem>
              <SelectItem value="90">last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : setters.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No setters on a pay plan.</p>
      ) : (
        setters.map((s) => <RepCard key={s.plan.user_id} name={s.name} plan={s.plan} plans={plans} days={days} target={targets?.get(s.plan.user_id) ?? null} />)
      )}
    </div>
  );
}
