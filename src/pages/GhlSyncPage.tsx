import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Pause, Play, RefreshCw, Loader2, RotateCcw } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelBackgroundGhlSync,
  resumeBackgroundGhlSync,
  startBackgroundGhlSync,
} from "@/lib/ghl";

type SyncMode = "active" | "all";
type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

interface SyncJob {
  id: string;
  mode: SyncMode;
  status: JobStatus;
  batch_size: number;
  delay_ms: number;
  current_offset: number;
  total: number;
  processed: number;
  linked: number;
  failed: number;
  skipped: number;
  last_batch_ms: number;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string;
  created_at: string;
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `~${hrs}h ${rem}m`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
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

async function fetchLatestJob(): Promise<SyncJob | null> {
  const { data, error } = await supabase
    .from("ghl_sync_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[GhlSync] fetch latest job failed:", error);
    return null;
  }
  return (data as SyncJob | null) ?? null;
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

  const jobQuery = useQuery({
    queryKey: ["ghl-sync-latest-job"],
    queryFn: fetchLatestJob,
    refetchInterval: (q) => {
      const job = q.state.data as SyncJob | null;
      return job && (job.status === "running" || job.status === "queued") ? 3000 : 15000;
    },
  });

  const counts = countsQuery.data;
  const linkedPct = counts && counts.total > 0 ? (counts.linked / counts.total) * 100 : 0;
  const job = jobQuery.data ?? null;
  const isActive = !!job && (job.status === "running" || job.status === "queued");

  // Detect stalled job (no heartbeat for 2+ min)
  const isStalled = useMemo(() => {
    if (!isActive || !job) return false;
    return Date.now() - new Date(job.heartbeat_at).getTime() > 120_000;
  }, [isActive, job]);

  const targetTotal = job?.total ?? 0;
  const processed = job?.processed ?? 0;
  const progressPct = targetTotal > 0 ? Math.min(100, (processed / targetTotal) * 100) : 0;

  const eta = useMemo(() => {
    if (!isActive || !job?.started_at || processed === 0 || targetTotal === 0) return "—";
    const elapsedSec = (Date.now() - new Date(job.started_at).getTime()) / 1000;
    const ratePerSec = processed / Math.max(1, elapsedSec);
    const remainingItems = Math.max(0, targetTotal - processed);
    return formatEta(remainingItems / Math.max(0.0001, ratePerSec));
  }, [isActive, job, processed, targetTotal]);

  const [actionPending, setActionPending] = useState(false);

