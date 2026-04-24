import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Download, Pause, Play, RefreshCw } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ghlBulkLinkContacts, type GHLBulkLinkResult } from "@/lib/ghl";

type SyncMode = "active" | "all";

interface SyncTotals {
  processed: number;
  linked: number;
  failed: number;
  skipped: number;
  startedAt: number;
  lastBatchMs: number;
}

interface SyncErrorRow {
  contactId: string;
  error: string;
}

const initialTotals: SyncTotals = {
  processed: 0,
  linked: 0,
  failed: 0,
  skipped: 0,
  startedAt: 0,
  lastBatchMs: 0,
};

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `~${hrs}h ${rem}m`;
}

async function fetchCounts() {
  const [totalRes, linkedRes, activeUnlinkedRes] = await Promise.all([
    supabase.from("contacts").select("id", { count: "exact", head: true }),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .not("ghl_contact_id", "is", null)
      .neq("ghl_contact_id", ""),
    supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .or("ghl_contact_id.is.null,ghl_contact_id.eq.")
      .not("phone", "is", null)
      .in("status", ["dnc", "follow_up", "booked", "called"]),
  ]);

  const total = totalRes.count ?? 0;
  const linked = linkedRes.count ?? 0;
  const activeUnlinked = activeUnlinkedRes.count ?? 0;
  return {
    total,
    linked,
    unlinked: Math.max(0, total - linked),
    activeUnlinked,
  };
}

