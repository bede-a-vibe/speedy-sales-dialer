import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Users, DollarSign, TrendingUp, TrendingDown, Layers, Timer, HandCoins, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useClientRollup,
  useDeleteClientDeal,
  useUpdateClientFollowUp,
  type ClientDeal,
  type ClientRollupRow,
} from "@/hooks/useClientDeals";
import {
  STREAM_LABELS,
  STREAM_ORDER,
  BILLING_PERIOD_LABELS,
  dealMrr,
  dealRevenueToDate,
  formatCurrency,
  formatCurrencyCents,
  type ClientStream,
  type BillingPeriod,
} from "@/lib/clientRevenue";
import { DealDialog, type DealDialogState } from "@/components/clients/DealDialog";

// ---------- KPI tile ----------
function KpiTile({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-2xl font-bold text-foreground tabular-nums">{value}</p>
            {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
          </div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}


// ---------- MRR by stream ----------
function MrrByStreamCard({ mrrByStream, totalMrr }: { mrrByStream: Record<ClientStream, number>; totalMrr: number }) {
  const rows = STREAM_ORDER
    .map((s) => ({ stream: s, mrr: mrrByStream[s] || 0 }))
    .filter((r) => r.mrr > 0)
    .sort((a, b) => b.mrr - a.mrr);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">MRR by stream</CardTitle>
        <CardDescription className="text-xs">Where the recurring monthly revenue comes from (ex-GST).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground py-2">No active MRR yet.</p>}
        {rows.map((r) => {
          const share = totalMrr > 0 ? (r.mrr / totalMrr) * 100 : 0;
          return (
            <div key={r.stream} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{STREAM_LABELS[r.stream]}</span>
                <span className="font-mono tabular-nums text-foreground">{formatCurrency(r.mrr)}<span className="text-muted-foreground"> · {share.toFixed(0)}%</span></span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, share)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------- Client row ----------
function fmtCycleDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function ClientDealsList({ client, onEdit, onAdd }: { client: ClientRollupRow; onEdit: (deal: ClientDeal) => void; onAdd: () => void }) {
  const deleteMut = useDeleteClientDeal();
  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
      {(client.firstBookingDate || client.signDate) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-[11px]">
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Sales cycle</span>
          <span className="text-muted-foreground">
            Booked <span className="text-foreground">{fmtCycleDate(client.firstBookingDate)}</span>
            {" → "}
            Signed <span className="text-foreground">{fmtCycleDate(client.signDate)}</span>
          </span>
          {client.salesCycleDays != null ? (
            <span className="font-semibold text-primary">{client.salesCycleDays}-day cycle</span>
          ) : (
            <span className="italic text-muted-foreground">{client.signDate ? "no booking date on file" : "add a deal to complete the cycle"}</span>
          )}
        </div>
      )}
      {client.deals.map((d) => {
        const mrr = dealMrr(d);
        const rev = dealRevenueToDate(d);
        const isChurned = d.status === "churned";
        return (
          <div key={d.id} className={cn("grid grid-cols-12 items-center gap-2 rounded-md bg-card border border-border px-3 py-2 text-xs", isChurned && "opacity-60")}>
            <div className="col-span-2 flex items-center gap-1">
              <Badge variant="secondary" className="font-normal">{STREAM_LABELS[d.stream as ClientStream]}</Badge>
              {isChurned && <Badge variant="outline" className="text-[9px] text-muted-foreground px-1">churned</Badge>}
            </div>
            <div className="col-span-3 font-mono tabular-nums">
              {formatCurrency(Number(d.amount))} <span className="text-muted-foreground">/ {BILLING_PERIOD_LABELS[d.billing_period as BillingPeriod].toLowerCase()}</span>
              {d.gst && <span className="text-[10px] text-muted-foreground ml-1">+GST</span>}
            </div>
            <div className="col-span-2 font-mono tabular-nums text-muted-foreground">
              {d.start_date}
              {isChurned && d.end_date && <span className="text-destructive"> → {d.end_date}</span>}
            </div>
            <div className="col-span-2 font-mono tabular-nums">{formatCurrency(mrr)}<span className="text-muted-foreground text-[10px]">/mo</span></div>
            <div className="col-span-2 font-mono tabular-nums">{formatCurrencyCents(rev)}</div>
            <div className="col-span-1 flex justify-end gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={async () => {
                  if (!window.confirm("Delete this deal?")) return;
                  try {
                    await deleteMut.mutateAsync(d.id);
                    toast({ title: "Deal deleted" });
                  } catch (err) {
                    toast({ title: "Delete failed", description: (err as Error).message, variant: "destructive" });
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
      <div className="pt-1">
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add deal for {client.businessName}
        </Button>
      </div>
    </div>
  );
}

// ---------- Deposits & onboarding row ----------
function OnboardingRow({ client, onAddDeal }: { client: ClientRollupRow; onAddDeal: () => void }) {
  const updateFollowUp = useUpdateClientFollowUp();
  const [date, setDate] = useState(client.followUpDate ?? "");
  const [note, setNote] = useState(client.followUpNote ?? "");
  const today = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(date) && date < today;
  return (
    <div className={cn("rounded-md border bg-card p-3", overdue ? "border-destructive/40" : "border-border")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="truncate text-sm font-medium">{client.businessName}</span>
          {client.state && <span className="text-[10px] font-mono text-muted-foreground">{client.state}</span>}
          <span className="text-xs text-muted-foreground">Deposit {formatCurrency(client.revenueToDate)}</span>
        </div>
        <Button size="sm" variant="outline" onClick={onAddDeal}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add full deal
        </Button>
      </div>
      <div className="mt-2 grid items-center gap-2 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Follow up</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              updateFollowUp.mutate({ contactId: client.contactId, date: e.target.value || null });
            }}
            className={cn("h-7 w-[145px] text-xs", overdue && "border-destructive text-destructive")}
          />
          {overdue && (
            <Badge variant="outline" className="border-destructive/40 text-destructive text-[9px] gap-1">
              <AlertTriangle className="h-2.5 w-2.5" /> Overdue
            </Badge>
          )}
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => updateFollowUp.mutate({ contactId: client.contactId, note: note || null })}
          placeholder="Note — what's outstanding, last contact…"
          className="h-7 text-xs"
        />
      </div>
    </div>
  );
}

// ---------- Page ----------
export default function ClientsPage() {
  const rollup = useClientRollup();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DealDialogState>({ open: false, mode: "create" });

  const avgMrr = rollup.totals.activeClients > 0 ? rollup.totals.totalMrr / rollup.totals.activeClients : 0;
  const onboardingClients = rollup.clients.filter((c) => c.isOnboarding);
  const mainClients = rollup.clients.filter((c) => !c.isOnboarding);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AppLayout title="Clients">
      <div className="max-w-7xl mx-auto p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Clients</h1>
            <p className="text-xs text-muted-foreground mt-1">Won-client MRR, realised revenue, and stream breakdown.</p>
          </div>
          <Button onClick={() => setDialog({ open: true, mode: "create" })}>
            <Plus className="h-4 w-4 mr-1" /> Add deal
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiTile label="Active clients" value={rollup.totals.activeClients.toLocaleString()} sub={rollup.totals.pendingClients > 0 ? `+${rollup.totals.pendingClients} awaiting deal $` : undefined} icon={Users} />
          <KpiTile label="Total MRR" value={formatCurrency(rollup.totals.totalMrr)} sub="/mo ex-GST" icon={DollarSign} />
          <KpiTile label="Revenue to date" value={formatCurrency(rollup.totals.totalRevenueToDate)} sub="realised, ex-GST" icon={TrendingUp} />
          <KpiTile label="Avg MRR / client" value={formatCurrency(avgMrr)} sub="active clients only" icon={Layers} />
          <KpiTile label="Avg sales cycle" value={rollup.totals.avgSalesCycleDays != null ? `${rollup.totals.avgSalesCycleDays}d` : "—"} sub="booking → sign" icon={Timer} />
          <KpiTile label="Lost MRR" value={formatCurrency(rollup.totals.churnedMrr)} sub="/mo churned" icon={TrendingDown} />
        </div>

        <MrrByStreamCard mrrByStream={rollup.totals.mrrByStream} totalMrr={rollup.totals.totalMrr} />

        {onboardingClients.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <HandCoins className="h-4 w-4 text-primary" /> Deposits &amp; Onboarding
              </CardTitle>
              <CardDescription className="text-xs">
                Paid a deposit but not on a full recurring deal yet — set a follow-up so they don't slip. Add their full deal to graduate them to active clients.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {onboardingClients.map((c) => (
                <OnboardingRow
                  key={c.contactId}
                  client={c}
                  onAddDeal={() => setDialog({ open: true, mode: "create", contactId: c.contactId, contactBusinessName: c.businessName })}
                />
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clients</CardTitle>
            <CardDescription className="text-xs">Click a row to see the individual deals.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {rollup.isLoading && <p className="p-6 text-xs text-muted-foreground">Loading…</p>}
            {!rollup.isLoading && mainClients.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No client deals yet.</p>
                <Button className="mt-3" onClick={() => setDialog({ open: true, mode: "create" })}>
                  <Plus className="h-4 w-4 mr-1" /> Add your first deal
                </Button>
              </div>
            )}
            {mainClients.length > 0 && (
              <div className="divide-y divide-border">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/30">
                  <div className="col-span-4">Business</div>
                  <div className="col-span-3">Streams</div>
                  <div className="col-span-1 text-right">MRR/mo</div>
                  <div className="col-span-2">Client since</div>
                  <div className="col-span-1 text-right">Revenue</div>
                  <div className="col-span-1 text-right">Status</div>
                </div>
                {mainClients.map((c) => {
                  const isOpen = expanded.has(c.contactId);
                  return (
                    <div key={c.contactId}>
                      <button
                        type="button"
                        onClick={() => toggleExpand(c.contactId)}
                        className="grid w-full grid-cols-12 gap-2 items-center px-4 py-3 text-sm text-left hover:bg-muted/40 transition-colors"
                      >
                        <div className="col-span-4 flex items-center gap-2 min-w-0">
                          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          <span className="font-medium truncate">{c.businessName}</span>
                          {c.state && <span className="text-[10px] font-mono text-muted-foreground">{c.state}</span>}
                        </div>
                        <div className="col-span-3 flex flex-wrap gap-1">
                          {c.dealRecorded ? (
                            c.streams.map((s) => (
                              <Badge key={s} variant="secondary" className="text-[10px] font-normal">{STREAM_LABELS[s]}</Badge>
                            ))
                          ) : (
                            <span className="text-[11px] italic text-muted-foreground">Deal not recorded — click to add</span>
                          )}
                        </div>
                        <div className="col-span-1 text-right font-mono tabular-nums">{c.dealRecorded ? formatCurrency(c.mrr) : <span className="text-muted-foreground">—</span>}</div>
                        <div className="col-span-2 font-mono tabular-nums text-xs text-muted-foreground">{c.clientSince ?? "—"}</div>
                        <div className="col-span-1 text-right font-mono tabular-nums">{c.dealRecorded ? formatCurrency(c.revenueToDate) : <span className="text-muted-foreground">—</span>}</div>
                        <div className="col-span-1 text-right">
                          {c.dealRecorded ? (
                            <Badge variant={c.status === "active" ? "default" : c.status === "paused" ? "secondary" : "outline"} className={cn("text-[10px] capitalize", c.status === "churned" && "text-muted-foreground")}>{c.status}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300">No deal</Badge>
                          )}
                        </div>
                      </button>
                      {isOpen && (
                        <ClientDealsList
                          client={c}
                          onEdit={(deal) => setDialog({ open: true, mode: "edit", deal, contactId: c.contactId, contactBusinessName: c.businessName })}
                          onAdd={() => setDialog({ open: true, mode: "create", contactId: c.contactId, contactBusinessName: c.businessName })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {dialog.open && (
        <DealDialog
          state={dialog}
          onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
          onSaved={() => rollup.refetch()}
        />
      )}
    </AppLayout>
  );
}