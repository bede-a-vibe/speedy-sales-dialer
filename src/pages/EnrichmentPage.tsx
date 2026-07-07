import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Sparkles,
  UserSearch,
  Globe2,
  Landmark,
  CheckCircle2,
  Clock,
  Info,
  Brain,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const DEEP_THROUGHPUT_PER_HOUR = 2400;

// ---------- count helpers ----------
type CountBuilder = (q: ReturnType<typeof baseQuery>) => Promise<number>;

function baseQuery() {
  // head:true + count:exact returns a count without rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase.from("contacts").select("id", { count: "exact", head: true }) as any;
}

async function runCount(build: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>): Promise<number> {
  const { count, error } = await build(baseQuery());
  if (error) throw error;
  return count ?? 0;
}

// ---------- data hook ----------
function useEnrichmentDashboard() {
  return useQuery({
    queryKey: ["enrichment-dashboard"],
    refetchInterval: 45_000,
    staleTime: 30_000,
    queryFn: async () => {
      const activeFilter = (q: ReturnType<typeof baseQuery>) => q.not("is_archived", "is", true);

      const [
        total,
        active,
        // stage 1 — classify: tier populated
        classifyDone,
        // stage 2 — find owner
        ownerDone,
        ownerPending,
        // stage 3 — deep crawl
        deepDone,
        deepPending,
        // stage 4 — ABR
        abrDone,
        abrPending,
        // coverage grid
        cov_dm_name,
        cov_dm_phone,
        cov_email,
        cov_state,
        cov_website,
        cov_google_ads,
        cov_facebook_ads,
        cov_abn,
        cov_years,
        cov_agency,
      ] = await Promise.all([
        runCount((q) => q),
        runCount((q) => activeFilter(q)),
        // classify: tier set (auto on insert trigger)
        runCount((q) => activeFilter(q).not("prospect_tier", "is", null)),
        // owner-find done = attempted true
        runCount((q) => activeFilter(q).eq("dm_enrich_attempted", true)),
        // owner-find pending = not attempted AND has something to try
        runCount((q) =>
          activeFilter(q)
            .eq("dm_enrich_attempted", false)
            .or("website.not.is.null,email.not.is.null,business_name.not.is.null"),
        ),
        // deep-crawl done = attempted
        runCount((q) => activeFilter(q).eq("deep_crawl_attempted", true)),
        // deep-crawl pending
        runCount((q) =>
          activeFilter(q)
            .not("website", "is", null)
            .neq("website", "")
            .is("dm_name", null)
            .eq("deep_crawl_attempted", false),
        ),
        // ABR done
        runCount((q) => activeFilter(q).eq("abr_attempted", true)),
        // ABR pending
        runCount((q) =>
          activeFilter(q)
            .not("business_name", "is", null)
            .eq("abr_attempted", false)
            .or("state.is.null,dm_name.is.null"),
        ),
        // coverage
        runCount((q) => activeFilter(q).not("dm_name", "is", null)),
        runCount((q) => activeFilter(q).not("dm_phone", "is", null)),
        runCount((q) => activeFilter(q).not("email", "is", null)),
        runCount((q) => activeFilter(q).not("state", "is", null)),
        runCount((q) => activeFilter(q).not("website", "is", null)),
        runCount((q) => activeFilter(q).eq("has_google_ads", "yes")),
        runCount((q) => activeFilter(q).eq("has_facebook_ads", "yes")),
        runCount((q) => activeFilter(q).not("abn", "is", null)),
        runCount((q) => activeFilter(q).not("years_in_business", "is", null)),
        runCount((q) => activeFilter(q).eq("has_existing_agency", true)),
      ]);

      const { data: budgetRow, error: budgetError } = await supabase
        .from("enrichment_ai_budget")
        .select("day, calls_used, daily_cap")
        .maybeSingle();
      if (budgetError) throw budgetError;

      return {
        total,
        active,
        stages: {
          classify: { done: classifyDone, pending: Math.max(0, active - classifyDone) },
          owner: { done: ownerDone, pending: ownerPending },
          deep: { done: deepDone, pending: deepPending },
          abr: { done: abrDone, pending: abrPending },
        },
        coverage: {
          dm_name: cov_dm_name,
          dm_phone: cov_dm_phone,
          email: cov_email,
          state: cov_state,
          website: cov_website,
          google_ads: cov_google_ads,
          facebook_ads: cov_facebook_ads,
          abn: cov_abn,
          years_in_business: cov_years,
          existing_agency: cov_agency,
        },
        budget: budgetRow ?? { day: "", calls_used: 0, daily_cap: 500 },
      };
    },
  });
}

// ---------- ETA ----------
function formatEta(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "—";
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `~${mins} min`;
  }
  if (hours < 24) return `~${Math.round(hours)}h`;
  const days = Math.round(hours / 24);
  return `~${days}d`;
}

