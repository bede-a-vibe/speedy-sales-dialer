import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { NumberChecks } from "@/components/manager/NumberChecks";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EnrichmentPage = lazy(() => import("@/pages/EnrichmentPage"));
const GhlSyncPage = lazy(() => import("@/pages/GhlSyncPage"));

const TABS = [
  { value: "enrichment", label: "Enrichment" },
  { value: "ghl", label: "GHL sync" },
  { value: "numbers", label: "Number checks" },
] as const;

/** Lead data: how leads get filled in, kept in step with GHL and their numbers checked. */
export default function LeadDataPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.value === params.get("tab"))?.value ?? "enrichment";

  return (
    <AppLayout title="Lead data">
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })} className="mx-auto max-w-7xl">
        <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1">
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <TabsContent value="enrichment"><EnrichmentPage /></TabsContent>
          <TabsContent value="ghl"><GhlSyncPage /></TabsContent>
        </Suspense>
        <TabsContent value="numbers"><NumberChecks /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
