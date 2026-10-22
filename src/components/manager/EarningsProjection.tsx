import { useEffect, useMemo, useState } from "react";
import { RotateCcw, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallLogsByDateRange } from "@/hooks/useCallLogs";
import { useBookedAppointmentsByDateRange, useSalesReps, type BookedAppointmentReportItem } from "@/hooks/usePipelineItems";
import { ANSWERED_OUTCOMES, type ReportCallLog } from "@/lib/reportMetrics";
import { SETTER_PLAN, commissionFor, tierFor } from "@/lib/compPlan";
import { cn } from "@/lib/utils";

/**
 * "If everything stays the same, what does this rep earn?" Each rep's observed funnel
 * over the lookback (dials a day, pickup, pickup to booking, first-meeting show rate,
 * shown to close, average first collection) is run through the commission plan to a
 * monthly and annual number. Every input is editable so a manager can ask what a
 * better show rate or ten more dials a day is worth, in dollars, to the rep.
 */

const TZ = "Australia/Melbourne";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

interface Observed {
  dials: number;
  activeDays: number;
  pickups: number;
  bookings: number;
  firstResolved: number;
  firstShowed: number;
  showedAll: number;
  closes: number;
  collection: number;
}

interface Inputs {
  dialsPerDay: number;
  pickupRate: number;
  bookingRate: number;
  showRate: number;
  closeRate: number;
  avgCollection: number;
  daysPerMonth: number;
}

function observe(repId: string, logs: ReportCallLog[], bookings: BookedAppointmentReportItem[]): Observed {
  const mine = logs.filter((l) => l.user_id === repId);
  const days = new Set(mine.map((l) => dayKey(l.created_at)));
  const set = bookings.filter((b) => b.created_by === repId);
  const first = set.filter((b) => !b.is_follow_up);
  const resolvedFirst = first.filter((b) => ["showed", "noshow", "cancelled", "rescheduled"].includes(b.resolved_bucket ?? ""));
  const closes = set.filter((b) => b.appointment_outcome === "showed_closed");
  return {
    dials: mine.length,
    activeDays: days.size,
    pickups: mine.filter((l) => ANSWERED_OUTCOMES.has(l.outcome)).length,
    bookings: set.length,
    firstResolved: resolvedFirst.length,
    firstShowed: resolvedFirst.filter((b) => b.resolved_bucket === "showed").length,
    showedAll: set.filter((b) => b.resolved_bucket === "showed").length,
    closes: closes.length,
    collection: closes.reduce((sum, b) => sum + (b.deal_value ?? 0) + (b.monthly_recurring_value ?? 0), 0),
  };
}

function inputsFrom(o: Observed): Inputs {
  const safe = (n: number, d: number, fallback: number) => (d > 0 ? n / d : fallback);
  return {
    dialsPerDay: o.activeDays > 0 ? Math.round(o.dials / o.activeDays) : 0,
    pickupRate: safe(o.pickups, o.dials, 0.26),
    bookingRate: safe(o.bookings, o.pickups, 0.06),
    showRate: safe(o.firstShowed, o.firstResolved, 0.35),
    closeRate: safe(o.closes, o.showedAll, 0.3),
    avgCollection: o.closes > 0 ? o.collection / o.closes : 4000,
    daysPerMonth: SETTER_PLAN.workingDaysPerMonth,
  };
}

function project(i: Inputs) {
  const dials = i.dialsPerDay * i.daysPerMonth;
  const bookings = dials * i.pickupRate * i.bookingRate;
  const shows = bookings * i.showRate;
  const closes = shows * i.closeRate;
  const revenue = closes * i.avgCollection;
  const { tier, commission } = commissionFor(SETTER_PLAN, closes, revenue);
  const monthly = SETTER_PLAN.baseSalary / 12 + commission;
  return { dials, bookings, shows, closes, revenue, tier, commission, monthly, annual: monthly * 12 };
}

function Field({ label, value, onChange, step = 1, suffix, min = 0, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; min?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <Input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-7 w-20 bg-background px-2 text-right font-mono text-xs"
        />
        {suffix ? <span className="w-4 text-muted-foreground">{suffix}</span> : null}
      </span>
    </label>
  );
}