export default function GhlSyncPage() {
  const { toast } = useToast();
  const countsQuery = useQuery({
    queryKey: ["ghl-sync-counts"],
    queryFn: fetchCounts,
    refetchInterval: 10_000,
  });

  const [batchSize, setBatchSize] = useState<number>(50);
  const [delayMs, setDelayMs] = useState<number>(6000);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<SyncMode | null>(null);
  const [totals, setTotals] = useState<SyncTotals>(initialTotals);
  const [errors, setErrors] = useState<SyncErrorRow[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);

  const stopRef = useRef(false);
  const offsetRef = useRef(0);

  const counts = countsQuery.data;
  const linkedPct = counts && counts.total > 0 ? (counts.linked / counts.total) * 100 : 0;

  const targetTotal = useMemo(() => {
    if (mode === "active") return counts?.activeUnlinked ?? 0;
    if (mode === "all") return counts?.unlinked ?? 0;
    return 0;
  }, [mode, counts]);

  const processed = totals.processed;
  const progressPct = targetTotal > 0 ? Math.min(100, (processed / targetTotal) * 100) : 0;

  const eta = useMemo(() => {
    if (!running || processed === 0 || targetTotal === 0) return "—";
    const elapsedSec = (Date.now() - totals.startedAt) / 1000;
    const ratePerSec = processed / Math.max(1, elapsedSec);
    const remainingItems = Math.max(0, targetTotal - processed);
    return formatEta(remainingItems / Math.max(0.0001, ratePerSec));
  }, [running, processed, targetTotal, totals.startedAt]);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  const runSync = useCallback(
    async (chosenMode: SyncMode) => {
      if (running) return;
      stopRef.current = false;
      offsetRef.current = 0;
      setMode(chosenMode);
      setTotals({ ...initialTotals, startedAt: Date.now() });
      setErrors([]);
      setRemaining(null);
      setRunning(true);

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (stopRef.current) break;
          const t0 = performance.now();
          let result: GHLBulkLinkResult;
          try {
            result = await ghlBulkLinkContacts({
              batchSize,
              delayMs,
              offset: offsetRef.current,
              statusFilter: chosenMode === "active" ? "active" : "all",
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast({
              title: "Sync batch failed",
              description: msg,
              variant: "destructive",
            });
            break;
          }
          const elapsed = performance.now() - t0;

          setTotals((prev) => ({
            ...prev,
            processed: prev.processed + result.processed,
            linked: prev.linked + result.linked,
            failed: prev.failed + result.failed,
            skipped: prev.skipped + result.skipped,
            lastBatchMs: elapsed,
          }));
          if (result.errors && result.errors.length) {
            setErrors((prev) => [...prev, ...result.errors!].slice(0, 500));
          }
          setRemaining(result.total);
          offsetRef.current = result.nextOffset;

          if (!result.hasMore || result.processed === 0) break;

          // Brief pause between batches so the UI can update and to be polite to GHL.
          if (delayMs > 0) {
            await new Promise((r) => setTimeout(r, Math.min(delayMs, 8000)));
          }
          if (stopRef.current) break;
        }
      } finally {
        setRunning(false);
        countsQuery.refetch();
        if (!stopRef.current) {
          toast({
            title: "GHL sync complete",
            description: "All contacts in the selected scope have been processed.",
          });
        }
      }
    },
    [batchSize, delayMs, running, toast, countsQuery],
  );

  // Stop running sync if the user navigates away
  useEffect(() => {
    return () => {
      stopRef.current = true;
    };
  }, []);

  const downloadErrors = () => {
    if (errors.length === 0) return;
    const csv = "contact_id,error\n" + errors.map((e) => `${e.contactId},"${e.error.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ghl-sync-errors-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6 max-w-5xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">GHL Sync</h1>
          <p className="text-sm text-muted-foreground">
            Reconcile Supabase contacts with GoHighLevel. Each unlinked contact is matched to GHL by phone; new
            contacts are created only when no match exists.
          </p>
        </div>

        {/* Snapshot */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Reconciliation status</CardTitle>
              <CardDescription>Live counts from your contacts table</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => countsQuery.refetch()} disabled={countsQuery.isFetching}>
              <RefreshCw className={`h-4 w-4 ${countsQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Stat label="Total contacts" value={counts?.total ?? 0} />
              <Stat label="Linked to GHL" value={counts?.linked ?? 0} accent="text-primary" />
              <Stat label="Unlinked" value={counts?.unlinked ?? 0} accent="text-amber-600" />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground font-mono">
                <span>Linked coverage</span>
                <span>{linkedPct.toFixed(1)}%</span>
              </div>
              <Progress value={linkedPct} />
            </div>
          </CardContent>
        </Card>

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run a sync</CardTitle>
            <CardDescription>
              Active-only is recommended first — it links the high-value DNC, follow-up, booked, and called rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Batch size</label>
                <Select
                  value={String(batchSize)}
                  onValueChange={(v) => setBatchSize(Number(v))}
                  disabled={running}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 75, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Pause between</label>
                <Select
                  value={String(delayMs)}
                  onValueChange={(v) => setDelayMs(Number(v))}
                  disabled={running}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2000, 4000, 6000, 8000, 12000].map((ms) => (
                      <SelectItem key={ms} value={String(ms)}>{ms / 1000}s</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2 ml-auto">
                <Button
                  variant="default"
                  onClick={() => runSync("active")}
                  disabled={running || (counts?.activeUnlinked ?? 0) === 0}
                >
                  <Play className="h-4 w-4" />
                  Sync Active Only ({counts?.activeUnlinked ?? 0})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => runSync("all")}
                  disabled={running || (counts?.unlinked ?? 0) === 0}
                >
                  <Play className="h-4 w-4" />
                  Sync All Unlinked ({counts?.unlinked ?? 0})
                </Button>
                {running && (
                  <Button variant="destructive" onClick={stop}>
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                )}
              </div>
            </div>

            {(running || mode) && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {running ? "Running" : "Last run"} —{" "}
                    {mode === "active" ? "Active only" : "All unlinked"}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {processed} / {targetTotal} · ETA {eta}
                  </span>
                </div>
                <Progress value={progressPct} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <MiniStat label="Linked" value={totals.linked} icon={<CheckCircle2 className="h-3.5 w-3.5 text-primary" />} />
                  <MiniStat label="Skipped" value={totals.skipped} />
                  <MiniStat label="Failed" value={totals.failed} icon={<AlertCircle className="h-3.5 w-3.5 text-destructive" />} />
                  <MiniStat label="Last batch" value={`${(totals.lastBatchMs / 1000).toFixed(1)}s`} />
                </div>
                {remaining !== null && (
                  <p className="text-xs text-muted-foreground font-mono">
                    Server-reported remaining unlinked in scope: {remaining}
                  </p>
                )}
                {errors.length > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      {errors.length} error{errors.length === 1 ? "" : "s"} captured
                    </span>
                    <Button variant="outline" size="sm" onClick={downloadErrors}>
                      <Download className="h-4 w-4" />
                      Download CSV
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono tabular-nums ${accent ?? ""}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="font-mono tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}