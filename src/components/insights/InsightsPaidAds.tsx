import { useMemo, useState } from "react";
import { AlertTriangle, Megaphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ReportSection } from "@/components/reports/ReportSection";
import { useAdSpend, useMetaAttributedDeals } from "@/hooks/useAdSpend";
import {
  campaignCoverage,
  computeAdTotals,
  filterByBrand,
  rollupByCampaign,
  rollupByMonth,
  type CampaignRollup,
  type MonthRollup,
} from "@/lib/adSpendMetrics";
import { formatCurrency, formatCurrencyCents } from "@/lib/clientRevenue";
import { cn } from "@/lib/utils";

interface Props {
  dateFrom: string;
  dateTo: string;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-xl font-bold tabular-nums",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
          !tone && "text-foreground",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function MonthlySpendChart({ data }: { data: MonthRollup[] }) {
  const max = Math.max(1, ...data.map((d) => d.spend));
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No spend in this range.</p>;
  }
  return (
    <div className="flex h-36 items-end gap-1.5">
      {data.map((m) => (
        <div key={m.month} className="group relative flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="min-h-[2px] w-full rounded-t bg-primary/80 transition-all hover:bg-primary"
            style={{ height: `${(m.spend / max) * 100}%` }}
          />
          <div className="absolute left-1/2 -top-6 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-mono text-background group-hover:block">
            {m.label}: {formatCurrency(m.spend)}
          </div>
          <span className="truncate text-[9px] font-mono text-muted-foreground">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

function CampaignTable({ rows }: { rows: CampaignRollup[] }) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No campaigns ran in this range.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <th className="py-2 pr-3 text-left font-normal">Campaign</th>
            <th className="py-2 px-3 text-right font-normal">Spend</th>
            <th className="py-2 px-3 text-right font-normal">Days</th>
            <th className="py-2 px-3 text-right font-normal">Impressions</th>
            <th className="py-2 px-3 text-right font-normal">Clicks</th>
            <th className="py-2 px-3 text-right font-normal">CPC</th>
            <th className="py-2 px-3 text-right font-normal">CTR</th>
            <th className="py-2 pl-3 text-right font-normal">Clients</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.campaign} className="border-b border-border/50 last:border-0">
              <td className="max-w-[260px] truncate py-2 pr-3 text-foreground" title={c.campaign}>
                {c.campaign}
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums text-foreground">
                {formatCurrency(c.spend)}
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">{c.days}</td>
              <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                {c.impressions.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                {c.clicks.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                {c.cpc === null ? "—" : formatCurrencyCents(c.cpc)}
              </td>
              <td className="py-2 px-3 text-right font-mono tabular-nums text-muted-foreground">
                {c.ctr === null ? "—" : `${(c.ctr * 100).toFixed(2)}%`}
              </td>
              <td className="py-2 pl-3 text-right font-mono tabular-nums text-muted-foreground">
                {c.clients === null ? "—" : c.clients}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Insights → Paid Ads.
 *
 * Spend from Meta, outcomes from the CRM. Defaults to Lifetime rather than the
 * shared 30-day range: ad performance is a cohort question, and a month of
 * spend against deals that close months later reads as a loss every time.
 */
export function InsightsPaidAds({ dateFrom, dateTo }: Props) {
  const [scope, setScope] = useState<"range" | "lifetime">("lifetime");
  const [brand, setBrand] = useState<"odin" | "veritas">("odin");

  const useRange = scope === "range";
  const { data: allRows = [], isLoading } = useAdSpend(
    useRange ? dateFrom : undefined,
    useRange ? dateTo : undefined,
  );
  const { deals } = useMetaAttributedDeals(useRange ? dateFrom : undefined, useRange ? dateTo : undefined);

  const rows = useMemo(() => filterByBrand(allRows, brand), [allRows, brand]);
  // Veritas spend is a different brand in the same ad account; its clients are
  // not in this CRM, so revenue must not be claimed against it.
  const brandDeals = brand === "odin" ? deals : [];

  const totals = useMemo(() => computeAdTotals(rows, brandDeals), [rows, brandDeals]);
  const campaigns = useMemo(() => rollupByCampaign(rows, brandDeals), [rows, brandDeals]);
  const months = useMemo(() => rollupByMonth(rows), [rows]);
  const coverage = useMemo(() => campaignCoverage(rows, brandDeals), [rows, brandDeals]);

  const spanLabel = useRange ? `${dateFrom} → ${dateTo}` : "all time";

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Meta ads</h3>
              <span className="text-xs text-muted-foreground">{spanLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-md border border-border p-0.5">
                {(["lifetime", "range"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScope(s)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs transition-colors",
                      scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === "lifetime" ? "Lifetime" : "Filter range"}
                  </button>
                ))}
              </div>
              <div className="flex rounded-md border border-border p-0.5">
                {(["odin", "veritas"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBrand(b)}
                    className={cn(
                      "rounded px-2 py-0.5 text-xs capitalize transition-colors",
                      brand === b ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Spend" value={isLoading ? "—" : formatCurrency(totals.spend)} sub="ex-GST" />
            <Stat
              label="Revenue"
              value={isLoading ? "—" : formatCurrency(totals.revenue)}
              sub="collected to date"
            />
            <Stat
              label="ROAS"
              value={totals.roas === null ? "—" : `${totals.roas.toFixed(2)}x`}
              tone={totals.roas === null ? undefined : totals.roas >= 2 ? "good" : totals.roas < 1 ? "bad" : undefined}
              sub="revenue ÷ spend"
            />
            <Stat label="Clients won" value={isLoading ? "—" : String(totals.clients)} />
            <Stat label="CAC" value={totals.cac === null ? "—" : formatCurrency(totals.cac)} sub="spend ÷ clients" />
            <Stat
              label="Live MRR"
              value={isLoading ? "—" : formatCurrency(totals.mrr)}
              sub="/mo from these clients"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3 sm:grid-cols-4">
            <Stat label="Impressions" value={totals.impressions.toLocaleString()} />
            <Stat label="Link clicks" value={totals.clicks.toLocaleString()} />
            <Stat label="CPC" value={totals.cpc === null ? "—" : formatCurrencyCents(totals.cpc)} />
            <Stat label="CTR" value={totals.ctr === null ? "—" : `${(totals.ctr * 100).toFixed(2)}%`} />
          </div>
        </CardContent>
      </Card>

      {/* The gap is shown in the product, not buried in a doc — a silent "—"
          column invites the reader to assume the campaigns earned nothing. */}
      {brand === "odin" && coverage.matched < coverage.total ? (
        <div className="flex gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="space-y-1 text-xs">
            <p className="font-medium text-foreground">
              {coverage.total - coverage.matched} of {coverage.total} clients can't be traced to a campaign.
            </p>
            <p className="text-muted-foreground">
              Meta destination URLs carry no UTM parameters, so won deals mostly can't be tied back to the
              campaign that produced them. The totals above are correct; the Clients column below is not a
              performance ranking. Fix is in Ads Manager — append{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                ?utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign=&#123;&#123;campaign.name&#125;&#125;
              </code>{" "}
              to destination URLs.
            </p>
            {coverage.unmatchedNames.length > 0 ? (
              <p className="text-muted-foreground">
                Recorded against campaigns with no matching spend:{" "}
                <span className="text-foreground">{coverage.unmatchedNames.join(", ")}</span>. Either the name
                is stale or the spend is missing — worth reconciling against Ads Manager.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ReportSection title="Spend by month" description="Monthly Meta spend across the selected scope.">
        <div className="rounded-lg border border-border bg-background p-4">
          <MonthlySpendChart data={months} />
        </div>
      </ReportSection>

      <ReportSection
        title="Campaigns"
        description="Ranked by spend. Delivery metrics are from Meta; client counts come from the CRM and depend on UTM capture."
      >
        <CampaignTable rows={campaigns} />
      </ReportSection>
    </div>
  );
}
