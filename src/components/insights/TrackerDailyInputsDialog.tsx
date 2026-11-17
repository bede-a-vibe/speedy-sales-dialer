import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useAdminAccess } from "@/hooks/useUserRole";
import { useSaveTrackerDailyInputs, useTrackerDailyInputs, type DailyInputWrite } from "@/hooks/useFunnelTracker";
import type { SalesRepOption } from "@/hooks/usePipelineItems";
import type { CompPlanRow } from "@/lib/funnelTracker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDay: string;
  reps: SalesRepOption[];
  compPlans: CompPlanRow[];
}

const toNumber = (v: string) => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const toText = (v: number | null | undefined) => (v == null ? "" : String(v));

/**
 * Daily inputs the dialer cannot see: each setter's rostered hours (cold) and
 * ad spend, clicks and leads (ads). Admins and coaches edit everything; a rep
 * edits only their own rostered hours (RLS enforces the same).
 */
export function TrackerDailyInputsDialog({ open, onOpenChange, defaultDay, reps, compPlans }: Props) {
  const { user } = useAuth();
  const { canViewAdmin } = useAdminAccess();
  const [day, setDay] = useState(defaultDay);
  useEffect(() => { if (open) setDay(defaultDay); }, [open, defaultDay]);

  const { data: rows = [], isLoading } = useTrackerDailyInputs(open ? day : undefined, open ? day : undefined);
  const save = useSaveTrackerDailyInputs();

  // Setters on a pay plan; reps (who cannot read pay plans) see only themselves.
  const people = useMemo(() => {
    const setterIds = new Set(compPlans.filter((p) => p.role === "setter").map((p) => p.user_id));
    const list = canViewAdmin
      ? reps.filter((r) => setterIds.size === 0 || setterIds.has(r.user_id))
      : reps.filter((r) => r.user_id === user?.id);
    if (!canViewAdmin && user && list.length === 0) list.push({ user_id: user.id, display_name: "Me", email: user.email ?? null });
    return list;
  }, [compPlans, reps, canViewAdmin, user]);

  const [hours, setHours] = useState<Record<string, string>>({});
  const [ads, setAds] = useState({ ad_spend: "", clicks: "", leads: "" });
  useEffect(() => {
    if (!open) return;
    const h: Record<string, string> = {};
    for (const r of rows) if (r.funnel === "cold" && r.user_id) h[r.user_id] = toText(r.rostered_hours);
    setHours(h);
    const adsRow = rows.find((r) => r.funnel === "ads" && !r.user_id);
    setAds({ ad_spend: toText(adsRow?.ad_spend), clicks: toText(adsRow?.clicks), leads: toText(adsRow?.leads) });
  }, [rows, open]);

  const handleSave = async () => {
    const writes: DailyInputWrite[] = [];
    const existingHours = new Map(rows.filter((r) => r.funnel === "cold" && r.user_id).map((r) => [r.user_id!, r.rostered_hours]));
    for (const p of people) {
      const raw = hours[p.user_id] ?? "";
      const value = toNumber(raw);
      if (Number.isNaN(value)) { toast.error("Rostered hours must be a number."); return; }
      if (value === (existingHours.get(p.user_id) ?? null)) continue;
      if (!canViewAdmin && p.user_id !== user?.id) continue;
      writes.push({ day, funnel: "cold", user_id: p.user_id, rostered_hours: value });
    }
    if (canViewAdmin) {
      const spend = toNumber(ads.ad_spend);
      const clicks = toNumber(ads.clicks);
      const leads = toNumber(ads.leads);
      if ([spend, clicks, leads].some((v) => Number.isNaN(v))) { toast.error("Ad spend, clicks and leads must be numbers."); return; }
      const adsRow = rows.find((r) => r.funnel === "ads" && !r.user_id);
      const changed = !adsRow
        ? spend !== null || clicks !== null || leads !== null
        : spend !== (adsRow.ad_spend ?? null) || clicks !== (adsRow.clicks ?? null) || leads !== (adsRow.leads ?? null);
      if (changed) writes.push({ day, funnel: "ads", user_id: null, ad_spend: spend, clicks: clicks == null ? null : Math.round(clicks), leads: leads == null ? null : Math.round(leads) });
    }
    if (writes.length === 0) { onOpenChange(false); return; }
    try {
      await save.mutateAsync(writes);
      toast.success("Daily inputs saved.");
      onOpenChange(false);
    } catch {
      toast.error("Could not save the daily inputs.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Daily inputs</DialogTitle>
          <DialogDescription>
            {canViewAdmin ? "Rostered hours per setter and the day's ad numbers." : "Your rostered hours for the day."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tracker-input-day" className="text-xs text-muted-foreground">Day</Label>
            <Input id="tracker-input-day" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Rostered hours (cold)</p>
            {people.length === 0 ? <p className="text-xs text-muted-foreground">No setters found.</p> : null}
            {people.map((p) => (
              <div key={p.user_id} className="flex items-center justify-between gap-3">
                <Label htmlFor={`hours-${p.user_id}`} className="text-sm">{p.display_name || p.email || "Unnamed rep"}</Label>
                <Input
                  id={`hours-${p.user_id}`}
                  inputMode="decimal"
                  value={hours[p.user_id] ?? ""}
                  onChange={(e) => setHours((h) => ({ ...h, [p.user_id]: e.target.value }))}
                  placeholder="0"
                  className="w-24 text-right font-mono"
                  disabled={isLoading}
                />
              </div>
            ))}
          </div>
          {canViewAdmin ? (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ads</p>
              {([
                ["ad_spend", "Ad spend ($)"],
                ["clicks", "Clicks"],
                ["leads", "Leads"],
              ] as const).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <Label htmlFor={`ads-${key}`} className="text-sm">{label}</Label>
                  <Input
                    id={`ads-${key}`}
                    inputMode="decimal"
                    value={ads[key]}
                    onChange={(e) => setAds((a) => ({ ...a, [key]: e.target.value }))}
                    placeholder="0"
                    className="w-28 text-right font-mono"
                    disabled={isLoading}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={save.isPending || isLoading}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
