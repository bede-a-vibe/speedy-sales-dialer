import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Clock, TrendingDown, TrendingUp } from "lucide-react";
import { ReportSection } from "@/components/reports/ReportSection";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  analyseHours,
  formatHour,
  formatHourRange,
  useDialHourStats,
  MIN_DIALS_FOR_VERDICT,
  type DialHourRow,
} from "@/hooks/useDialHours";

interface Props {
  dateFrom: string;
  dateTo: string;
  activeRepId?: string;
  selectedRepLabel?: string;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: DialHourRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover p-2.5 text-xs shadow-md">
      <p className="mb-1.5 font-semibold text-foreground">{formatHourRange(row.hour_of_day)}</p>
      <dl className="space-y-0.5 text-muted-foreground">
        <div className="flex justify-between gap-6">
          <dt>Dials</dt>
          <dd className="font-medium tabular-nums text-foreground">{row.dials}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>People dialled</dt>
          <dd className="tabular-nums">{row.leads_dialed}</dd>
        </div>
        {row.redials > 0 ? (
          <div className="flex justify-between gap-6">
            <dt>Redials</dt>
            <dd className="tabular-nums">{row.redials}</dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-6">
          <dt>Connects</dt>
          <dd className="tabular-nums">{row.connects}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Contact rate</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {row.contact_rate_pct ?? "—"}%
          </dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Conversations 2min+</dt>
          <dd className="tabular-nums">{row.conv_2min}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Bookings</dt>
          <dd className="tabular-nums">{row.bookings}</dd>
        </div>
      </dl>
    </div>
  );
}

export function DialClockCard({ dateFrom, dateTo, activeRepId, selectedRepLabel }: Props) {
  const { data: rows = [], isLoading } = useDialHourStats(dateFrom, dateTo, activeRepId);

  const verdict = useMemo(() => analyseHours(rows), [rows]);

  // Only render the hours the business could plausibly dial, so the chart is not
  // 16 empty columns of overnight.
  const visible = useMemo(() => rows.filter((r) => r.hour_of_day >= 6 && r.hour_of_day <= 20), [rows]);

  const chartData = useMemo(
    () => visible.map((r) => ({ ...r, label: formatHour(r.hour_of_day) })),
    [visible],
  );

  if (isLoading) {
    return (
      <ReportSection title="Dial clock" description="Loading…">
        <Skeleton className="h-72 w-full" />
      </ReportSection>
    );
  }

  if (verdict.totalDials === 0) {
    return (
      <ReportSection
        title="Dial clock"
        description="Dial volume against contact rate, hour by hour."
      >
        <p className="py-10 text-center text-sm text-muted-foreground">
          No dials in this range.
        </p>
      </ReportSection>
    );
  }

  return (
    <ReportSection
      title="Dial clock"
      description={`Where the dials go against where they actually connect${
        activeRepId ? ` — ${selectedRepLabel}` : ""
      }. Bars are dials, the line is contact rate.`}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {verdict.best ? (
          <Badge variant="outline" className="gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
            <TrendingUp className="h-3 w-3" />
            Best {formatHourRange(verdict.best.hour_of_day)} · {verdict.best.contact_rate_pct}%
          </Badge>
        ) : null}
        {verdict.worst ? (
          <Badge variant="outline" className="gap-1.5 border-red-500/40 text-red-700 dark:text-red-400">
            <TrendingDown className="h-3 w-3" />
            Worst {formatHourRange(verdict.worst.hour_of_day)} · {verdict.worst.contact_rate_pct}%
          </Badge>
        ) : null}
        {verdict.avgContactRate !== null ? (
          <Badge variant="secondary" className="gap-1.5">
            <Clock className="h-3 w-3" />
            Average {verdict.avgContactRate}%
          </Badge>
        ) : null}
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              unit="%"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
            <Bar yAxisId="left" dataKey="dials" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            {verdict.avgContactRate !== null ? (
              <ReferenceLine
                yAxisId="right"
                y={verdict.avgContactRate}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
              />
            ) : null}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="contact_rate_pct"
              stroke="hsl(var(--chart-2, 160 84% 39%))"
              strokeWidth={2}
              dot={{ r: 2.5 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* The point of the chart. A pretty hourly breakdown that nobody acts on is
          worth less than one sentence naming the hours to move dials into. */}
      {verdict.underDialled.length > 0 || verdict.overDialled.length > 0 ? (
        <div className="mt-4 space-y-2">
          {verdict.underDialled.length > 0 ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs">
              <p className="font-medium text-foreground">
                Dial more at{" "}
                {verdict.underDialled.map((r) => formatHourRange(r.hour_of_day)).join(", ")}.
              </p>
              <p className="mt-1 text-muted-foreground">
                {verdict.underDialled.length === 1 ? "This hour connects" : "These hours connect"} above
                the {verdict.avgContactRate}% average but {verdict.underDialled.length === 1 ? "takes" : "take"}{" "}
                below-average volume.
              </p>
            </div>
          ) : null}

          {verdict.overDialled.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <p className="font-medium text-foreground">
                Heavy volume into weak hours:{" "}
                {verdict.overDialled
                  .map((r) => `${formatHourRange(r.hour_of_day)} (${r.dials} dials, ${r.contact_rate_pct}%)`)
                  .join(", ")}
                .
              </p>
              <p className="mt-1 text-muted-foreground">
                Same effort spent in the hours above would land more conversations.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {verdict.lastActiveHour !== null && verdict.lastActiveHour < 17 ? (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            Dialling stops after {formatHour(verdict.lastActiveHour + 1)} and never starts before{" "}
            {formatHour(verdict.firstActiveHour ?? 9)}. Late-afternoon and early-evening hours are
            untested here — there is no data either way, which is not the same as knowing they do not
            work.
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Contact rate = connects ÷ dials, where a connect is any outcome that is not a failed attempt.
        Hours with fewer than {MIN_DIALS_FOR_VERDICT} dials are left out of the best/worst and
        recommendations — a single answered call at 1am is noise, not a signal. Times are Melbourne.
      </p>
    </ReportSection>
  );
}
