import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CallReviewQueue } from "@/components/manager/CallReviewQueue";
import { OneOnOnePanel } from "@/components/manager/OneOnOnePanel";
import { RoleplayResults } from "@/components/manager/RoleplayResults";
import { KpiScorecard } from "@/components/targets/KpiScorecard";
import { ManagerMetrics } from "@/components/training/ManagerMetrics";
import { ManagerPlaybook } from "@/components/training/ManagerPlaybook";

export default function ManagerPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manager</h1>
        <p className="text-sm text-muted-foreground">Review calls, track KPIs, and run coaching for each rep.</p>
      </div>
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
  );
}
