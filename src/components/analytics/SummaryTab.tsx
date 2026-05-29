import { useMemo } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AnalyticsKpiTile } from "./AnalyticsKpiTile";
import { EndToEndFunnel } from "@/components/funnel/EndToEndFunnel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ReportMetrics } from "@/lib/reportMetrics";
import type { FunnelMetrics } from "@/lib/funnelMetrics";
import { getMonthlyTrend, getSegmentRows } from "@/lib/analyticsMetrics";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const audP = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });

interface Props {
  metrics: ReportMetrics;
  funnel: FunnelMetrics;
  callLogs: any[];
  bookings: any[];
  from: string;
  to: string;
}

export function SummaryTab({ metrics, funnel, callLogs, bookings, from, to }: Props) {
  const trend = useMemo(() => getMonthlyTrend(callLogs, bookings, from, to), [callLogs, bookings, from, to]);
  const byIndustry = useMemo(() => getSegmentRows(callLogs, bookings, "industry", from, to).slice(0, 8), [callLogs, bookings, from, to]);
  const byState = useMemo(() => getSegmentRows(callLogs, bookings, "state", from, to).slice(0, 8), [callLogs, bookings, from, to]);

  const setter = metrics.appointmentPerformance.setter;
  const sales = metrics.sales;

  return (
    <div className="space-y-6">
      {/* Headline row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AnalyticsKpiTile label="Dials" value={metrics.dialer.dials} accent="primary" sublabel={`${metrics.dialer.uniqueLeadsDialed.toLocaleString()} unique leads`} />
        <AnalyticsKpiTile label="Conversations" value={metrics.dialer.conversations} sublabel="reached connection" />
        <AnalyticsKpiTile label="Bookings" value={metrics.bookingsMade.totalBookingsMade} sublabel={`${metrics.bookingsMade.newBookings} new`} />
        <AnalyticsKpiTile label="Showed" value={setter.showed} sublabel={`${setter.showUpRate}% show rate`} />
        <AnalyticsKpiTile label="Closed" value={sales.closes} accent="success" sublabel={`${setter.closeRate}% close rate`} />
        <AnalyticsKpiTile label="First-Year $" value={aud(sales.firstYearValue)} accent="success" sublabel={`${aud(sales.setupRevenue)} setup`} />
      </div>

      {/* Secondary efficiency row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AnalyticsKpiTile label="Dial → Close %" value={`${sales.dialToCloseRate}%`} sublabel={`${sales.closes} / ${metrics.dialer.dials}`} />
        <AnalyticsKpiTile label="$ / Dial" value={audP(sales.firstYearValuePerDial)} sublabel="first-year value" />
        <AnalyticsKpiTile label="Avg Dials / Close" value={sales.closes > 0 ? sales.avgDialsPerClose : "—"} sublabel="dials per signed deal" />
        <AnalyticsKpiTile label="Pickup %" value={`${metrics.dialer.pickUpRate}%`} sublabel={`${metrics.dialer.pickUps.toLocaleString()} pickups`} />
        <AnalyticsKpiTile label="Booking Show %" value={`${setter.showUpRate}%`} sublabel={`${setter.showed}/${setter.appointmentsScheduled}`} />
        <AnalyticsKpiTile label="Avg Deal Value" value={setter.averageDealValue > 0 ? aud(setter.averageDealValue) : "—"} sublabel="per closed deal" />
      </div>

      {/* Funnel */}
      <EndToEndFunnel metrics={metrics} funnel={funnel} />

      {/* Monthly trend */}
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Monthly Trend</h3>
            <p className="mt-1 text-xs text-muted-foreground">Dials vs conversations vs bookings vs closes by month.</p>
          </div>
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary" />Dials</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500" />Conversations</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500" />Bookings</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Closed</span>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={trend} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="dials" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="conversations" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="bookings" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="closed" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue trend */}
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="mb-3">
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Revenue Trend</h3>
          <p className="mt-1 text-xs text-muted-foreground">First-year value of closed deals (setup + 12× MRR), by close month.</p>
        </div>
        <div className="h-56">
          <ResponsiveContainer>
            <AreaChart data={trend} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => [aud(Number(v)), "Revenue"]}
              />
              <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Channel/segment performance tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SegmentTable title="Top Industries" rows={byIndustry} />
        <SegmentTable title="By State" rows={byState} />
      </div>
    </div>
  );
}

function SegmentTable({ title, rows }: { title: string; rows: ReturnType<typeof getSegmentRows> }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <h3 className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Segment</TableHead>
              <TableHead className="text-right text-xs">Dials</TableHead>
              <TableHead className="text-right text-xs">Bookings</TableHead>
              <TableHead className="text-right text-xs">Closed</TableHead>
              <TableHead className="text-right text-xs">$ First-Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">No data in range.</TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="text-sm font-medium text-foreground">{r.label}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.dials.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.bookings}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.closed}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.firstYearValue > 0 ? aud(r.firstYearValue) : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
