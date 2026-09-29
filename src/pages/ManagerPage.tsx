import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CallReviewQueue } from "@/components/manager/CallReviewQueue";
import { PlaybookLocks } from "@/components/manager/PlaybookLocks";
import { OneOnOnePanel } from "@/components/manager/OneOnOnePanel";
import { RoleplayResults } from "@/components/manager/RoleplayResults";
import { KpiPeriodTargets } from "@/components/targets/KpiPeriodTargets";
import { KpiScorecard } from "@/components/targets/KpiScorecard";
import { MeetingRevenuePipeline } from "@/components/manager/MeetingRevenuePipeline";
import { ManagerMetrics } from "@/components/training/ManagerMetrics";
import { ManagerPlaybook } from "@/components/training/ManagerPlaybook";
import { TeamReview } from "@/pages/EodReportPage";
import { useAuth } from "@/hooks/useAuth";

export default function ManagerPage() {
  const { user } = useAuth();
  return (
    <AppLayout title="Manager">
    <div className="mx-auto max-w-7xl space-y-5">
      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Call review</TabsTrigger>
          <TabsTrigger value="eod">EOD reports</TabsTrigger>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
          <TabsTrigger value="revenue">Meetings → revenue</TabsTrigger>
          <TabsTrigger value="flags">Coaching flags</TabsTrigger>
          <TabsTrigger value="oneonones">1:1s</TabsTrigger>
          <TabsTrigger value="roleplay">Roleplay</TabsTrigger>
          <TabsTrigger value="playbook">Setter access</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="mt-4"><CallReviewQueue /></TabsContent>
        <TabsContent value="eod" className="mt-4">{user ? <TeamReview managerId={user.id} /> : null}</TabsContent>
        <TabsContent value="kpis" className="mt-4 space-y-4"><KpiPeriodTargets /><KpiScorecard /></TabsContent>
        <TabsContent value="revenue" className="mt-4"><MeetingRevenuePipeline /></TabsContent>
        <TabsContent value="flags" className="mt-4 space-y-4"><ManagerMetrics /><ManagerPlaybook /></TabsContent>
        <TabsContent value="oneonones" className="mt-4"><OneOnOnePanel /></TabsContent>
        <TabsContent value="roleplay" className="mt-4"><RoleplayResults /></TabsContent>
        <TabsContent value="playbook" className="mt-4"><PlaybookLocks /></TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  );
}
