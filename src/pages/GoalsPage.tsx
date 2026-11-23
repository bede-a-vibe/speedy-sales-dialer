import { lazy, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { CommissionSales } from "@/components/goals/CommissionSales";
import { GoalTargets } from "@/components/goals/GoalTargets";
import { WhatIfPlanner } from "@/components/goals/WhatIfPlanner";
import { useObservedEarnings } from "@/components/earnings/useObservedEarnings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { useRepFunnelByDay, useRepGoals } from "@/hooks/useEarningsPlan";
import { useRepCompPlans, useSetterFirstDeals, useSetterVerbalDeals } from "@/hooks/useFunnelTracker";
import { useTeamTargets } from "@/hooks/useKpiSettings";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { useAdminAccess } from "@/hooks/useUserRole";
import { clientsInWindow, EARNINGS_WINDOW_DAYS } from "@/lib/earningsPlan";
import { addDayKeys, dayKeyOf, monthOf, paidCommissionCash, saleCommissions, type CompPlanRow } from "@/lib/funnelTracker";
import { mondayOf, sumFunnel, type RepGoal } from "@/lib/repGoals";
import { repPayThisMonth } from "@/lib/repPay";
import { DEFAULT_CONFIG, targetsFor } from "@/lib/teamTargets";

const EndOfDay = lazy(() => import("@/components/eod/EndOfDay").then((m) => ({ default: m.EndOfDay })));

const TABS = ["targets", "what-if", "sales", "eod"] as const;
type GoalTab = (typeof TABS)[number];
const NO_GOAL: RepGoal = { monthly: null, kpis: {} };

function RepGoals({ plan, plans, name, own }: { plan: CompPlanRow; plans: CompPlanRow[]; name: string; own: boolean }) {
  const userId = plan.user_id;
  const today = dayKeyOf(new Date().toISOString());
  const thisMonth = monthOf(today);
  const { observed, failed } = useObservedEarnings(userId, EARNINGS_WINDOW_DAYS);
  const goals = useRepGoals();
  const byDay = useRepFunnelByDay(userId, addDayKeys(mondayOf(today), -77));
  const deals = useSetterFirstDeals(true);
  const verbals = useSetterVerbalDeals(true);
  const { data: team = DEFAULT_CONFIG } = useTeamTargets();

  const goal = goals.data?.get(userId) ?? NO_GOAL;
  const month = useMemo(() => {
    const counts = sumFunnel((byDay.data ?? []).filter((d) => d.day >= thisMonth));
    return { counts, ...clientsInWindow(deals.data ?? [], userId, thisMonth, today) };
  }, [byDay.data, deals.data, userId, thisMonth, today]);
  const pay = useMemo(() => (deals.data ? repPayThisMonth(deals.data, plans, userId, thisMonth, today, verbals.data ?? []) : null), [deals.data, verbals.data, plans, userId, thisMonth, today]);
  const sales = useMemo(() => (deals.data ? saleCommissions(paidCommissionCash(deals.data), plans, userId) : []), [deals.data, plans, userId]);

  if (failed || goals.isError || byDay.isError) return <p className="py-10 text-center text-sm text-muted-foreground">Could not load these numbers. Refresh to try again.</p>;
  if (!observed || !goals.data || !byDay.data || !pay) return <Skeleton className="h-96 w-full" />;

  return (
    <>
      <TabsContent value="targets">
        <GoalTargets userId={userId} name={name} goal={goal} canEdit={own} observed={observed} month={month} baseAnnual={plan.base_annual} managerTargets={targetsFor(team, userId).t} days={byDay.data} today={today} windowDays={EARNINGS_WINDOW_DAYS} />
      </TabsContent>
      <TabsContent value="what-if">
        <WhatIfPlanner observed={observed} baseAnnual={plan.base_annual} goal={goal} />
      </TabsContent>
      <TabsContent value="sales">
        <CommissionSales plan={plan} pay={pay} sales={sales} goal={goal} thisMonth={thisMonth} />
      </TabsContent>
    </>
  );
}

/** Goals & KPIs: a rep's own targets, what improving them pays, their commission and sales, and their end of day report. */
export default function GoalsPage() {
  const { user } = useAuth();
  const { canViewAdmin: canViewAll, isLoading: rolesLoading } = useAdminAccess();
  const { data: plans = [], isLoading: plansLoading } = useRepCompPlans();
  const { data: reps = [] } = useSalesReps();
  const [params, setParams] = useSearchParams();
  const [picked, setPicked] = useState<string | null>(null);

  const setters = useMemo(() => {
    const names = new Map(reps.map((r) => [r.user_id, r.display_name || r.email?.split("@")[0] || "Rep"]));
    return plans
      .filter((p) => p.role === "setter" && p.plan_key === "setter_2026_marginal" && (canViewAll || p.user_id === user?.id))
      .map((p) => ({ plan: p, name: names.get(p.user_id) ?? "Rep" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plans, reps, canViewAll, user?.id]);
  const current = setters.find((s) => s.plan.user_id === picked) ?? setters.find((s) => s.plan.user_id === user?.id) ?? setters[0];
  const isLoading = plansLoading || rolesLoading;
  const raw = params.get("tab");
  // Closers and anyone else with no setter plan still file an end of day report.
  const eodOnly = !isLoading && !current;
  const tab: GoalTab = eodOnly ? "eod" : TABS.find((t) => t === raw) ?? "targets";
  // Once opened, the report stays mounted so checking a target does not wipe a half-written one.
  const [eodOpened, setEodOpened] = useState(false);
  if (tab === "eod" && !eodOpened) setEodOpened(true);
  const setTab = (t: GoalTab) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });

  return (
    <AppLayout title="Goals & KPIs">
      <div className="mx-auto max-w-6xl space-y-4">
        {tab !== "eod" && canViewAll && setters.length > 1 && current ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rep</span>
            <Select value={current.plan.user_id} onValueChange={setPicked}>
              <SelectTrigger aria-label="Rep" className="h-9 w-48 bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{setters.map((s) => <SelectItem key={s.plan.user_id} value={s.plan.user_id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : null}
        <Tabs value={tab} onValueChange={(v) => setTab(v as GoalTab)}>
          {eodOnly ? null : (
            <TabsList className="mb-4 h-auto flex-wrap justify-start">
              <TabsTrigger value="targets">Targets</TabsTrigger>
              <TabsTrigger value="what-if">What if I improve</TabsTrigger>
              <TabsTrigger value="sales">Commission & sales</TabsTrigger>
              <TabsTrigger value="eod">End of day</TabsTrigger>
            </TabsList>
          )}
          {tab === "eod" ? null : isLoading || !current ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <RepGoals key={current.plan.user_id} plan={current.plan} plans={plans} name={current.name} own={current.plan.user_id === user?.id} />
          )}
          <TabsContent value="eod" forceMount={eodOpened || undefined} className="data-[state=inactive]:hidden">
            {user ? (
              <div className="max-w-4xl">
                <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                  <EndOfDay userId={user.id} />
                </Suspense>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
