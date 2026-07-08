import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ReportsBody } from "@/pages/ReportsPage";
import { AnalyticsBody } from "@/pages/AnalyticsPage";
import { CallFunnelBody } from "@/pages/CallFunnelPage";
import { TargetsBody } from "@/pages/TargetsPage";
import { TeamCoachingPanel } from "@/components/insights/TeamCoachingPanel";
import { ClientRevenueSummary } from "@/components/insights/ClientRevenueSummary";

const TABS = ["overview", "funnel", "team", "targets"] as const;
type InsightsTab = (typeof TABS)[number];

const TITLES: Record<InsightsTab, string> = {
  overview: "Insights · Overview",
  funnel: "Insights · Funnel",
  team: "Insights · Team",
  targets: "Insights · Targets",
};

interface InsightsPageProps {
  defaultTab?: InsightsTab;
}

export default function InsightsPage({ defaultTab = "overview" }: InsightsPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as InsightsTab | null;
  const activeTab: InsightsTab = useMemo(() => {
    if (urlTab && (TABS as readonly string[]).includes(urlTab)) return urlTab;
    return defaultTab;
  }, [urlTab, defaultTab]);

  const handleChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  return (
    <AppLayout title={TITLES[activeTab]}>
      <div className="mx-auto max-w-7xl">
        <Tabs value={activeTab} onValueChange={handleChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="funnel">Funnel</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="targets">Targets</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <ClientRevenueSummary />
            <ReportsBody />
            <Separator className="my-4" />
            <AnalyticsBody initialTab="summary" />
          </TabsContent>

          <TabsContent value="funnel" className="space-y-6">
            <CallFunnelBody />
          </TabsContent>

          <TabsContent value="team" className="space-y-6">
            <AnalyticsBody initialTab="reps" />
            <Separator className="my-4" />
            <ReportsBody initialGroup="team-timing" initialTab="rep-comparison" />
            <Separator className="my-4" />
            <TeamCoachingPanel />
          </TabsContent>

          <TabsContent value="targets" className="space-y-6">
            <TargetsBody />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}