import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useUserRole";
import { useRepCompPlans, useSetterFirstDeals, useSetterVerbalDeals } from "@/hooks/useFunnelTracker";
import { useSalesReps } from "@/hooks/usePipelineItems";
import { dayKeyOf, monthOf } from "@/lib/funnelTracker";
import { repPayThisMonth } from "@/lib/repPay";
import { cn } from "@/lib/utils";
import { LevelUpBar } from "@/components/dashboard/LevelUpBar";

const money = (v: number) => `$${Math.round(v).toLocaleString("en-AU")}`;
const pct = (r: number) => `${Math.round(r * 100)}%`;
const fmtDay = (k: string) =>
  new Date(`${k}T12:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = (m: string) =>
  new Date(`${m}T12:00:00Z`).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });

function Tile({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", highlight ? "border-primary/30 bg-primary/5" : "border-border bg-background")}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/**
 * Pay this month. A setter on a pay plan sees their own commission, how far to
 * the next bracket, base to date and deals still waiting on payment. Admins and
 * coaches see one row per setter. Nobody else sees anything.
 */
export function PayThisMonthCard() {
  const { user } = useAuth();
  const { canViewAdmin } = useAdminAccess();
  const { data: plans = [] } = useRepCompPlans();
  const { data: deals = [] } = useSetterFirstDeals(true);
  const { data: verbals = [] } = useSetterVerbalDeals(true);
  const { data: reps = [] } = useSalesReps();
  const today = dayKeyOf(new Date().toISOString());
  const month = monthOf(today);
  const name = useMemo(() => new Map(reps.map((r) => [r.user_id, r.display_name || r.email || "Unnamed"])), [reps]);

  const summaries = useMemo(
    () =>
      plans
        .filter((p) => p.role === "setter" && (canViewAdmin || p.user_id === user?.id))
        .map((p) => repPayThisMonth(deals, plans, p.user_id, month, today, verbals))
        .sort((a, b) => (name.get(a.setterId) ?? "").localeCompare(name.get(b.setterId) ?? "")),
    [plans, canViewAdmin, user?.id, deals, verbals, month, today, name],
  );

  if (summaries.length === 0) return null;
  const footnote = (
    <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
      Commission is paid on first-month cash, in the month it is paid: nothing on the first $18k of retainer cash, then 15%
      to $28k, 18% to $38k, 21% to $48k and 25% above, each dollar at the rate of its bracket; one-off and project cash earns
      5%. Base accrues daily. A sale counts once its first payment is marked paid. Grey on the bar is loaded: first-month
      retainer still owed on closed deals plus the retainer on verbal yeses from the last 30 days.
    </p>
  );

  if (canViewAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">Setter pay · {monthLabel(month)}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Commission, base to date and what is loaded (owed or verbal), per setter.</p>
          </div>
          <Link to="/insights?tab=tracker" className="text-xs font-medium text-primary underline-offset-2 hover:underline">
            Commission by sale and Mark paid
          </Link>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setter</TableHead>
                <TableHead className="text-right">First-month cash paid</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Level</TableHead>
                <TableHead className="text-right">Base to date</TableHead>
                <TableHead className="text-right">Pay to date</TableHead>
                <TableHead className="text-right">Loaded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((p) => (
                <TableRow key={p.setterId}>
                  <TableCell className="font-medium">{name.get(p.setterId) ?? "Setter"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {money(p.retainerPaid)}
                    {p.oneOffPaid > 0 ? <span className="text-muted-foreground"> + {money(p.oneOffPaid)} one-off</span> : null}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold tabular-nums">{money(p.commission)}</TableCell>
                  <TableCell>
                    <LevelUpBar retainerPaid={p.retainerPaid} loaded={p.loadedTotal} compact />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{money(p.baseToDate)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{money(p.payToDate)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {p.loaded.length > 0 ? `${p.loaded.length} · ${money(p.loadedTotal)}` : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {footnote}
      </div>
    );
  }

  const p = summaries[0];
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground">My pay · {monthLabel(month)}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Commission on first-month cash paid this month, plus base so far.</p>
      </div>
      <LevelUpBar retainerPaid={p.retainerPaid} loaded={p.loadedTotal} celebrateKey={`pay-level-${p.setterId}-${month}`} />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="Commission" value={money(p.commission)} sub={`now earning ${pct(p.currentRate)} on the next retainer dollar`} highlight />
        <Tile
          label="First-month cash paid"
          value={money(p.retainerPaid)}
          sub={p.oneOffPaid > 0 ? `+ ${money(p.oneOffPaid)} one-off · ${p.sales.length} paid` : `${p.sales.length} paid this month`}
        />
        <Tile label="Pay to date" value={money(p.payToDate)} sub={`${money(p.baseToDate)} base + ${money(p.commission)} commission`} highlight />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Paid this month</div>
          {p.sales.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing paid yet this month.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border text-xs">
              {p.sales.map((s) => (
                <li key={`${s.contact_id}-${s.day}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate">{s.business_name || "Client"}</span>
                  <span className="shrink-0 text-muted-foreground">{fmtDay(s.day)}</span>
                  <span className="shrink-0 font-mono tabular-nums">{money(s.retainer + s.oneOff)}</span>
                  <span className="w-16 shrink-0 text-right font-mono font-semibold tabular-nums">{money(s.commission)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">Loaded · coming next</div>
          {p.loaded.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing owed or verbal right now. Book the next one.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-dashed border-border bg-muted/40 text-xs">
              {p.loaded.map((l) => (
                <li key={l.key} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate">{l.business_name || "Client"}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {l.kind === "owed" ? `sold ${fmtDay(l.day)}` : `verbal ${fmtDay(l.day)}`}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {l.amount == null ? "value not entered" : l.kind === "owed" ? `${money(l.amount)} owed` : `${money(l.amount)}/mo`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {footnote}
    </div>
  );
}
