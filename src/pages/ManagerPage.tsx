import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CallReviewQueue } from "@/components/manager/CallReviewQueue";
import { OneOnOnePanel } from "@/components/manager/OneOnOnePanel";
import { RoleplayResults } from "@/components/manager/RoleplayResults";
import { KpiScorecard } from "@/components/targets/KpiScorecard";
import { ManagerMetrics } from "@/components/training/ManagerMetrics";
import { ManagerPlaybook } from "@/components/training/ManagerPlaybook";

export default function ManagerPage() {
  return (
    <AppLayout title="Manager">
    <div className="mx-auto max-w-7xl space-y-5">
      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Call review</TabsTrigger>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
          <TabsTrigger value="flags">Coaching flags</TabsTrigger>
          <TabsTrigger value="oneonones">1:1s</TabsTrigger>
          <TabsTrigger value="roleplay">Roleplay</TabsTrigger>
        </TabsList>
        <TabsContent value="review" className="mt-4"><CallReviewQueue /></TabsContent>
        <TabsContent value="kpis" className="mt-4"><KpiScorecard /></TabsContent>
        <TabsContent value="flags" className="mt-4 space-y-4"><ManagerMetrics /><ManagerPlaybook /></TabsContent>
        <TabsContent value="oneonones" className="mt-4"><OneOnOnePanel /></TabsContent>
        <TabsContent value="roleplay" className="mt-4"><RoleplayResults /></TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  );
}
