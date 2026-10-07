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
import { FathomTeamStatus } from "@/components/fathom/FathomConnect";

export default function ManagerPage() {
  const { user } = useAuth();
  return (
    <AppLayout title="Manager">
    <div className="mx-auto max-w-7xl space-y-5">
      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Call review</TabsTrigger>
          <TabsTrigger value="eod">EOD reports</TabsTrigger>
          <TabsTrigger value="kpis">KPIs &amp; targets</TabsTrigger>
          <TabsTrigger value="revenue">Meetings → revenue</TabsTrigger>
          <TabsTrigger value="flags">Coaching flags</TabsTrigger>
          <TabsTrigger value="oneonones">1:1s</TabsTrigger>
          <TabsTrigger value="roleplay">Roleplay</TabsTrigger>
          <TabsTrigger value="playbook">Setter access</TabsTrigger>
          <TabsTrigger value="numbers">Number checks</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="mt-4"><CallReviewQueue /></TabsContent>
        <TabsContent value="eod" className="mt-4">{user ? <TeamReview managerId={user.id} /> : null}</TabsContent>
        <TabsContent value="kpis" className="mt-4 space-y-4"><FathomTeamStatus /><TeamKpis /></TabsContent>
        <TabsContent value="revenue" className="mt-4"><MeetingRevenuePipeline /></TabsContent>
        <TabsContent value="flags" className="mt-4 space-y-4"><ManagerMetrics /><ManagerPlaybook /></TabsContent>
        <TabsContent value="oneonones" className="mt-4"><OneOnOnePanel /></TabsContent>
        <TabsContent value="roleplay" className="mt-4"><RoleplayResults /></TabsContent>
        <TabsContent value="playbook" className="mt-4"><PlaybookLocks /></TabsContent>
        <TabsContent value="numbers" className="mt-4"><NumberChecks /></TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  );
}