// ---------- sub-components ----------
function StageCard(props: {
  index: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  cadence: string;
  done: number;
  pending: number;
  totalActive: number;
  badge?: string;
}) {
  const { index, title, description, icon: Icon, cadence, done, pending, totalActive, badge } = props;
  const denom = Math.max(1, done + pending);
  const pct = Math.min(100, Math.round((done / denom) * 100));
  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1 bg-primary/70" />
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/30">
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Stage {index}
              </p>
              <CardTitle className="text-sm">{title}</CardTitle>
            </div>
          </div>
          {badge && (
            <Badge variant="outline" className="text-[10px] font-mono uppercase">
              {badge}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-1 pb-4 space-y-2">
        <p className="text-xs text-muted-foreground min-h-[2.5em]">{description}</p>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xl font-bold text-foreground">{done.toLocaleString()}</span>
          <span className="text-[11px] text-muted-foreground">
            {pending.toLocaleString()} pending
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <span>{pct}% of {denom.toLocaleString()}</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {cadence}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground/80">
          {totalActive.toLocaleString()} active leads in scope
        </p>
      </CardContent>
    </Card>
  );
}

function CoverageRow(props: { label: string; count: number; total: number }) {
  const { label, count, total } = props;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[1fr_auto_120px] items-center gap-3 py-1.5">
      <span className="text-xs text-foreground">{label}</span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {count.toLocaleString()} <span className="text-muted-foreground/70">/ {total.toLocaleString()}</span>
        <span className="ml-2 font-semibold text-foreground">{pct}%</span>
      </span>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

// ---------- page ----------
export default function EnrichmentPage() {
  const { data, isLoading, isFetching, dataUpdatedAt } = useEnrichmentDashboard();

  const stages = data?.stages;
  const active = data?.active ?? 0;

  const totalPending = useMemo(() => {
    if (!stages) return 0;
    return stages.owner.pending + stages.deep.pending + stages.abr.pending;
  }, [stages]);

  const deepEtaHours = stages ? stages.deep.pending / DEEP_THROUGHPUT_PER_HOUR : 0;

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Enrichment Workflow
              </h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Every imported lead flows through this pipeline automatically — upload a CSV or sync
              from GHL and watch the counts climb here. New lists enrich on their own within hours.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">
              <span
                className={cn(
                  "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                  isFetching ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50",
                )}
              />
              Auto-refresh · 45s
            </Badge>
            {dataUpdatedAt > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground">
                Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Pipeline stages */}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StageCard
            index={1}
            title="Classify"
            description="Tier, phone type, business service assigned on insert."
            icon={CheckCircle2}
            cadence="On insert"
            done={stages?.classify.done ?? 0}
            pending={stages?.classify.pending ?? 0}
            totalActive={active}
          />
          <StageCard
            index={2}
            title="Find owner"
            description="Website discovery → owner name, mobile, email."
            icon={UserSearch}
            cadence="Every 1 min"
            done={stages?.owner.done ?? 0}
            pending={stages?.owner.pending ?? 0}
            totalActive={active}
          />
          <StageCard
            index={3}
            title="Deep crawl"
            description="Owner names, Google/Meta ad detection, ABN, years in biz."
            icon={Globe2}
            cadence="Every 1 min"
            done={stages?.deep.done ?? 0}
            pending={stages?.deep.pending ?? 0}
            totalActive={active}
          />
          <StageCard
            index={4}
            title="ABR registry"
            description="State, sole-trader names, ABN from AU business registry."
            icon={Landmark}
            cadence="Every 1 min"
            done={stages?.abr.done ?? 0}
            pending={stages?.abr.pending ?? 0}
            totalActive={active}
            badge="Needs ABR_GUID"
          />
        </div>

        {/* Throughput */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Throughput & ETA</CardTitle>
            <CardDescription className="text-xs">
              Deep crawl processes ~{DEEP_THROUGHPUT_PER_HOUR.toLocaleString()} leads/hour.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Total pending (all stages)
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                {totalPending.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Deep crawl pending
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                {(stages?.deep.pending ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Fully enriched in
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-primary">
                {formatEta(deepEtaHours)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Coverage grid */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Field coverage</CardTitle>
            <CardDescription className="text-xs">
              Share of {active.toLocaleString()} active leads with each enrichment field populated.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-1 md:grid-cols-2">
            {data && [
              ["Owner name", data.coverage.dm_name],
              ["Owner mobile", data.coverage.dm_phone],
              ["Any email", data.coverage.email],
              ["State", data.coverage.state],
              ["Website", data.coverage.website],
              ["Running Adwords", data.coverage.google_ads],
              ["Meta Ads", data.coverage.facebook_ads],
              ["ABN", data.coverage.abn],
              ["Years in business", data.coverage.years_in_business],
              ["Existing agency", data.coverage.existing_agency],
            ].map(([label, count]) => (
              <CoverageRow
                key={label as string}
                label={label as string}
                count={count as number}
                total={active}
              />
            ))}
            {!data && (
              <p className="text-xs text-muted-foreground py-4">
                {isLoading ? "Loading coverage…" : "No data."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* How it works */}
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            Runs automatically every minute via scheduled jobs — no manual trigger needed. New
            imports typically finish the owner-find + deep-crawl stages within a few hours.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}