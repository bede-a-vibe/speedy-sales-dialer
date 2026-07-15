import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  useCreateClientDeal,
  useUpdateClientDeal,
  type ClientDeal,
} from "@/hooks/useClientDeals";
import {
  STREAM_LABELS,
  STREAM_ORDER,
  BILLING_PERIOD_LABELS,
  type ClientStream,
  type BillingPeriod,
  type ClientDealStatus,
} from "@/lib/clientRevenue";

export interface DealDialogState {
  open: boolean;
  mode: "create" | "edit";
  contactId?: string;
  contactBusinessName?: string;
  deal?: ClientDeal;
}

export function DealDialog({
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
  const [endDate, setEndDate] = useState<string>(state.deal?.end_date ?? "");
  const [pausedAt, setPausedAt] = useState<string>(state.deal?.paused_at ?? "");

  // Churned deals carry an end date (revenue accrues up to it); non-churned clear it.
  const resolvedEndDate = status === "churned" ? (endDate || new Date().toISOString().slice(0, 10)) : null;
  // Paused deals carry a pause date; otherwise cleared.
  const resolvedPausedAt = status === "paused" ? (pausedAt || new Date().toISOString().slice(0, 10)) : null;

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
            end_date: resolvedEndDate,
            paused_at: resolvedPausedAt,
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
          end_date: resolvedEndDate,
          paused_at: resolvedPausedAt,
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

          {status === "paused" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Pause date</Label>
              <Input
                type="date"
                value={pausedAt || new Date().toISOString().slice(0, 10)}
                onChange={(e) => setPausedAt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">When this deal was paused. MRR won't count while paused.</p>
            </div>
          )}

          {status === "churned" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Churn / end date</Label>
              <Input
                type="date"
                value={endDate || new Date().toISOString().slice(0, 10)}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Revenue counts up to this date; MRR stops.</p>
            </div>
          )}

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