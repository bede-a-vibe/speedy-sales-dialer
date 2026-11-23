import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSaveEarningTarget } from "@/hooks/useEarningsPlan";
import { planForTarget, projectEarnings, type EarningsInputs, type ObservedEarnings } from "@/lib/earningsPlan";
import type { RepPaySummary } from "@/lib/repPay";
import { cn } from "@/lib/utils";

const money = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-AU")}` : "-");
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const one = (n: number | null) => (n == null || !Number.isFinite(n) ? "-" : n.toFixed(1));

function Field({ id, label, value, onChange, step = 1, suffix, max }: { id: string; label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; max?: number }) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <Input
          id={id}
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={0}
          max={max}
          onChange={(e) => {
            const v = Math.max(0, Number(e.target.value) || 0);
            onChange(max == null ? v : Math.min(max, v));
          }}
          className="h-7 w-20 bg-background px-2 text-right font-mono text-xs"
        />
        <span className="w-4 text-muted-foreground">{suffix ?? ""}</span>
      </span>
    </label>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-2 text-xs", strong && "font-medium")}>
      <span className={strong ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

const Heading = ({ children }: { children: string }) => (
  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{children}</p>
);

/**
 * A setter's own numbers run through the plan they are paid on, a monthly
 * target they set themselves, and what that target takes a day. Reps edit their
 * own target; managers see the same planner read-only.
 */
export function EarningsPlanner({
  userId,
  observed,
  baseAnnual,
  pay,
  target,
  canEditTarget,
  windowDays,
}: {
  userId: string;
  observed: ObservedEarnings;
  baseAnnual: number;
  pay: RepPaySummary | null;
  target: number | null;
  canEditTarget: boolean;
  windowDays: number;
}) {
  const base = observed.inputs;
  const [inputs, setInputs] = useState<EarningsInputs>(base);
  useEffect(() => setInputs(base), [base]);
  const [draft, setDraft] = useState(target == null ? "" : String(target));
  useEffect(() => setDraft(target == null ? "" : String(target)), [target]);
  const save = useSaveEarningTarget();

  const now = useMemo(() => projectEarnings(base, baseAnnual), [base, baseAnnual]);
  const p = useMemo(() => projectEarnings(inputs, baseAnnual), [inputs, baseAnnual]);
  const draftNumber = Number(draft.replace(/[$,\s]/g, ""));
  const draftOk = draft.trim() !== "" && Number.isFinite(draftNumber) && draftNumber > 0 && draftNumber <= 100_000;
  const goal = draftOk ? draftNumber : target;
  const plan = useMemo(() => (goal ? planForTarget(goal, inputs, baseAnnual) : null), [goal, inputs, baseAnnual]);
  const set = (patch: Partial<EarningsInputs>) => setInputs((cur) => ({ ...cur, ...patch }));
  const changed = JSON.stringify(inputs) !== JSON.stringify(base);
  const f = (k: string) => `earn-${userId}-${k}`;

  const saveTarget = (value: number | null) =>
    save.mutate(
      { userId, target: value },
      {
        onSuccess: () => toast.success(value == null ? "Target cleared" : `Target saved: ${money(value)} a month`),
        onError: () => toast.error("Could not save the target. Try again."),
      },
    );

  const paid = pay?.retainerPaid ?? 0;
  const stillNeeded = plan ? Math.max(0, plan.retainerNeeded - paid) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <Heading>{changed ? "With your changes" : "At your current pace"}</Heading>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">{money(p.monthly)} <span className="text-sm font-normal text-muted-foreground">a month</span></p>
          <p className="text-xs text-muted-foreground">
            {money(p.annual)} a year, before tax and super{changed ? `. Current pace: ${money(now.monthly)} a month` : ""}
          </p>
          {observed.noClients ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">No clients in the last {windowDays} days yet, so this is base only. Type in a close rate and average client to plan.</p>
          ) : observed.thin ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Built on only {observed.counts.sat} sittings and {observed.clients} clients, so treat it as a rough guide.</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2"><Target className="h-4 w-4 text-primary" aria-hidden="true" /><Heading>My monthly target</Heading></div>
          {canEditTarget ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input aria-label="Monthly take-home target" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. 7000" className="h-9 w-32 bg-background font-mono" />
              <Button size="sm" disabled={!draftOk || draftNumber === target || save.isPending} onClick={() => saveTarget(draftNumber)}>Save target</Button>
              {target != null ? <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => saveTarget(null)}>Clear</Button> : null}
            </div>
          ) : (
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">{target == null ? "Not set" : money(target)}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {plan
              ? plan.commissionNeeded <= 0
                ? `Covered by your base (${money(p.base)} a month).`
                : plan.reached
                  ? "You're on pace for this."
                  : `${money((goal ?? 0) - p.monthly)} a month above this pace.`
              : "Take-home before tax and super, base included."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5 rounded-md border border-border p-3">
          <div className="flex min-h-6 items-center justify-between">
            <Heading>Your numbers</Heading>
            {changed ? (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setInputs(base)}><RotateCcw className="h-3 w-3" /> Reset</Button>
            ) : null}
          </div>
          <Field id={f("dials")} label="Dials a day" value={inputs.dialsPerDay} onChange={(v) => set({ dialsPerDay: v })} />
          <Field id={f("pickup")} label="Dials that pick up" value={Math.round(inputs.pickupRate * 1000) / 10} onChange={(v) => set({ pickupRate: v / 100 })} step={0.5} suffix="%" max={100} />
          <Field id={f("book")} label="Pickups that book" value={Math.round(inputs.bookingRate * 1000) / 10} onChange={(v) => set({ bookingRate: v / 100 })} step={0.5} suffix="%" max={100} />
          <Field id={f("sit")} label="Bookings that sit" value={Math.round(inputs.sitRate * 1000) / 10} onChange={(v) => set({ sitRate: v / 100 })} step={1} suffix="%" max={100} />
          <Field id={f("close")} label="Sittings that close" value={Math.round(inputs.closeRate * 1000) / 10} onChange={(v) => set({ closeRate: v / 100 })} step={1} suffix="%" max={100} />
          <Field id={f("avg")} label="Average client, first month" value={Math.round(inputs.avgRetainer)} onChange={(v) => set({ avgRetainer: v })} step={100} suffix="$" />
          <Field id={f("days")} label="Working days a month" value={inputs.daysPerMonth} onChange={(v) => set({ daysPerMonth: v })} step={0.1} max={23} />
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            Last {windowDays} days: {observed.counts.dials.toLocaleString("en-AU")} dials over {observed.counts.active_days} days, {observed.counts.first_bookings} first meetings booked, {observed.counts.sat} of {observed.counts.resolved} sat, {observed.clients} clients worth {money(observed.retainerTotal)}. Change any number to see what it does.
          </p>
        </div>

        <div className="space-y-1 rounded-md border border-border p-3">
          <Heading>A month at these numbers</Heading>
          <Row label="First meetings booked" value={one(p.bookings)} />
          <Row label="Sittings" value={one(p.sittings)} />
          <Row label="Clients" value={one(p.clients)} />
          <Row label="First-month retainer cash" value={money(p.retainerCash)} />
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            <Row label="Base" value={money(p.base)} />
            <Row label="Commission" value={money(p.commission)} />
            <Row label="Take-home before tax and super" value={money(p.monthly)} strong />
          </div>
        </div>

        <div className="space-y-1 rounded-md border border-border p-3">
          <Heading>{goal ? `What ${money(goal)} a month takes` : "What your target takes"}</Heading>
          {!plan ? (
            <p className="text-xs text-muted-foreground">{canEditTarget ? "Set a target to see the clients, sittings and dials it takes." : "No target set yet."}</p>
          ) : plan.commissionNeeded <= 0 ? (
            <p className="text-xs text-muted-foreground">Nothing beyond your base.</p>
          ) : (
            <>
              <Row label="First-month retainer cash" value={money(plan.retainerNeeded)} />
              <Row label="Clients a month" value={one(plan.clients)} />
              <Row label="Sittings a month" value={one(plan.sittings)} />
              <Row label="First meetings booked a month" value={one(plan.bookings)} />
              <Row label="Booked a day" value={one(plan.bookingsPerDay)} strong />
              {pay ? (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  <Row label="Paid so far this month" value={money(paid)} />
                  <Row label="Still needed this month" value={money(stillNeeded)} strong />
                  {pay.loadedTotal > 0 ? <Row label="Loaded (owed or verbal)" value={money(pay.loadedTotal)} /> : null}
                </div>
              ) : null}
              {!plan.reached && plan.alone.some((a) => a.need != null) ? (
                <div className="mt-2 space-y-1 border-t border-border pt-2">
                  <p className="text-[11px] text-muted-foreground">Or lift just one:</p>
                  {plan.alone.map((a) => (
                    <Row key={a.label} label={a.label} value={a.need == null ? "not on its own" : a.kind === "pct" ? `${pct1(a.now)} to ${pct1(a.need)}` : `${a.now} to ${a.need}`} />
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        An estimate from your own numbers, not a promise. Commission is on first-month retainer cash in the month it is paid: nothing on the first $18k, then 15% to $28k, 18% to $38k, 21% to $48k and 25% above, each dollar at its bracket's rate. One-off cash (5%) is left out.
      </p>
    </div>
  );
}
