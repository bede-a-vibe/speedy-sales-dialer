import { useMemo, type ReactNode } from "react";
import { ArrowRight, Info } from "lucide-react";
import { ReportSection } from "@/components/reports/ReportSection";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightsPaidAds } from "@/components/insights/InsightsPaidAds";
import { useSourceFunnel } from "@/hooks/useMeetings";
import { useAdSpend } from "@/hooks/useAdSpend";
import { filterByBrand } from "@/lib/adSpendMetrics";
import { formatCurrency } from "@/lib/clientRevenue";
import { channelOptions, channelSlug, totalSourceRows } from "@/lib/sourceFunnelTotals";
import { cn } from "@/lib/utils";

export const ALL_SOURCES = "all";

interface Props {
  dateFrom: string;
  dateTo: string;
  /** Channel slug from the URL ("all", "cold-call", "ads", "website", ...). */
  source: string;
  onSourceChange: (slug: string) => void;
  /** The dialer's dial-level funnel. Shown for All and Cold Call: dials only exist for cold outbound. */
  coldCallDetail: ReactNode;
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

function Stage({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-[104px] flex-1 rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {sub ? <p className="truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function StageArrow({ rate }: { rate: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1 text-muted-foreground">
      <ArrowRight className="h-4 w-4" />
      <span className="font-mono text-[11px] tabular-nums">{rate}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

/**
 * Insights → Funnel.
 *
 * One source picker drives the whole tab. The meeting funnel (booked → showed →
 * won) comes from get_source_funnel, which spans GHL calendars and dialer
 * bookings, so it works for every channel. Below it sits the detail that only
 * exists for some channels: dial-level stats for cold call, Meta spend for ads.
 */
export function InsightsFunnel({ dateFrom, dateTo, source, onSourceChange, coldCallDetail }: Props) {
  const { data: rows = [], isLoading } = useSourceFunnel({
    from: dateFrom,
    to: dateTo,
    basis: "scheduled",
    group: "channel",
    stream: "all",
  });
  const { data: spendRows = [] } = useAdSpend(dateFrom, dateTo);

  const options = useMemo(() => channelOptions(rows), [rows]);
  const totalMeetings = useMemo(() => rows.reduce((a, r) => a + (Number(r.meetings_booked) || 0), 0), [rows]);
  const selected = options.find((o) => o.slug === source);
  const isAll = source === ALL_SOURCES || !selected;
  const isColdCall = source === "cold-call";
  const isAds = source === "ads";

  const totals = useMemo(
    () => totalSourceRows(isAll ? rows : rows.filter((r) => channelSlug(r.channel) === source)),
    [rows, source, isAll],
  );
  const odinSpend = useMemo(
    () => filterByBrand(spendRows, "odin").reduce((a, r) => a + r.spend, 0),
    [spendRows],
  );
  const costPer = (n: number) => (n > 0 && odinSpend > 0 ? formatCurrency(odinSpend / n) : "—");

  const sourceLabel = isAll ? "every source" : selected?.channel ?? "every source";

  return (
    <div className="space-y-5">
      {/* Source picker */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lead source</span>
        {[{ channel: "All sources", slug: ALL_SOURCES, meetings: totalMeetings }, ...options].map((o) => {
          const active = o.slug === ALL_SOURCES ? isAll : o.slug === source;
          return (
            <button
              key={o.slug}
              type="button"
              onClick={() => onSourceChange(o.slug)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {o.channel}
              <span className={cn("font-mono tabular-nums", active ? "opacity-80" : "opacity-60")}>{o.meetings}</span>
            </button>
          );
        })}
      </div>

      <ReportSection
        title={`Meeting funnel · ${sourceLabel}`}
        description="Meetings in the selected range by meeting date, from GHL calendars and dialer bookings. Show rate counts every resolved slot. Won counts distinct contacts with a signed deal after booking."
      >
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
              {isAds ? (
                <>
                  <Stage label="Meta spend" value={formatCurrency(odinSpend)} sub="Odin, ex-GST" />
                  <StageArrow rate={costPer(totals.meetings)} />
                </>
              ) : null}
              <Stage label="Booked" value={String(totals.meetings)} sub={`${totals.contactsBooked} contacts`} />
              <StageArrow rate={pct(totals.showRate)} />
              <Stage label="Showed" value={String(totals.showed)} sub={`${totals.noshow} no-show · ${totals.cancelled + totals.rescheduled} moved`} />
              <StageArrow rate={pct(totals.closeFromShow)} />
              <Stage label="Won" value={String(totals.won)} sub={`${pct(totals.closeFromBooked)} of booked`} />
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-border pt-3 sm:grid-cols-4 lg:grid-cols-6">
              <MiniStat label="MRR won" value={totals.mrr > 0 ? formatCurrency(totals.mrr) : "—"} />
              <MiniStat label="One-off won" value={totals.amount > 0 ? formatCurrency(totals.amount) : "—"} />
              <MiniStat label="Upcoming" value={String(totals.upcoming)} />
              <MiniStat label="No outcome yet" value={String(totals.pending)} />
              {isAds ? (
                <>
                  <MiniStat label="Cost / show" value={costPer(totals.showed)} />
                  <MiniStat label="Cost / client" value={costPer(totals.won)} />
                </>
              ) : null}
            </div>
          </div>
        )}
      </ReportSection>

      {isAll || isColdCall ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <h2 className="text-sm font-semibold text-foreground">Cold call: dial to booking</h2>
            <span className="text-xs text-muted-foreground">Dialer data only. Other sources have no dials.</span>
          </div>
          {coldCallDetail}
        </div>
      ) : isAds ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <h2 className="text-sm font-semibold text-foreground">Paid ads detail</h2>
            <span className="text-xs text-muted-foreground">Spend, delivery and campaigns from Meta.</span>
          </div>
          <InsightsPaidAds dateFrom={dateFrom} dateTo={dateTo} />
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {sourceLabel} meetings arrive through GHL calendars, so there is no dial or spend data before the
            booking. The funnel above is the full picture for this source.
          </p>
        </div>
      )}
    </div>
  );
}
