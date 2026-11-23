import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LevelUpBar } from "@/components/dashboard/LevelUpBar";
import { ACCENT, AXIS_TICK, Chips, GRID, money, moneyAxis, MUTED, Panel, TipBox } from "@/components/goals/chartKit";
import { Progress } from "@/components/ui/progress";
import { bracketLabel, type CompPlanRow, type SaleCommission } from "@/lib/funnelTracker";
import { monthlyCommission, niceTicks, type RepGoal } from "@/lib/repGoals";
import type { RepPaySummary } from "@/lib/repPay";

const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-AU", { month: "short", year: "numeric", timeZone: "UTC" });

/** What the rep has been paid, what is coming, and every sale behind it. */
export function CommissionSales({ plan, pay, sales, goal, thisMonth }: { plan: CompPlanRow; pay: RepPaySummary; sales: SaleCommission[]; goal: RepGoal; thisMonth: string }) {
  const months = useMemo(() => monthlyCommission(sales, plan.active_from, thisMonth), [sales, plan.active_from, thisMonth]);
  const [show, setShow] = useState<"month" | "all">("all");
  const base = plan.base_annual / 12;
  const commissionTarget = goal.monthly != null ? Math.max(0, goal.monthly - base) : null;
  const locked = base + pay.commission;
  const rows = sales.filter((s) => show === "all" || s.month === thisMonth).slice().reverse();
  const oneOffOwed = pay.awaiting.filter((a) => a.billing_period === "one_off");
  const top = Math.max(1, ...months.map((m) => m.commission), commissionTarget && commissionTarget <= 4 * Math.max(1, ...months.map((m) => m.commission)) ? commissionTarget : 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Commission this month", money(pay.commission), `${pay.sales.length} ${pay.sales.length === 1 ? "payment" : "payments"} in`],
          ["Retainer paid this month", money(pay.retainerPaid), pay.nextBracket ? `${money(pay.nextBracket.toGo)} to ${Math.round(pay.nextBracket.rate * 100)}%` : "top bracket"],
          ["Still to come", money(pay.loadedTotal), `${pay.loaded.length} owed or verbal`],
          ["Commission on this plan", money(sales.reduce((t, s) => t + s.commission, 0)), `${sales.length} ${sales.length === 1 ? "payment" : "payments"}`],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">{value}</p>
            <p className="text-[11px] text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      {goal.monthly != null ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">{monthLabel(thisMonth)} against target</span>
            <span className="font-mono tabular-nums text-foreground">{money(locked)} <span className="text-muted-foreground">of {money(goal.monthly)}</span></span>
          </div>
          <Progress value={Math.min(100, (locked / goal.monthly) * 100)} aria-label="Take-home against target" />
          <p className="mt-2 text-xs text-muted-foreground">
            {locked >= goal.monthly ? "Target hit." : `${money(goal.monthly - locked)} to go.`} A full month of base ({money(base)}) plus commission paid so far.
          </p>
        </div>
      ) : null}

      <LevelUpBar retainerPaid={pay.retainerPaid} loaded={pay.loadedTotal} />

      <Panel title="Commission by month" note="On cash paid in the month.">
        <div className="h-56 w-full" role="img" aria-label="Commission each month">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={months} margin={{ top: 22, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis width={54} domain={[0, top * 1.1]} ticks={niceTicks(0, top * 1.1, 4)} tickFormatter={moneyAxis} tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                content={({ active, payload }) => {
                  const r = active ? (payload?.[0]?.payload as (typeof months)[number] | undefined) : undefined;
                  return r ? <TipBox title={monthLabel(r.month)} rows={[{ label: "Commission", value: money(r.commission) }, { label: "Retainer paid", value: money(r.retainer) }, { label: "One-off paid", value: money(r.oneOff) }, { label: "Take-home", value: money(base + r.commission) }]} /> : null;
                }}
              />
              {commissionTarget != null && commissionTarget > 0 && commissionTarget <= top * 1.1 ? (
                <ReferenceLine y={commissionTarget} stroke={MUTED} strokeDasharray="4 4" label={{ value: `Target needs ${money(commissionTarget)}`, position: "insideTopRight", fontSize: 11, fill: MUTED }} />
              ) : null}
              <Bar dataKey="commission" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                <LabelList dataKey="commission" position="top" formatter={(v: number) => money(v)} style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="My sales" actions={<Chips<"month" | "all"> label="Sales shown" value={show} onChange={setShow} options={[{ value: "month", label: "This month" }, { value: "all", label: "All" }]} />}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                <th className="py-2 pr-3 font-normal">Client</th>
                <th className="py-2 pr-3 font-normal">Status</th>
                <th className="py-2 pr-3 text-right font-normal">First-month cash</th>
                <th className="hidden py-2 pr-3 text-right font-normal sm:table-cell">Rate</th>
                <th className="py-2 text-right font-normal">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pay.loaded.map((l) => (
                <tr key={l.key}>
                  <td className="py-2 pr-3 text-foreground">{l.business_name ?? "Unnamed"}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{l.kind === "owed" ? `Signed ${dayLabel(l.day)}, ${pay.awaiting.some((a) => a.deal_id === l.key && a.paid > 0) ? "balance owed" : "not paid"}` : `Verbal yes ${dayLabel(l.day)}`}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">{l.amount == null ? "-" : money(l.amount)}</td>
                  <td className="hidden py-2 pr-3 text-right text-xs text-muted-foreground sm:table-cell">-</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">once paid</td>
                </tr>
              ))}
              {oneOffOwed.map((a) => (
                <tr key={a.deal_id}>
                  <td className="py-2 pr-3 text-foreground">{a.business_name ?? "Unnamed"}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">One-off from {dayLabel(a.start_date)}, not paid</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted-foreground">{money(a.outstanding)}</td>
                  <td className="hidden py-2 pr-3 text-right text-xs text-muted-foreground sm:table-cell">5%</td>
                  <td className="py-2 text-right text-xs text-muted-foreground">once paid</td>
                </tr>
              ))}
              {rows.map((s) => (
                <tr key={`${s.contact_id}|${s.day}`}>
                  <td className="py-2 pr-3 text-foreground">{s.business_name ?? "Unnamed"}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">Paid {dayLabel(s.day)}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{money(s.retainer + s.oneOff)}</td>
                  <td className="hidden py-2 pr-3 text-right text-xs text-muted-foreground sm:table-cell">{bracketLabel(s)}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{money(s.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length + pay.loaded.length + oneOffOwed.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No sales here yet.</p> : null}
        <p className="mt-3 text-[11px] text-muted-foreground">Each payment is paid at the brackets it lands in that month, so the first ones in a month show a low rate and later ones a higher rate.</p>
      </Panel>
    </div>
  );
}
