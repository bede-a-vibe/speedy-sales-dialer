import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CallReviewQueue } from "@/components/manager/CallReviewQueue";
import { PlaybookLocks } from "@/components/manager/PlaybookLocks";
import { OneOnOnePanel } from "@/components/manager/OneOnOnePanel";
import { RoleplayResults } from "@/components/manager/RoleplayResults";
import { TeamKpis } from "@/components/targets/TeamKpis";
import { MeetingRevenuePipeline } from "@/components/manager/MeetingRevenuePipeline";
import { ManagerMetrics } from "@/components/training/ManagerMetrics";
import { ManagerPlaybook } from "@/components/training/ManagerPlaybook";
import { TeamReview } from "@/pages/EodReportPage";
import { NumberChecks } from "@/components/manager/NumberChecks";
import { useAuth } from "@/hooks/useAuth";

const TABS = [
  { value: "review", label: "Call review" },
  { value: "eod", label: "EOD reports" },
  { value: "kpis", label: "KPIs & targets" },
  { value: "revenue", label: "Meetings → revenue" },
  { value: "flags", label: "Coaching flags" },
  { value: "oneonones", label: "1:1s" },
  { value: "roleplay", label: "Roleplay" },
  { value: "playbook", label: "Setter access" },
  { value: "numbers", label: "Number checks" },
] as const;

type ManagerTab = (typeof TABS)[number]["value"];

const TITLES: Record<ManagerTab, string> = {
  review: "Manager · Call review",
  eod: "Manager · EOD reports",
  kpis: "Manager · KPIs & targets",
  revenue: "Manager · Meetings → revenue",
  flags: "Manager · Coaching flags",
  oneonones: "Manager · 1:1s",
  roleplay: "Manager · Roleplay",
  playbook: "Manager · Setter access",
  numbers: "Manager · Number checks",
};

export default function ManagerPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab lives in the URL, as it does on Insights and the Classroom. With nine
  // tabs, losing your place on every refresh is the difference between a tool
  // you work out of and one you re-navigate each time — and it makes a tab
  // linkable when you want a coach to look at the same screen.
  const urlTab = searchParams.get("tab");
  const activeTab: ManagerTab = useMemo(
    () => (TABS.some((t) => t.value === urlTab) ? (urlTab as ManagerTab) : "review"),
    [urlTab],
  );

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <AppLayout title={TITLES[activeTab]}>
      <div className="mx-auto max-w-7xl space-y-5">
        <Tabs value={activeTab} onValueChange={handleChange}>
          {/* h-auto + flex-wrap: nine tabs overflow a single fixed-height row
              on anything narrower than a wide desktop, and the default
              TabsList clips rather than wraps. */}
          <TabsList className="mb-4 h-auto flex-wrap gap-1">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="review"><CallReviewQueue /></TabsContent>
          <TabsContent value="eod">{user ? <TeamReview managerId={user.id} /> : null}</TabsContent>
          <TabsContent value="kpis"><TeamKpis /></TabsContent>
          <TabsContent value="revenue"><MeetingRevenuePipeline /></TabsContent>
          <TabsContent value="flags" className="space-y-4">
            <ManagerMetrics />
            <ManagerPlaybook />
          </TabsContent>
          <TabsContent value="oneonones"><OneOnOnePanel /></TabsContent>
          <TabsContent value="roleplay"><RoleplayResults /></TabsContent>
          <TabsContent value="playbook"><PlaybookLocks /></TabsContent>
          <TabsContent value="numbers"><NumberChecks /></TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
