import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Range = "today" | "7d" | "30d";
const RANGE_LABEL: Record<Range, string> = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" };

function rangeStart(r: Range) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (r === "7d") d.setDate(d.getDate() - 6);
  if (r === "30d") d.setDate(d.getDate() - 29);
  return d;
}

type Row = { user_id: string | null; call_log_id: string | null; contact_id: string | null; talk_time_seconds: number | null };

async function fetchCalls(since: Date): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("dialpad_calls")
      .select("user_id, call_log_id, contact_id, talk_time_seconds")
      .gte("started_at", since.toISOString())
      .range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function DialpadSyncHealth() {
  const [range, setRange] = useState<Range>("today");
  const [syncing, setSyncing] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dialpad-sync-health", range],
    queryFn: async () => {
      const [calls, state, profiles] = await Promise.all([
        fetchCalls(rangeStart(range)),
        supabase.from("dialpad_sync_state").select("last_synced_at, last_run_at, last_pulled, last_error").limit(1).maybeSingle(),
        supabase.from("profiles").select("user_id, full_name"),
      ]);
      const names = new Map<string, string>();
      (profiles.data ?? []).forEach((p: any) => names.set(p.user_id, p.full_name || "Unnamed"));
      const byRep = new Map<string, { name: string; total: number; linked: number; contact: number; connected: number }>();
      for (const c of calls) {
        const key = c.user_id ?? "none";
        const r = byRep.get(key) ?? { name: c.user_id ? names.get(c.user_id) ?? "Unknown rep" : "Not matched to a rep", total: 0, linked: 0, contact: 0, connected: 0 };
        r.total++;
        if (c.call_log_id) r.linked++;
        if (c.contact_id) r.contact++;
        if ((c.talk_time_seconds ?? 0) > 0) r.connected++;
        byRep.set(key, r);
      }
      const reps = [...byRep.values()].sort((a, b) => b.total - a.total);
      const totals = reps.reduce((a, r) => ({ total: a.total + r.total, linked: a.linked + r.linked, contact: a.contact + r.contact, connected: a.connected + r.connected }), { total: 0, linked: 0, contact: 0, connected: 0 });
      return { reps, totals, state: state.data as any };
    },
    refetchInterval: 60_000,
  });

  const runSync = async () => {
    setSyncing(true);
    try {
      const since = rangeStart(range === "today" ? "today" : range).getTime();
      const { data: res, error } = await supabase.functions.invoke("dialpad", {
        body: { action: "sync_dialpad_call_history", since_ms: Math.max(since, Date.now() - 7 * 86400_000) },
      });
      if (error) throw error;
      if (res?.ok === false) throw new Error(res.error || "Sync failed");
      const pulled = Object.values((res?.pulled_by_user ?? {}) as Record<string, number>).reduce((a, b) => a + b, 0) + (res?.office_pulled ?? 0);
      toast.success(`Sync finished — ${pulled} calls checked with Dialpad.`);
      qc.invalidateQueries({ queryKey: ["dialpad-sync-health"] });
    } catch (e: any) {
      toast.error(e?.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const t = data?.totals;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
  const lastSync = data?.state?.last_run_at || data?.state?.last_synced_at;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dialpad call sync</h2>
          <p className="text-sm text-muted-foreground">
            Last sync: {lastSync ? new Date(lastSync).toLocaleString("en-AU") : "never"} · runs automatically every 3 minutes
          </p>
          {data?.state?.last_error && (
            <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {data.state.last_error}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border p-0.5">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <Button key={r} size="sm" variant={range === r ? "secondary" : "ghost"} className="h-7" onClick={() => setRange(r)}>
                {RANGE_LABEL[r]}
              </Button>
            ))}
          </div>
          <Button size="sm" onClick={runSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Sync now
          </Button>
        </div>
      </div>

      {isLoading || !t ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Calls in the app", value: t.total.toLocaleString() },
              { label: "Connected", value: `${t.connected.toLocaleString()} (${pct(t.connected, t.total)})` },
              { label: "Matched to a contact", value: `${t.contact.toLocaleString()} (${pct(t.contact, t.total)})` },
              { label: "Linked to a call record", value: `${t.linked.toLocaleString()} (${pct(t.linked, t.total)})` },
            ].map((s) => (
              <div key={s.label} className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-lg font-semibold font-mono text-foreground">{s.value}</div>
              </div>
            ))}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rep</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Connected</TableHead>
                <TableHead className="text-right">Contact matched</TableHead>
                <TableHead className="text-right">Call record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reps.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No Dialpad calls in this period.</TableCell></TableRow>
              )}
              {data.reps.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right font-mono">{r.total}</TableCell>
                  <TableCell className="text-right font-mono">{r.connected}</TableCell>
                  <TableCell className="text-right font-mono">{r.contact} <span className="text-muted-foreground">({pct(r.contact, r.total)})</span></TableCell>
                  <TableCell className="text-right font-mono">
                    {r.linked === r.total && <CheckCircle2 className="inline h-3.5 w-3.5 text-primary mr-1" />}
                    {r.linked} <span className="text-muted-foreground">({pct(r.linked, r.total)})</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Calls without a call record are usually ones where the rep didn't log an outcome — they link up automatically once one is logged.
          </p>
        </>
      )}
    </div>
  );
}
