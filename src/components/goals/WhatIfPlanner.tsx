import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ACCENT, AXIS_TICK, Chips, GRID, money, moneyAxis, MUTED, Panel, TipBox } from "@/components/goals/chartKit";
import { projectEarnings, type EarningsInputs, type ObservedEarnings } from "@/lib/earningsPlan";
import { BRACKET_STARTS, formatMetric, GOAL_METRICS, improvementCurve, leverGains, metricOf, niceTicks, withTargets, type CurvePoint, type GoalKey, type Outcome, type RepGoal } from "@/lib/repGoals";

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "monthly", label: "Take-home" },
  { value: "retainerCash", label: "Retainer cash" },
  { value: "clients", label: "Clients" },
];
const OUTCOME_NAME: Record<Outcome, string> = { monthly: "Monthly take-home", retainerCash: "First-month retainer cash a month", clients: "Clients a month" };

/** Move the KPIs and watch the month change, on the live commission brackets. */
export function WhatIfPlanner({ observed, baseAnnual, goal }: { observed: ObservedEarnings; baseAnnual: number; goal: RepGoal }) {
  const own = observed.inputs;
  const [inputs, setInputs] = useState<EarningsInputs>(own);
  useEffect(() => setInputs(own), [own]);
  const [key, setKey] = useState<GoalKey>("sitRate");
  const allTen = useMemo(() => withTargets({ ...own, dialsPerDay: own.dialsPerDay * 1.1, sitRate: own.sitRate * 1.1 }, goal.kpis), [own, goal.kpis]);
  // A rep still under the first bracket would see a flat take-home line, so they start on retainer cash.
  const startOutcome: Outcome = projectEarnings(allTen, baseAnnual).commission > 0 ? "monthly" : "retainerCash";
  const [picked, setPicked] = useState<Outcome | null>(null);
  const outcome = picked ?? startOutcome;

  const m = metricOf(key);
  const target = goal.kpis[key];
  const before = projectEarnings(own, baseAnnual);
  const after = projectEarnings(inputs, baseAnnual);
  const changed = GOAL_METRICS.some((x) => inputs[x.key] !== own[x.key]);
  const curve = useMemo(() => improvementCurve(key, own, inputs, baseAnnual, outcome, target), [key, own, inputs, baseAnnual, outcome, target]);
  const gains = useMemo(() => leverGains(own, goal.kpis, baseAnnual, outcome), [own, goal.kpis, baseAnnual, outcome]);
  // Only the moved metric changed: the two lines are the same, so draw one.
  const twoLines = GOAL_METRICS.some((x) => x.key !== key && inputs[x.key] !== own[x.key]);
  const fmt = (v: number) => (outcome === "clients" ? v.toFixed(1) : money(v));
  const fmtAxis = (v: number) => (outcome === "clients" ? String(Number(v.toFixed(1))) : moneyAxis(v));
  const hasTargets = Object.keys(goal.kpis).length > 0;
  const yMax = Math.max(...curve.map((c) => Math.max(c.now, c.changed)));
  const yMin = Math.min(...curve.map((c) => Math.min(c.now, c.changed)));
  const ceiling = outcome === "monthly" && goal.monthly && goal.monthly <= yMax * 1.6 ? Math.max(yMax, goal.monthly) : yMax;
  const floor = outcome === "monthly" ? Math.floor((yMin * 0.95) / 500) * 500 : 0;
  const levels = outcome === "retainerCash" ? BRACKET_STARTS.filter((b) => b.from <= yMax * 1.05) : [];
  const bottom = curve[0].x;
  const top = curve[curve.length - 1].x;
  const inView = (x: number) => x >= bottom - 1e-9 && x <= top + 1e-9;
  const maxGain = Math.max(0, ...gains.map((g) => g.gain));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Take-home a month", money(after.monthly), money(before.monthly), after.monthly - before.monthly, money],
            ["Commission a month", money(after.commission), money(before.commission), after.commission - before.commission, money],
            ["Retainer cash a month", money(after.retainerCash), money(before.retainerCash), after.retainerCash - before.retainerCash, money],
            ["Clients a month", after.clients.toFixed(1), before.clients.toFixed(1), after.clients - before.clients, (v: number) => v.toFixed(1)],
          ] as const
        ).map(([label, value, was, diff, f]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">{value}</p>
            <p className="text-[11px] text-muted-foreground">{changed ? `was ${was}${Math.abs(diff) >= 0.05 ? `, ${diff > 0 ? "+" : ""}${f(diff)}` : ""}` : "at your current pace"}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
        <Panel
          title="Move your numbers"
          actions={
            <div className="flex gap-1.5">
              {hasTargets ? <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setInputs(withTargets(own, goal.kpis))}><Target className="h-3 w-3" /> My targets</Button> : null}
              {changed ? <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setInputs(own)}><RotateCcw className="h-3 w-3" /> Reset</Button> : null}
            </div>
          }
        >
          <div className="space-y-4">
            {GOAL_METRICS.map((x) => (
              <div key={x.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{x.label}</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {inputs[x.key] !== own[x.key] ? <span className="mr-1.5 text-muted-foreground">{formatMetric(x, own[x.key])} to</span> : null}
                    {formatMetric(x, inputs[x.key])}
                  </span>
                </div>
                <Slider
                  aria-label={x.label}
                  value={[inputs[x.key]]}
                  min={0}
                  max={Math.max(x.max, own[x.key], goal.kpis[x.key] ?? 0)}
                  step={x.step}
                  onValueChange={([v]) => {
                    setKey(x.key);
                    setInputs((cur) => ({ ...cur, [x.key]: v }));
                  }}
                />
              </div>
            ))}
          </div>
          {observed.noClients ? (
            <p className="mt-4 text-xs text-muted-foreground">No clients in your window yet, so closing and average client start at zero. Slide them to plan.</p>
          ) : observed.thin ? (
            <p className="mt-4 text-xs text-muted-foreground">Starts from only {observed.counts.sat} sittings and {observed.clients} {observed.clients === 1 ? "client" : "clients"}, so treat it as a rough guide.</p>
          ) : null}
        </Panel>

        <Panel
          title={`${OUTCOME_NAME[outcome]} by ${m.label.toLowerCase()}`}
          note={outcome === "monthly" && startOutcome !== "monthly" ? "Commission starts once $18,000 of first-month retainer is paid in a month. Until then take-home stays at base." : "Everything else held where the sliders are."}
          actions={<Chips<Outcome> label="Measure" value={outcome} onChange={setPicked} options={OUTCOMES} />}
        >
          <div className="mb-3"><Chips<GoalKey> label="KPI on the graph" value={key} onChange={setKey} options={GOAL_METRICS.map((x) => ({ value: x.key, label: x.label }))} /></div>
          <div className="h-72 w-full" role="img" aria-label={`${OUTCOME_NAME[outcome]} against ${m.label}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 22, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="x" type="number" domain={[bottom, top]} ticks={niceTicks(bottom, top, 6)} tickFormatter={(v: number) => (m.kind === "pct" ? `${Math.round(v * 1000) / 10}%` : formatMetric(m, v))} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis width={54} domain={[floor, ceiling * 1.05]} ticks={niceTicks(floor, ceiling * 1.05)} tickFormatter={fmtAxis} tick={AXIS_TICK} tickLine={false} axisLine={false} allowDataOverflow />
                <Tooltip
                  cursor={{ stroke: MUTED, strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    const r = active ? (payload?.[0]?.payload as CurvePoint | undefined) : undefined;
                    return r ? (
                      <TipBox
                        title={`${m.label}: ${formatMetric(m, r.x)}`}
                        rows={twoLines ? [{ label: "With your changes", value: fmt(r.changed), color: ACCENT }, { label: "Your numbers now", value: fmt(r.now), color: MUTED }] : [{ label: OUTCOME_NAME[outcome], value: fmt(r.changed), color: ACCENT }]}
                      />
                    ) : null;
                  }}
                />
                {outcome === "monthly" && goal.monthly && goal.monthly <= ceiling ? (
                  <ReferenceLine y={goal.monthly} stroke={MUTED} strokeDasharray="4 4" label={{ value: `My target ${money(goal.monthly)}`, position: "insideBottomLeft", fontSize: 11, fill: MUTED }} />
                ) : null}
                {levels.map((b) => (
                  <ReferenceLine key={b.from} y={b.from} stroke={MUTED} strokeDasharray="2 4" label={{ value: `${Math.round(b.rate * 100)}% from ${moneyAxis(b.from)}`, position: "insideBottomLeft", fontSize: 11, fill: MUTED }} />
                ))}
                {target != null && inView(target) ? <ReferenceLine x={target} stroke={MUTED} strokeDasharray="4 4" label={{ value: "My target", position: "top", fontSize: 11, fill: MUTED }} /> : null}
                {twoLines ? <Line dataKey="now" stroke={MUTED} strokeWidth={2} dot={false} isAnimationActive={false} /> : null}
                <Line dataKey="changed" stroke={ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
                {inView(own[key]) ? <ReferenceDot x={own[key]} y={before[outcome]} r={5} fill={MUTED} stroke="hsl(var(--card))" strokeWidth={2} /> : null}
                {changed && inView(inputs[key]) ? <ReferenceDot x={inputs[key]} y={after[outcome]} r={6} fill={ACCENT} stroke="hsl(var(--card))" strokeWidth={2} /> : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: MUTED }} aria-hidden="true" /> You now: {formatMetric(m, own[key])}, {fmt(before[outcome])}</span>
            {changed ? <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCENT }} aria-hidden="true" /> With your changes: {formatMetric(m, inputs[key])}, {fmt(after[outcome])}</span> : <span>Drag a slider to see the difference.</span>}
          </div>
        </Panel>
      </div>

      <Panel title="Which improvement is worth the most" note={`Each one on its own, added to ${OUTCOME_NAME[outcome].toLowerCase()}. ${hasTargets ? "Up to your target where you have one, otherwise one step up." : "One step up on each: 50 dials, 2 points of pickups, 1 point of bookings, 5 points of sits or closes, $500 a client."}`}>
        {maxGain > 0 ? (
          <>
            <div style={{ height: gains.length * 38 + 8 }} className="w-full" role="img" aria-label="Gain from each improvement">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gains} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap={10}>
                  <XAxis type="number" hide domain={[0, maxGain]} />
                  <YAxis type="category" dataKey="label" width={138} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    content={({ active, payload }) => {
                      const g = active ? (payload?.[0]?.payload as (typeof gains)[number] | undefined) : undefined;
                      return g ? <TipBox title={g.label} rows={[{ label: g.toTarget ? "To your target" : "One step up", value: `${formatMetric(metricOf(g.key), g.from)} to ${formatMetric(metricOf(g.key), g.to)}` }, { label: "Adds a month", value: fmt(g.gain) }]} /> : null;
                    }}
                  />
                  <Bar dataKey="gain" fill={ACCENT} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false}>
                    <LabelList dataKey="gain" position="right" formatter={(v: number) => `+${fmt(v)}`} style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              {gains.map((g) => (
                <li key={g.key}>{g.label}: {formatMetric(metricOf(g.key), g.from)} to {formatMetric(metricOf(g.key), g.to)}{g.toTarget ? " (your target)" : ""}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {outcome === "monthly"
              ? "No single one of these gets a month past the $18,000 where commission starts. Switch to retainer cash to see which gets you closest, or move a few together."
              : "Nothing to work from yet. Slide closing and average client above zero to plan."}
          </p>
        )}
      </Panel>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        An estimate from your own numbers, not a promise. Commission is on first-month retainer cash in the month it is paid: nothing on the first $18k, then 15% to $28k, 18% to $38k, 21% to $48k and 25% above, each dollar at its bracket's rate. One-off cash (5%) is left out.
      </p>
    </div>
  );
}
