import type { ComponentType } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CallReviewQueue } from "@/components/manager/CallReviewQueue";
import { LoomReviews } from "@/components/manager/LoomReviews";
import { StudyReviews } from "@/components/manager/StudyReviews";
import { PlaybookLocks } from "@/components/manager/PlaybookLocks";
import { OneOnOnePanel } from "@/components/manager/OneOnOnePanel";
import { RoleplayResults } from "@/components/manager/RoleplayResults";
import { TeamKpis } from "@/components/targets/TeamKpis";
import { ManagerMetrics } from "@/components/training/ManagerMetrics";
import { ManagerPlaybook } from "@/components/training/ManagerPlaybook";
import { MANAGER_TABS, managerViewFor, movedManagerTab, type ManagerView } from "@/lib/managerTabs";

function CoachingFlags() {
  return (
    <div className="space-y-4">
      <ManagerMetrics />
      <ManagerPlaybook />
    </div>
  );
}

const VIEWS: Record<ManagerView, ComponentType> = {
  review: CallReviewQueue,
  loom: LoomReviews,
  study: StudyReviews,
  kpis: TeamKpis,
  flags: CoachingFlags,
  oneonones: OneOnOnePanel,
  roleplay: RoleplayResults,
  playbook: PlaybookLocks,
};

export default function ManagerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const moved = movedManagerTab(urlTab);
  const { tab, view } = managerViewFor(urlTab);

  if (moved) return <Navigate to={moved} replace />;

  // The view lives in the URL so a refresh keeps your place and a screen can be
  // linked. A tab's own name is never written: it opens on its first view.
  const open = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", managerViewFor(value).view);
    setSearchParams(next, { replace: true });
  };

  return (
    <AppLayout title={`Manager · ${tab.label}`}>
      <div className="mx-auto max-w-7xl">
        <Tabs value={tab.value} onValueChange={open}>
          <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1">
            {MANAGER_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {MANAGER_TABS.map((t) => {
            if (t.views.length === 1) {
              const Only = VIEWS[t.views[0].value];
              return <TabsContent key={t.value} value={t.value}><Only /></TabsContent>;
            }
            return (
              <TabsContent key={t.value} value={t.value}>
                <Tabs value={view} onValueChange={open}>
                  <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1" aria-label={`${t.label} views`}>
                    {t.views.map((v) => <TabsTrigger key={v.value} value={v.value}>{v.label}</TabsTrigger>)}
                  </TabsList>
                  {t.views.map((v) => {
                    const View = VIEWS[v.value];
                    return <TabsContent key={v.value} value={v.value}><View /></TabsContent>;
                  })}
                </Tabs>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </AppLayout>
  );
}
