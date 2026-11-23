import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiTrend } from "@/components/goals/KpiTrend";
import { money, Panel } from "@/components/goals/chartKit";
import { useSaveRepGoal } from "@/hooks/useEarningsPlan";
import { planForTarget, projectEarnings, type ObservedEarnings } from "@/lib/earningsPlan";
import { formatMetric, GOAL_METRICS, metricValue, parseMetric, withTargets, type FunnelDay, type GoalKey, type KpiTargets, type RepGoal } from "@/lib/repGoals";
import type { RepFunnelCounts } from "@/lib/earningsPlan";
import type { Targets } from "@/lib/teamTargets";

type Draft = Record<GoalKey | "monthly", string>;
const asText = (kind: "n" | "pct" | "money", v: number | null | undefined) =>
  v == null ? "" : kind === "pct" ? String(Math.round(v * 1000) / 10) : String(Math.round(v));
const draftOf = (g: RepGoal) =>
  ({ monthly: asText("money", g.monthly), ...Object.fromEntries(GOAL_METRICS.map((m) => [m.key, asText(m.kind, g.kpis[m.key])])) }) as Draft;

const one = (n: number | null) => (n == null || !Number.isFinite(n) ? "-" : n.toFixed(1));
const COLS = "md:grid md:grid-cols-[minmax(150px,1.5fr)_repeat(2,minmax(80px,1fr))_minmax(130px,1.1fr)_minmax(80px,1fr)_minmax(110px,1.1fr)] md:items-center md:gap-3";

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-sm md:block md:py-0 md:text-right">
      <span className="text-xs text-muted-foreground md:sr-only">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{children}</span>
    </div>
  );
}

