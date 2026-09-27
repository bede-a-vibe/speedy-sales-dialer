import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ReportSection } from "@/components/reports/ReportSection";
import { Button } from "@/components/ui/button";
import { ANSWERED_OUTCOMES, type ReportCallLog } from "@/lib/reportMetrics";

type Granularity = "hourly" | "daily" | "weekly";

interface Props {
  dateFrom: string;
  dateTo: string;
  callLogs: ReportCallLog[];
  activeRepId?: string;
  selectedRepLabel?: string;
}

interface Bucket {
  key: string;
  label: string;
  dials: number;
  pickUps: number;
}

function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Monday-start week key, e.g. "22 Sep" for the week beginning Mon 22 Sep. */
function weekKey(d: Date): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

function shortLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ampm}`;
});

/**
 * Pickup-rate trend chart — call volume vs connection rate over time,
 * with hourly / daily / weekly granularity. Hourly aggregates every day in
 * the range by hour-of-day so a 30-day range still shows a usable shape.
 */
export function PickupRateTrendCard({ dateFrom, dateTo, callLogs, activeRepId, selectedRepLabel }: Props) {
  const [granularity, setGranularity] = useState<Granularity>("daily");

  const { buckets, overallRate, totalDials, totalPickUps } = useMemo(() => {
    const map = new Map<string, Bucket>();
    const order: string[] = [];
    let dials = 0;
    let pickUps = 0;

    const push = (key: string, label: string, answered: boolean) => {
      let b = map.get(key);
      if (!b) {
        b = { key, label, dials: 0, pickUps: 0 };
        map.set(key, b);
        order.push(key);
      }
      b.dials += 1;
      if (answered) b.pickUps += 1;
      dials += 1;
      if (answered) pickUps += 1;
    };

    for (const log of callLogs) {
      if (activeRepId && log.user_id !== activeRepId) continue;
      if (!log.created_at) continue;
      const d = new Date(log.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const answered = ANSWERED_OUTCOMES.has(log.outcome);

      if (granularity === "hourly") {
        const h = d.getHours();
        push(String(h), HOUR_LABELS[h], answered);
      } else if (granularity === "daily") {
        const key = localDateKey(log.created_at);
        push(key, shortLabel(key), answered);
      } else {
        const key = weekKey(d);
        push(key, `w/c ${shortLabel(key)}`, answered);
      }
    }

    // Hourly buckets sort by hour number; daily/weekly keys are ISO dates so
    // lexicographic order is chronological.
    const sorted = order
      .map((k) => map.get(k)!)
      .sort((a, b) => (granularity === "hourly" ? Number(a.key) - Number(b.key) : a.key < b.key ? -1 : 1));

    return {
      buckets: sorted,
      overallRate: dials > 0 ? pickUps / dials : 0,
      totalDials: dials,
      totalPickUps: pickUps,
    };
  }, [callLogs, activeRepId, granularity]);

  const data = buckets.map((b) => ({
    label: b.label,
    dials: b.dials,
    pickUpRate: b.dials > 0 ? Math.round((b.pickUps / b.dials) * 1000) / 10 : 0,
    pickUps: b.pickUps,
  }));

  return (
    <ReportSection
      title="Pick-Up Rate Trend"
      description={`${totalPickUps.toLocaleString()} pick-ups from ${totalDials.toLocaleString()} dials (${(overallRate * 100).toFixed(1)}%)${activeRepId ? ` for ${selectedRepLabel}` : " across all reps"}.`}
    >
      <div className="mb-4 flex items-center gap-1">
        {(["hourly", "daily", "weekly"] as const).map((g) => (
          <Button
            key={g}
            size="sm"
            variant={granularity === g ? "default" : "outline"}
            className="h-7 px-3 text-xs capitalize"
            onClick={() => setGranularity(g)}
          >
            {g}
          </Button>
        ))}
        <span className="ml-2 text-[11px] text-muted-foreground">
          {granularity === "hourly" ? "Hour of day, all days in range combined" : granularity === "daily" ? "Per day" : "Per week (Mon–Sun)"}
        </span>
      </div>

      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No calls logged in this range.</p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                label={{ value: "Dials", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                label={{ value: "Pick-up rate", angle: 90, position: "insideRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) =>
                  name === "Pick-up rate" ? [`${value}%`, name] : [value.toLocaleString(), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="dials"
                name="Dials"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="pickUpRate"
                name="Pick-up rate"
                stroke="hsl(var(--outcome-booked))"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ReportSection>
  );
}
