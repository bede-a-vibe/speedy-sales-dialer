import { useMemo } from "react";
import { DashboardFold } from "@/components/dashboard/DashboardFold";
import { EarningsPlanner } from "@/components/earnings/EarningsPlanner";
import { useObservedEarnings } from "@/components/earnings/useObservedEarnings";
import { useAuth } from "@/hooks/useAuth";
import { useEarningTargets } from "@/hooks/useEarningsPlan";
import { useRepCompPlans, useSetterFirstDeals, useSetterVerbalDeals } from "@/hooks/useFunnelTracker";
import { EARNINGS_WINDOW_DAYS, projectEarnings } from "@/lib/earningsPlan";
import { dayKeyOf, monthOf, type CompPlanRow } from "@/lib/funnelTracker";
import { repPayThisMonth } from "@/lib/repPay";

const money = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;

function Planner({ userId, plan, plans }: { userId: string; plan: CompPlanRow; plans: CompPlanRow[] }) {
  const { observed, failed } = useObservedEarnings(userId, EARNINGS_WINDOW_DAYS);
  const { data: targets } = useEarningTargets();
  const { data: deals } = useSetterFirstDeals(true);
  const { data: verbals } = useSetterVerbalDeals(true);
  const pay = useMemo(() => {
    if (!deals) return null;
    const today = dayKeyOf(new Date().toISOString());
    return repPayThisMonth(deals, plans, userId, monthOf(today), today, verbals ?? []);
  }, [deals, verbals, plans, userId]);
  const target = targets?.get(userId) ?? null;
  const summary = failed
    ? "Could not load your numbers"
    : !observed
      ? "Loading your numbers"
      : `At your pace: ${money(projectEarnings(observed.inputs, plan.base_annual).monthly)} a month${target == null ? " · set a target" : ` · target ${money(target)}`}`;

  return (
    <DashboardFold id="my-earnings" title="My earnings plan" summary={summary}>
      {observed ? (
        <EarningsPlanner userId={userId} observed={observed} baseAnnual={plan.base_annual} pay={pay} target={target} canEditTarget windowDays={EARNINGS_WINDOW_DAYS} />
      ) : (
        <p className="text-xs text-muted-foreground">{failed ? "Refresh to try again." : "Loading..."}</p>
      )}
    </DashboardFold>
  );
}

/** Dashboard: the signed-in setter's own earnings projection and target. Only for people on a setter pay plan. */
export function MyEarningsSection() {
  const { user } = useAuth();
  const { data: plans = [] } = useRepCompPlans();
  const plan = plans.find((p) => p.user_id === user?.id && p.role === "setter" && p.plan_key === "setter_2026_marginal");
  if (!user?.id || !plan) return null;
  return <Planner userId={user.id} plan={plan} plans={plans} />;
}
