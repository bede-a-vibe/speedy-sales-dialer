import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, Users, DollarSign, TrendingUp, Layers } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  useClientRollup,
  useCreateClientDeal,
  useUpdateClientDeal,
  useDeleteClientDeal,
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
  type ClientDealStatus,
} from "@/lib/clientRevenue";

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

// ---------- Deal dialog ----------
interface DealDialogState {
  open: boolean;
  mode: "create" | "edit";
  contactId?: string;
  contactBusinessName?: string;
  deal?: ClientDeal;
}

function DealDialog({
  state,
  onOpenChange,
  onSaved,
}: {
  state: DealDialogState;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const createMut = useCreateClientDeal();
  const updateMut = useUpdateClientDeal();

  const editing = state.mode === "edit" && state.deal;
  const [contactId, setContactId] = useState<string | null>(state.contactId ?? state.deal?.contact_id ?? null);
  const [contactLabel, setContactLabel] = useState<string>(state.contactBusinessName ?? "");
  const [search, setSearch] = useState("");
  const [stream, setStream] = useState<ClientStream>((state.deal?.stream as ClientStream) ?? "google_ads");
  const [amount, setAmount] = useState<string>(state.deal?.amount ? String(state.deal.amount) : "");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>((state.deal?.billing_period as BillingPeriod) ?? "monthly");
  const [gst, setGst] = useState<boolean>(state.deal?.gst ?? true);
  const [startDate, setStartDate] = useState<string>(state.deal?.start_date ?? new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<ClientDealStatus>((state.deal?.status as ClientDealStatus) ?? "active");
  const [notes, setNotes] = useState<string>(state.deal?.notes ?? "");

  const contactSearch = useQuery({
    queryKey: ["client-deal-contact-search", search],
    enabled: !editing && !state.contactId && search.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, business_name, state, lifecycle_stage")
        .ilike("business_name", `%${search.trim()}%`)
        .order("business_name")
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  const disabled = !contactId || !amount || Number(amount) <= 0;

  async function handleSave() {
    try {
      if (editing && state.deal) {
        await updateMut.mutateAsync({
          id: state.deal.id,
          patch: {
            stream,
            amount: Number(amount),
            billing_period: billingPeriod,
            gst,
            start_date: startDate,
            status,
            notes: notes || null,
          },
        });
        toast({ title: "Deal updated" });
      } else {
        if (!contactId) return;
        await createMut.mutateAsync({
          contact_id: contactId,
          stream,
          amount: Number(amount),
          billing_period: billingPeriod,
          gst,
          start_date: startDate,
          status,
          notes: notes || null,
        });
        toast({ title: "Deal added", description: "Contact marked as a won client." });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Save failed", description: (err as Error).message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit deal" : "Add deal"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!editing && !state.contactId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Client</Label>
              {contactId ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  <span className="truncate">{contactLabel}</span>
                  <Button size="sm" variant="ghost" onClick={() => { setContactId(null); setContactLabel(""); }}>Change</Button>
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search business name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {contactSearch.data && contactSearch.data.length > 0 && (
                    <div className="max-h-48 overflow-auto rounded-md border border-border bg-card">
                      {contactSearch.data.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setContactId(c.id);
                            setContactLabel(c.business_name ?? "(no name)");
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="truncate">{c.business_name ?? "(no name)"}</span>
                          {c.state && <span className="text-[10px] font-mono text-muted-foreground ml-2">{c.state}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {(editing || state.contactId) && contactLabel && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-[10px] font-mono uppercase text-muted-foreground mr-2">Client</span>
              {contactLabel}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Stream</Label>
              <Select value={stream} onValueChange={(v) => setStream(v as ClientStream)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STREAM_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>{STREAM_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ClientDealStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="churned">Churned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (ex-GST)</Label>
              <Input inputMode="decimal" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Billing period</Label>
              <Select value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as BillingPeriod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(BILLING_PERIOD_LABELS) as BillingPeriod[]).map((p) => (
                    <SelectItem key={p} value={p}>{BILLING_PERIOD_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex items-end pb-1.5">
              <div className="flex items-center gap-2">
                <Switch checked={gst} onCheckedChange={setGst} id="gst-toggle" />
                <Label htmlFor="gst-toggle" className="text-xs cursor-pointer">GST added on top when invoiced</Label>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional context…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={disabled || createMut.isPending || updateMut.isPending}>
            {editing ? "Save changes" : "Add deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
function ClientDealsList({ client, onEdit, onAdd }: { client: ClientRollupRow; onEdit: (deal: ClientDeal) => void; onAdd: () => void }) {
  const deleteMut = useDeleteClientDeal();
  return (
    <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-2">
      {client.deals.map((d) => {
        const mrr = dealMrr(d);
        const rev = dealRevenueToDate(d);
        return (
          <div key={d.id} className="grid grid-cols-12 items-center gap-2 rounded-md bg-card border border-border px-3 py-2 text-xs">
            <div className="col-span-2">
              <Badge variant="secondary" className="font-normal">{STREAM_LABELS[d.stream as ClientStream]}</Badge>
            </div>
            <div className="col-span-3 font-mono tabular-nums">
              {formatCurrency(Number(d.amount))} <span className="text-muted-foreground">/ {BILLING_PERIOD_LABELS[d.billing_period as BillingPeriod].toLowerCase()}</span>
              {d.gst && <span className="text-[10px] text-muted-foreground ml-1">+GST</span>}
            </div>
            <div className="col-span-2 font-mono tabular-nums text-muted-foreground">{d.start_date}</div>
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

// ---------- Page ----------
export default function ClientsPage() {
  const rollup = useClientRollup();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DealDialogState>({ open: false, mode: "create" });

  const avgMrr = rollup.totals.activeClients > 0 ? rollup.totals.totalMrr / rollup.totals.activeClients : 0;

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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiTile label="Active clients" value={rollup.totals.activeClients.toLocaleString()} icon={Users} />
          <KpiTile label="Total MRR" value={formatCurrency(rollup.totals.totalMrr)} sub="/mo ex-GST" icon={DollarSign} />
          <KpiTile label="Revenue to date" value={formatCurrency(rollup.totals.totalRevenueToDate)} sub="realised, ex-GST" icon={TrendingUp} />
          <KpiTile label="Avg MRR / client" value={formatCurrency(avgMrr)} sub="active clients only" icon={Layers} />
        </div>

        <MrrByStreamCard mrrByStream={rollup.totals.mrrByStream} totalMrr={rollup.totals.totalMrr} />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clients</CardTitle>
            <CardDescription className="text-xs">Click a row to see the individual deals.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {rollup.isLoading && <p className="p-6 text-xs text-muted-foreground">Loading…</p>}
            {!rollup.isLoading && rollup.clients.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No client deals yet.</p>
                <Button className="mt-3" onClick={() => setDialog({ open: true, mode: "create" })}>
                  <Plus className="h-4 w-4 mr-1" /> Add your first deal
                </Button>
              </div>
            )}
            {rollup.clients.length > 0 && (
              <div className="divide-y divide-border">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-muted/30">
                  <div className="col-span-4">Business</div>
                  <div className="col-span-3">Streams</div>
                  <div className="col-span-1 text-right">MRR/mo</div>
                  <div className="col-span-2">Client since</div>
                  <div className="col-span-1 text-right">Revenue</div>
                  <div className="col-span-1 text-right">Status</div>
                </div>
                {rollup.clients.map((c) => {
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
                          {c.streams.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[10px] font-normal">{STREAM_LABELS[s]}</Badge>
                          ))}
                        </div>
                        <div className="col-span-1 text-right font-mono tabular-nums">{formatCurrency(c.mrr)}</div>
                        <div className="col-span-2 font-mono tabular-nums text-xs text-muted-foreground">{c.clientSince ?? "—"}</div>
                        <div className="col-span-1 text-right font-mono tabular-nums">{formatCurrency(c.revenueToDate)}</div>
                        <div className="col-span-1 text-right">
                          <Badge variant={c.status === "active" ? "default" : c.status === "paused" ? "secondary" : "outline"} className={cn("text-[10px] capitalize", c.status === "churned" && "text-muted-foreground")}>{c.status}</Badge>
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