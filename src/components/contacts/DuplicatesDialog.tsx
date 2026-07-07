import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDuplicateGroups, useMergeContacts, type DuplicateGroup } from "@/hooks/useContacts";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

type Contact = Tables<"contacts">;

type ActivityCounts = Record<string, number>;

type ResolvedGroup = {
  key: string;
  normalizedPhone: string;
  masterId: string;
  loserIds: string[];
  contacts: Contact[];
};

export function DuplicatesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: groups = [], isLoading, refetch } = useDuplicateGroups(open);
  const merge = useMergeContacts();
  const [contactsById, setContactsById] = useState<Record<string, Contact>>({});
  const [activityById, setActivityById] = useState<ActivityCounts>({});
  const [hydrating, setHydrating] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const allIds = useMemo(() => Array.from(new Set(groups.flatMap((g) => g.contact_ids))), [groups]);

  // Hydrate contact details + activity counts once when groups arrive
  useMemo(() => {
    if (!open || allIds.length === 0) return;
    if (Object.keys(contactsById).length >= allIds.length) return;
    void (async () => {
      setHydrating(true);
      try {
        const { data: rows } = await supabase.from("contacts").select("*").in("id", allIds);
        const map: Record<string, Contact> = {};
        (rows ?? []).forEach((c) => { map[c.id] = c as Contact; });
        setContactsById(map);

        // Best-effort activity counts (sum of pipeline items + notes + call logs)
        const [pi, cn, cl] = await Promise.all([
          supabase.from("pipeline_items").select("contact_id").in("contact_id", allIds),
          supabase.from("contact_notes").select("contact_id").in("contact_id", allIds),
          supabase.from("call_logs").select("contact_id").in("contact_id", allIds),
        ]);
        const counts: ActivityCounts = {};
        [...(pi.data ?? []), ...(cn.data ?? []), ...(cl.data ?? [])].forEach((r: { contact_id: string | null }) => {
          if (!r.contact_id) return;
          counts[r.contact_id] = (counts[r.contact_id] ?? 0) + 1;
        });
        setActivityById(counts);
      } finally {
        setHydrating(false);
      }
    })();
  }, [open, allIds, contactsById]);

  const resolvedGroups = useMemo<ResolvedGroup[]>(() => {
    return groups.map((g: DuplicateGroup) => {
      const rows = g.contact_ids
        .map((id) => contactsById[id])
        .filter((c): c is Contact => Boolean(c));
      // pick master: has ghl_contact_id > most activity > most recently updated
      const ranked = [...rows].sort((a, b) => {
        const ag = a.ghl_contact_id ? 1 : 0;
        const bg = b.ghl_contact_id ? 1 : 0;
        if (ag !== bg) return bg - ag;
        const aa = activityById[a.id] ?? 0;
        const ba = activityById[b.id] ?? 0;
        if (aa !== ba) return ba - aa;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      const masterId = ranked[0]?.id ?? g.contact_ids[0];
      return {
        key: g.normalized_phone,
        normalizedPhone: g.normalized_phone,
        masterId,
        loserIds: g.contact_ids.filter((id) => id !== masterId),
        contacts: ranked,
      };
    });
  }, [groups, contactsById, activityById]);

  const runMerge = async (group: ResolvedGroup) => {
    if (group.loserIds.length === 0) return;
    setBusyKey(group.key);
    try {
      await merge.mutateAsync({ masterId: group.masterId, loserIds: group.loserIds });
      toast.success(`Merged ${group.loserIds.length} duplicate(s) into master.`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Merge failed.");
    } finally {
      setBusyKey(null);
    }
  };

  const runMergeAll = async () => {
    const eligible = resolvedGroups.filter((g) => g.loserIds.length > 0 && g.contacts.length === g.loserIds.length + 1);
    if (eligible.length === 0) {
      toast.message("No fully-loaded groups to merge.");
      return;
    }
    if (!window.confirm(`Merge all ${eligible.length} exact-phone duplicate groups? Losers are soft-archived and reversible.`)) return;
    setBusyKey("__all__");
    let merged = 0;
    try {
      for (const g of eligible) {
        await merge.mutateAsync({ masterId: g.masterId, loserIds: g.loserIds });
        merged += g.loserIds.length;
      }
      toast.success(`Merged ${merged} duplicate contact(s).`);
      await refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk merge failed.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Duplicate contacts (exact phone match)</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between border-b border-border pb-2 text-xs text-muted-foreground">
          <span>
            {isLoading || hydrating
              ? "Loading duplicate groups…"
              : `${resolvedGroups.length} group(s) · ${resolvedGroups.reduce((n, g) => n + g.loserIds.length, 0)} contacts would be archived`}
          </span>
          <Button size="sm" variant="secondary" onClick={runMergeAll} disabled={busyKey === "__all__" || resolvedGroups.length === 0}>
            {busyKey === "__all__" ? "Merging…" : "Merge all groups"}
          </Button>
        </div>
        <div className="overflow-y-auto space-y-3 pt-2">
          {resolvedGroups.length === 0 && !isLoading && !hydrating && (
            <p className="py-8 text-center text-sm text-muted-foreground">No exact-phone duplicate groups. Nice and clean.</p>
          )}
          {resolvedGroups.map((g) => (
            <div key={g.key} className="rounded border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-mono text-xs text-muted-foreground">Phone: {g.normalizedPhone} · {g.contacts.length} rows</p>
                <Button size="sm" onClick={() => runMerge(g)} disabled={busyKey === g.key || g.loserIds.length === 0}>
                  {busyKey === g.key ? "Merging…" : `Merge ${g.loserIds.length} into master`}
                </Button>
              </div>
              <div className="space-y-1.5 text-xs">
                {g.contacts.map((c) => {
                  const isMaster = c.id === g.masterId;
                  return (
                    <div key={c.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${isMaster ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"}`}>
                      <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${isMaster ? "bg-emerald-500/20 text-emerald-700" : "bg-secondary text-secondary-foreground"}`}>
                        {isMaster ? "MASTER" : "LOSER"}
                      </span>
                      <span className="font-medium text-foreground">{c.business_name}</span>
                      <span className="text-muted-foreground">{c.phone}</span>
                      {c.ghl_contact_id && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700">GHL</span>}
                      <span className="ml-auto text-muted-foreground">
                        {activityById[c.id] ?? 0} activity · updated {format(new Date(c.updated_at), "MMM d")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}