  const start = useCallback(
    async (chosenMode: SyncMode) => {
      setActionPending(true);
      try {
        await startBackgroundGhlSync({ mode: chosenMode, batchSize, delayMs });
        toast({
          title: "Background sync started",
          description: "It will keep running even if you close this page.",
        });
        await jobQuery.refetch();
      } catch (err) {
        toast({
          title: "Failed to start sync",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      } finally {
        setActionPending(false);
      }
    },
    [batchSize, delayMs, jobQuery, toast],
  );

  const stop = useCallback(async () => {
    if (!job) return;
    setActionPending(true);
    try {
      await cancelBackgroundGhlSync(job.id);
      toast({ title: "Stopping background sync", description: "Will halt after the current batch." });
      await jobQuery.refetch();
    } catch (err) {
      toast({
        title: "Failed to stop sync",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setActionPending(false);
    }
  }, [job, jobQuery, toast]);

  const resume = useCallback(async () => {
    setActionPending(true);
    try {
      await resumeBackgroundGhlSync();
      toast({ title: "Resumed background sync" });
      await jobQuery.refetch();
    } catch (err) {
      toast({
        title: "Failed to resume sync",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setActionPending(false);
    }
  }, [jobQuery, toast]);

  const statusBadge = (status: JobStatus) => {
    const map: Record<JobStatus, { label: string; cls: string; icon: React.ReactNode }> = {
      queued:    { label: "Queued",    cls: "bg-muted text-muted-foreground", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
      running:   { label: "Running",   cls: "bg-primary/10 text-primary",      icon: <Loader2 className="h-3 w-3 animate-spin" /> },
      done:      { label: "Completed", cls: "bg-emerald-500/10 text-emerald-600", icon: <CheckCircle2 className="h-3 w-3" /> },
      failed:    { label: "Failed",    cls: "bg-destructive/10 text-destructive", icon: <AlertCircle className="h-3 w-3" /> },
      cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground", icon: <Pause className="h-3 w-3" /> },
    };
    const v = map[status];
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${v.cls}`}>
        {v.icon}
        {v.label}
      </span>
    );
  };

  return (
    <AppLayout>
      <div className="container mx-auto p-6 space-y-6 max-w-5xl">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">GHL Sync</h1>
          <p className="text-sm text-muted-foreground">
            Reconcile contacts with GoHighLevel. Sync runs in the background — you can close this page and come back later.
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

        {/* Background job card */}
        {job && (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">
                    {isActive ? "Background sync" : "Last sync run"}
                  </CardTitle>
                  {statusBadge(job.status)}
                </div>
                <CardDescription>
                  Mode: {job.mode === "active" ? "Active only" : "All unlinked"} · Started {formatRelative(job.started_at ?? job.created_at)}
                  {job.finished_at && ` · Finished ${formatRelative(job.finished_at)}`}
                </CardDescription>
              </div>
              {isActive && (
                <Button variant="destructive" size="sm" onClick={stop} disabled={actionPending}>
                  <Pause className="h-4 w-4" />
                  Stop
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Progress</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {processed.toLocaleString()} / {targetTotal.toLocaleString()} · ETA {eta}
                </span>
              </div>
              <Progress value={progressPct} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <MiniStat label="Linked" value={job.linked} icon={<CheckCircle2 className="h-3.5 w-3.5 text-primary" />} />
                <MiniStat label="Skipped" value={job.skipped} />
                <MiniStat label="Failed" value={job.failed} icon={<AlertCircle className="h-3.5 w-3.5 text-destructive" />} />
                <MiniStat label="Last batch" value={`${(job.last_batch_ms / 1000).toFixed(1)}s`} />
              </div>
              {isActive && (
                <p className="text-xs text-muted-foreground font-mono">
                  Heartbeat: {formatRelative(job.heartbeat_at)} · auto-refreshing
                </p>
              )}
              {isStalled && (
                <div className="flex items-center justify-between gap-3 p-3 rounded-md border border-amber-500/30 bg-amber-500/5">
                  <div className="text-xs text-amber-700 dark:text-amber-400">
                    No heartbeat for 2+ minutes — the worker may have been evicted. Resume from offset {job.current_offset}.
                  </div>
                  <Button variant="outline" size="sm" onClick={resume} disabled={actionPending}>
                    <RotateCcw className="h-4 w-4" />
                    Resume
                  </Button>
                </div>
              )}
              {job.last_error && (
                <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-xs text-destructive">
                  <span className="font-medium">Error: </span>{job.last_error}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Start a new sync</CardTitle>
            <CardDescription>
              Active-only links high-value DNC, follow-up, booked, and called rows first. Runs in the background.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Batch size</label>
                <Select
                  value={String(batchSize)}
                  onValueChange={(v) => setBatchSize(Number(v))}
                  disabled={isActive}
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
                  disabled={isActive}
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
                  onClick={() => start("active")}
                  disabled={isActive || actionPending || (counts?.activeUnlinked ?? 0) === 0}
                >
                  <Play className="h-4 w-4" />
                  Sync Active Only ({counts?.activeUnlinked ?? 0})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => start("all")}
                  disabled={isActive || actionPending || (counts?.unlinked ?? 0) === 0}
                >
                  <Play className="h-4 w-4" />
                  Sync All Unlinked ({counts?.unlinked ?? 0})
                </Button>
              </div>
            </div>
            {isActive && (
              <p className="text-xs text-muted-foreground">
                A sync is currently running. Stop it above to start a new one.
              </p>
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