function RepCard({ name, observed, lookbackDays }: { name: string; observed: Observed; lookbackDays: number }) {
  const base = useMemo(() => inputsFrom(observed), [observed]);
  const [inputs, setInputs] = useState<Inputs>(base);
  useEffect(() => setInputs(base), [base]);
  const p = useMemo(() => project(inputs), [inputs]);
  const asIs = useMemo(() => project(base), [base]);

  const levers = useMemo(() => {
    const delta = (patch: Partial<Inputs>) => project({ ...inputs, ...patch }).annual - p.annual;
    return [
      { label: "+10 dials a day", value: delta({ dialsPerDay: inputs.dialsPerDay + 10 }) },
      { label: "+5 pts show rate", value: delta({ showRate: Math.min(1, inputs.showRate + 0.05) }) },
      { label: "+5 pts shown to close", value: delta({ closeRate: Math.min(1, inputs.closeRate + 0.05) }) },
      { label: "+$500 avg first collection", value: delta({ avgCollection: inputs.avgCollection + 500 }) },
    ];
  }, [inputs, p.annual]);

  const nextTier = SETTER_PLAN.tiers.find((t) => t.minDeals > p.closes) ?? null;
  const tierNow = tierFor(SETTER_PLAN, p.closes, p.revenue);
  const set = (patch: Partial<Inputs>) => setInputs((cur) => ({ ...cur, ...patch }));
  const changed = JSON.stringify(inputs) !== JSON.stringify(base);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{name}</CardTitle>
            <CardDescription className="text-xs">
              Last {lookbackDays} days: {observed.dials.toLocaleString()} dials over {observed.activeDays} active day{observed.activeDays === 1 ? "" : "s"},{" "}
              {observed.bookings} set, {observed.firstShowed} of {observed.firstResolved} first meetings sat, {observed.closes} closed for {money(observed.collection)}.
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold text-foreground">{money(p.annual)}</p>
            <p className="text-[11px] text-muted-foreground">a year · {money(p.monthly)} a month{changed ? ` · as-is ${money(asIs.annual)}` : ""}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_1fr]">
        <div className="space-y-1.5 rounded-md border border-border p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Inputs</p>
            {changed ? (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setInputs(base)}>
                <RotateCcw className="h-3 w-3" /> Observed
              </Button>
            ) : null}
          </div>
          <Field label="Dials a day" value={inputs.dialsPerDay} onChange={(v) => set({ dialsPerDay: v })} />
          <Field label="Pickup rate" value={Math.round(inputs.pickupRate * 100)} onChange={(v) => set({ pickupRate: v / 100 })} suffix="%" max={100} />
          <Field label="Pickup to booking" value={Math.round(inputs.bookingRate * 1000) / 10} onChange={(v) => set({ bookingRate: v / 100 })} step={0.5} suffix="%" max={100} />
          <Field label="Show rate (first meetings)" value={Math.round(inputs.showRate * 100)} onChange={(v) => set({ showRate: v / 100 })} suffix="%" max={100} />
          <Field label="Shown to close" value={Math.round(inputs.closeRate * 100)} onChange={(v) => set({ closeRate: v / 100 })} suffix="%" max={100} />
          <Field label="Avg first collection" value={Math.round(inputs.avgCollection)} onChange={(v) => set({ avgCollection: v })} step={100} suffix="$" />
          <Field label="Working days a month" value={inputs.daysPerMonth} onChange={(v) => set({ daysPerMonth: v })} step={0.1} max={23} />
        </div>

        <div className="space-y-1 rounded-md border border-border p-3 text-xs">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">A month at these rates</p>
          {[
            ["Dials", Math.round(p.dials).toLocaleString()],
            ["Bookings", p.bookings.toFixed(1)],
            ["Sittings", p.shows.toFixed(1)],
            ["Closes", p.closes.toFixed(1)],
            ["Month-one revenue", money(p.revenue)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono text-foreground">{v}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tier</span>
              <span className={cn("font-mono", tierNow ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400")}>
                {tierNow ? `${tierNow.label} · ${pct(tierNow.rate)}` : "below threshold · 0%"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Commission</span>
              <span className="font-mono text-foreground">{money(p.commission)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base</span>
              <span className="font-mono text-foreground">{money(SETTER_PLAN.baseSalary / 12)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-foreground">Take-home before super</span>
              <span className="font-mono text-foreground">{money(p.monthly)}</span>
            </div>
            {nextTier ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {nextTier.minDeals - p.closes > 0 ? `${(nextTier.minDeals - p.closes).toFixed(1)} more closes a month reaches ${pct(nextTier.rate)}.` : ""}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-1 rounded-md border border-border p-3 text-xs">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <TrendingUp className="h-3 w-3" /> What each lever is worth a year
          </p>
          {levers.map((l) => (
            <div key={l.label} className="flex justify-between">
              <span className="text-muted-foreground">{l.label}</span>
              <span className={cn("font-mono", l.value > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-foreground")}>
                {l.value > 0 ? "+" : ""}
                {money(l.value)}
              </span>
            </div>
          ))}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Commission is {SETTER_PLAN.tiers.map((t) => `${pct(t.rate)} at ${t.minDeals}`).join(", ")} deals a month (or the revenue
            equivalent), nothing below {SETTER_PLAN.tiers[0].minDeals}, on month-one cash collected. Base {money(SETTER_PLAN.baseSalary)} plus super.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function EarningsProjection() {
  const [lookback, setLookback] = useState("30");
  const days = Number(lookback);
  const to = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const from = useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10), [days]);
  const { data: logs = [], isLoading: logsLoading } = useCallLogsByDateRange(from, to);
  const { data: bookings = [], isLoading: bookingsLoading } = useBookedAppointmentsByDateRange(from, to);
  const { data: reps = [] } = useSalesReps();

  const cards = useMemo(
    () =>
      reps
        .map((r) => ({ id: r.user_id, name: r.display_name || r.email?.split("@")[0] || "Rep", observed: observe(r.user_id, logs as ReportCallLog[], bookings) }))
        .filter((c) => c.observed.dials > 0)
        .sort((a, b) => b.observed.dials - a.observed.dials),
    [reps, logs, bookings],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Rep earnings projection</h3>
          <p className="text-xs text-muted-foreground">
            Each rep's observed funnel, run through the Growth Consultant commission plan. Change any input to see what it is worth to them.
            Bookings, sittings and closes are credited to the rep who set them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Observed over</span>
          <Select value={lookback} onValueChange={setLookback}>
            <SelectTrigger className="h-8 w-[130px] bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="14">last 14 days</SelectItem>
              <SelectItem value="30">last 30 days</SelectItem>
              <SelectItem value="60">last 60 days</SelectItem>
              <SelectItem value="90">last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {logsLoading || bookingsLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : cards.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No dials in this window.</p>
      ) : (
        cards.map((c) => <RepCard key={c.id} name={c.name} observed={c.observed} lookbackDays={days} />)
      )}
      <Badge variant="outline" className="font-normal text-muted-foreground">
        Assumes the month-one revenue is collected; the plan pays on cash, so unpaid deals do not count.
      </Badge>
    </div>
  );
}
