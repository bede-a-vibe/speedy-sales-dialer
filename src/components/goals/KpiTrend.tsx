import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ACCENT, AXIS_TICK, Chips, GRID, MUTED, Panel, TipBox } from "@/components/goals/chartKit";
import { formatMetric, metricOf, niceTicks, weeklyMetric, type FunnelDay, type GoalKey, type KpiTargets } from "@/lib/repGoals";

const TREND_KEYS: GoalKey[] = ["dialsPerDay", "pickupRate", "bookingRate", "sitRate"];
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });

/** One KPI week by week against the rep's own target. */
export function KpiTrend({ days, kpis, today }: { days: FunnelDay[]; kpis: KpiTargets; today: string }) {
  const [key, setKey] = useState<GoalKey>("sitRate");
  const m = metricOf(key);
  const rows = useMemo(() => weeklyMetric(days, key, today), [days, key, today]);
  const target = kpis[key];
  const top = Math.max(target ?? 0, ...rows.map((r) => r.value ?? 0)) * 1.15;
  const any = rows.some((r) => r.value != null);
  return (
    <Panel
      title="Week by week"
      note={key === "sitRate" ? "By the week you booked them. Weeks with fewer than 5 finished bookings are left blank." : "The last 12 weeks."}
      actions={<Chips<GoalKey> label="KPI" value={key} onChange={setKey} options={TREND_KEYS.map((k) => ({ value: k, label: metricOf(k).label }))} />}
    >
      {any ? (
        <div className="h-56 w-full" role="img" aria-label={`${m.label} each week for 12 weeks`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="week" tickFormatter={shortDay} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis width={48} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => (m.kind === "pct" ? `${Number((v * 100).toFixed(1))}%` : String(v))} domain={[0, top]} ticks={niceTicks(0, top, 4)} />
              <Tooltip
                cursor={{ stroke: MUTED, strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const r = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
                  return r ? <TipBox title={`Week of ${shortDay(r.week)}`} rows={[{ label: m.label, value: formatMetric(m, r.value), color: ACCENT }, ...(target != null ? [{ label: "My target", value: formatMetric(m, target) }] : [])]} /> : null;
                }}
              />
              {target != null ? <ReferenceLine y={target} stroke={MUTED} strokeDasharray="4 4" label={{ value: `My target ${formatMetric(m, target)}`, position: "insideTopLeft", fontSize: 11, fill: MUTED }} /> : null}
              <Line dataKey="value" stroke={ACCENT} strokeWidth={2} dot={{ r: 4, fill: ACCENT, stroke: "hsl(var(--card))", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted-foreground">Not enough to show yet.</p>
      )}
    </Panel>
  );
}
