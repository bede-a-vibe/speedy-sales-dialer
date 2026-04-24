import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { groupStatsByCategory, STAT_CATALOG_BY_ID, STAT_CATEGORY_LABEL, type StatCategory } from "@/lib/funnelStatsCatalog";
import { getReportMetrics, type ReportCallLog, type ReportBookingItem, type ReportContact } from "@/lib/reportMetrics";
import type { BreakdownGroup } from "@/lib/funnelBreakdown";

interface Props {
  callLogs: ReportCallLog[];
  bookedItems: ReportBookingItem[];
  contacts?: ReportContact[];
  from: string;
  to: string;
  repUserId?: string;
  previousFrom?: string;
  previousTo?: string;
  compareMode?: boolean;
  breakdownGroups?: BreakdownGroup[];
}

function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
    if (out.length > 365) break; // safety
  }
  return out;
}

const SERIES_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--outcome-booked))",
  "hsl(var(--destructive))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--muted-foreground))",
];

export function MetricTrendChart({
  callLogs,
  bookedItems,
  contacts,
  from,
  to,
  repUserId,
  previousFrom,
  previousTo,
  compareMode,
  breakdownGroups,
}: Props) {
  const [metricId, setMetricId] = useState<string>("bookings_made");
  const stat = STAT_CATALOG_BY_ID.get(metricId);

  const days = useMemo(() => eachDay(from, to), [from, to]);
  const prevDays = useMemo(
    () => (compareMode && previousFrom && previousTo ? eachDay(previousFrom, previousTo) : []),
    [compareMode, previousFrom, previousTo],
  );

  const useBreakdown = !!breakdownGroups && breakdownGroups.length > 0;
  const topBreakdown = useMemo(
    () => (useBreakdown ? breakdownGroups!.filter((g) => !g.isOther).slice(0, 5) : []),
    [useBreakdown, breakdownGroups],
  );

  const data = useMemo(() => {
    if (!stat) return [];
    return days.map((day, idx) => {
      const point: Record<string, number | string> = {
        date: day.slice(5), // MM-DD
      };
      if (useBreakdown) {
        for (const g of topBreakdown) {
          const m = getReportMetrics({
            callLogs: g.callLogs,
            bookedItems: g.bookings,
            contacts,
            from: day,
            to: day,
            repUserId,
          });
          point[g.label] = stat.raw(m);
        }
      } else {
        const dayMetrics = getReportMetrics({
          callLogs,
          bookedItems,
          contacts,
          from: day,
          to: day,
          repUserId,
        });
        point.current = stat.raw(dayMetrics);
      }
      if (!useBreakdown && compareMode && prevDays[idx]) {
        const prevDay = prevDays[idx];
        const prevMetrics = getReportMetrics({
          callLogs,
          bookedItems,
          contacts,
          from: prevDay,
          to: prevDay,
          repUserId,
        });
        point.previous = stat.raw(prevMetrics);
      }
      return point;
    });
  }, [days, prevDays, stat, callLogs, bookedItems, contacts, repUserId, compareMode, useBreakdown, topBreakdown]);

  const grouped = groupStatsByCategory();
  const order: StatCategory[] = ["activity", "conversations", "outcomes", "bookings"];

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Trend Over Time</h3>
          <p className="mt-1 text-xs text-muted-foreground">Daily values across the selected date range.</p>
        </div>
        <Select value={metricId} onValueChange={setMetricId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Pick a metric" />
          </SelectTrigger>
          <SelectContent>
            {order.map((cat) =>
              grouped[cat].length > 0 ? (
                <div key={cat}>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {STAT_CATEGORY_LABEL[cat]}
                  </div>
                  {grouped[cat].map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </div>
              ) : null,
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--background))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {useBreakdown ? (
              topBreakdown.map((g, i) => (
                <Line
                  key={g.key}
                  type="monotone"
                  dataKey={g.label}
                  name={g.label}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              ))
            ) : (
              <Line
                type="monotone"
                dataKey="current"
                name={stat?.label ?? "Current"}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            )}
            {!useBreakdown && compareMode && (
              <Line
                type="monotone"
                dataKey="previous"
                name="Previous period"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}