/** A rep's own targets next to what they are doing, and what hitting them all pays. */
export function GoalTargets({
  userId,
  name,
  goal,
  canEdit,
  observed,
  month,
  baseAnnual,
  managerTargets,
  days,
  today,
  windowDays,
}: {
  userId: string;
  name: string;
  goal: RepGoal;
  canEdit: boolean;
  observed: ObservedEarnings;
  month: { counts: RepFunnelCounts; clients: number; retainerTotal: number };
  baseAnnual: number;
  managerTargets: Targets;
  days: FunnelDay[];
  today: string;
  windowDays: number;
}) {
  const saved = useMemo(() => draftOf(goal), [goal]);
  const [draft, setDraft] = useState<Draft>(saved);
  useEffect(() => setDraft(saved), [saved]);
  const save = useSaveRepGoal();

  const monthly = parseMetric({ kind: "money" }, draft.monthly);
  const parsed = GOAL_METRICS.map((m) => [m, parseMetric(m, draft[m.key])] as const);
  const bad = monthly === undefined || parsed.some(([, v]) => v === undefined);
  const kpis = Object.fromEntries(parsed.flatMap(([m, v]) => (v ? [[m.key, v]] : []))) as KpiTargets;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const anyKpi = Object.keys(kpis).length > 0;

  const pace = projectEarnings(observed.inputs, baseAnnual);
  const hit = projectEarnings(withTargets(observed.inputs, kpis), baseAnnual);
  const plan = monthly ? planForTarget(monthly, withTargets(observed.inputs, kpis), baseAnnual) : null;
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-4">
      <Panel
        title={canEdit ? "My targets" : `${name}'s targets`}
        note={canEdit ? "Set your own. Only you can change them; your manager can see them." : "Set by the rep. Read only."}
        actions={
          canEdit ? (
            <div className="flex gap-2">
              {dirty ? <Button size="sm" variant="ghost" onClick={() => setDraft(saved)}>Undo</Button> : null}
              <Button
                size="sm"
                disabled={!dirty || bad || save.isPending}
                onClick={() =>
                  save.mutate(
                    { userId, goal: { monthly: monthly ?? null, kpis } },
                    { onSuccess: () => toast.success("Targets saved"), onError: () => toast.error("Could not save your targets. Try again.") },
                  )
                }
              >
                Save targets
              </Button>
            </div>
          ) : undefined
        }
      >
        <div className="mb-4 flex flex-wrap items-end gap-x-8 gap-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div>
            <p className="text-xs text-muted-foreground">Monthly take-home target</p>
            {canEdit ? (
              <span className="mt-1 flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">$</span>
                <Input aria-label="Monthly take-home target" inputMode="numeric" value={draft.monthly} onChange={(e) => set("monthly", e.target.value)} placeholder="e.g. 7000" className="h-9 w-28 bg-background font-mono" />
              </span>
            ) : (
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{goal.monthly == null ? "Not set" : money(goal.monthly)}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">At your pace</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{money(pace.monthly)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Hitting every target</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{anyKpi ? money(hit.monthly) : "-"}</p>
          </div>
          <p className="min-w-[200px] flex-1 text-xs text-muted-foreground">
            {!plan || !monthly
              ? "A month, base included, before tax and super."
              : plan.commissionNeeded <= 0
                ? "Your base covers this on its own."
                : `${money(monthly)} takes ${money(plan.retainerNeeded)} of first-month retainer: ${one(plan.clients)} clients, ${one(plan.sittings)} sittings, ${one(plan.bookingsPerDay)} bookings a day${anyKpi ? " at your target rates" : " at your rates"}.${
                    anyKpi ? (hit.monthly >= monthly ? " Your targets get you there." : ` Your targets fall ${money(monthly - hit.monthly)} short.`) : ""
                  }`}
          </p>
        </div>

        <div className={`hidden border-b border-border pb-2 text-[11px] text-muted-foreground ${COLS}`}>
          <span>KPI</span>
          <span className="text-right">Last {windowDays} days</span>
          <span className="text-right">This month</span>
          <span className="text-right">My target</span>
          <span className="text-right">Manager target</span>
          <span className="text-right">To go this month</span>
        </div>
        <div className="divide-y divide-border">
          {GOAL_METRICS.map((m) => {
            const now = observed.inputs[m.key] || null;
            const thisMonth = metricValue(m.key, month.counts, month.clients, month.retainerTotal);
            const target = kpis[m.key];
            const mgr = m.manager ? managerTargets[m.manager.key] : null;
            const invalid = parseMetric(m, draft[m.key]) === undefined;
            const current = thisMonth ?? now;
            const gap = target != null && current != null ? target - current : null;
            return (
              <div key={m.key} className={`py-3 ${COLS}`}>
                <div className="mb-1 md:mb-0">
                  <p className="text-sm font-medium text-foreground">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground">{m.hint}</p>
                </div>
                <Cell label={`Last ${windowDays} days`}>{formatMetric(m, now)}</Cell>
                <Cell label="This month">{formatMetric(m, thisMonth)}</Cell>
                <Cell label="My target">
                  {canEdit ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">{m.kind === "money" ? "$" : ""}</span>
                      <Input
                        aria-label={`${m.label} target`}
                        aria-invalid={invalid}
                        inputMode="decimal"
                        value={draft[m.key]}
                        onChange={(e) => set(m.key, e.target.value)}
                        className={`h-8 w-20 bg-background px-2 text-right font-mono text-sm ${invalid ? "border-destructive" : ""}`}
                      />
                      <span className="w-3 text-xs text-muted-foreground">{m.kind === "pct" ? "%" : ""}</span>
                    </span>
                  ) : (
                    formatMetric(m, target)
                  )}
                </Cell>
                <Cell label="Manager target">{formatMetric(m, mgr == null ? null : mgr * m.manager!.scale)}</Cell>
                <Cell label="To go this month">
                  {gap == null ? (
                    "-"
                  ) : gap <= 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs"><Check className="h-3.5 w-3.5 text-[hsl(var(--positive))]" aria-hidden="true" /> On target</span>
                  ) : m.kind === "pct" ? (
                    `${(gap * 100).toFixed(1)} pts`
                  ) : (
                    formatMetric(m, gap)
                  )}
                </Cell>
              </div>
            );
          })}
        </div>
        {bad ? <p className="mt-2 text-xs text-destructive">Check the highlighted target. Rates go up to 100%.</p> : null}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          This month: {month.counts.dials.toLocaleString("en-AU")} dials over {month.counts.active_days} days, {month.counts.first_bookings} first meetings booked, {month.counts.sat} of {month.counts.resolved} finished bookings sat, {month.clients} new clients. A dash means too few to call a rate yet.
        </p>
      </Panel>
      <KpiTrend days={days} kpis={kpis} today={today} />
    </div>
  );
}
