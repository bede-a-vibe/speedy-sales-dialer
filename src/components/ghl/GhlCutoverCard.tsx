import { useCallback, useState } from "react";
import { Loader2, Link2, UploadCloud, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ghlBulkLinkContacts, ghlPushFieldsToGhl, ghlExportLegacy, type LegacyExportPhase } from "@/lib/ghl";

const LEGACY_PHASES: Array<{ phase: LegacyExportPhase; label: string }> = [
  { phase: "pipelines", label: "Pipelines" },
  { phase: "opportunities", label: "Opportunities" },
  { phase: "contacts", label: "Contacts" },
  { phase: "notes", label: "Notes" },
];

interface LegacyTotals {
  processed: number;
  upserted: number;
  total: number;
}

const EMPTY_LEGACY: LegacyTotals = { processed: 0, upserted: 0, total: 0 };

interface RunTotals {
  processed: number;
  succeeded: number;
  failed: number;
  total: number;
}

const EMPTY: RunTotals = { processed: 0, succeeded: 0, failed: 0, total: 0 };

export function GhlCutoverCard() {
  const { toast } = useToast();
  const [linking, setLinking] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [linkTotals, setLinkTotals] = useState<RunTotals>(EMPTY);
  const [pushTotals, setPushTotals] = useState<RunTotals>(EMPTY);
  const [legacyPhase, setLegacyPhase] = useState<LegacyExportPhase | null>(null);
  const [legacyTotals, setLegacyTotals] = useState<Record<string, LegacyTotals>>({});

  const runLegacy = useCallback(
    async (phase: LegacyExportPhase) => {
      setLegacyPhase(phase);
      setLegacyTotals((prev) => ({ ...prev, [phase]: EMPTY_LEGACY }));
      const totals = { ...EMPTY_LEGACY };
      let cursor: string | null = null;
      try {
        for (;;) {
          const res = await ghlExportLegacy(phase, cursor);
          totals.processed += res.processed;
          totals.upserted += res.upserted;
          totals.total = res.total;
          setLegacyTotals((prev) => ({ ...prev, [phase]: { ...totals } }));
          if (!res.hasMore || !res.nextCursor) break;
          cursor = res.nextCursor;
        }
        toast({
          title: `Legacy ${phase} export finished`,
          description: `${totals.upserted.toLocaleString()} records saved.`,
        });
      } catch (err) {
        toast({
          title: `Legacy ${phase} export stopped`,
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      } finally {
        setLegacyPhase(null);
      }
    },
    [toast],
  );

  const runLink = useCallback(async () => {
    setLinking(true);
    setLinkTotals(EMPTY);
    let offset = 0;
    const totals = { ...EMPTY };
    try {
      for (;;) {
        const res = await ghlBulkLinkContacts({ offset, batchSize: 50 });
        totals.processed += res.processed;
        totals.succeeded += res.linked;
        totals.failed += res.failed;
        totals.total = res.total;
        setLinkTotals({ ...totals });
        if (!res.hasMore) break;
        offset = res.nextOffset;
      }
      toast({ title: "Linking finished", description: `${totals.succeeded.toLocaleString()} contacts linked.` });
    } catch (err) {
      toast({
        title: "Linking stopped",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLinking(false);
    }
  }, [toast]);

  const runPush = useCallback(async () => {
    setPushing(true);
    setPushTotals(EMPTY);
    let offset = 0;
    const totals = { ...EMPTY };
    try {
      for (;;) {
        const res = await ghlPushFieldsToGhl(offset, 50);
        totals.processed += res.processed;
        totals.succeeded += res.updated;
        totals.failed += res.failed;
        totals.total = res.total;
        setPushTotals({ ...totals });
        if (!res.hasMore) break;
        offset = res.nextOffset;
      }
      toast({ title: "Field push finished", description: `${totals.succeeded.toLocaleString()} contacts updated in GHL.` });
    } catch (err) {
      toast({
        title: "Field push stopped",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setPushing(false);
    }
  }, [toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">GHL Cutover</CardTitle>
        <CardDescription>
          One-off backfill for the main location: link contacts by phone, then push dialer fields up to GHL.
          Keep this tab open — each button loops through every batch.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <CutoverAction
          label="Link contacts by phone"
          icon={<Link2 className="h-4 w-4" />}
          running={linking}
          disabled={linking || pushing}
          onRun={runLink}
          totals={linkTotals}
          successLabel="Linked"
        />
        <CutoverAction
          label="Push fields to GHL"
          icon={<UploadCloud className="h-4 w-4" />}
          running={pushing}
          disabled={linking || pushing}
          onRun={runPush}
          totals={pushTotals}
          successLabel="Updated"
        />
      </CardContent>
      <CardHeader className="pt-0">
        <CardTitle className="text-base">Legacy Tradies export</CardTitle>
        <CardDescription>
          Read-only pull of everything left in the old "Odin Digital - Tradies" location into staging tables.
          Run in order — pipelines, opportunities, contacts, then notes. Nothing is written back to GHL.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LEGACY_PHASES.map(({ phase, label }) => {
          const totals = legacyTotals[phase] ?? EMPTY_LEGACY;
          const running = legacyPhase === phase;
          return (
            <div key={phase} className="rounded-lg border p-4 space-y-3">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => runLegacy(phase)}
                disabled={legacyPhase !== null || linking || pushing}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {label}
              </Button>
              <div className="grid grid-cols-2 gap-2 text-center">
                <RunStat label="Processed" value={totals.processed} />
                <RunStat label="Saved" value={totals.upserted} />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {running
                  ? `Running… ${totals.processed.toLocaleString()}${totals.total ? ` of ${totals.total.toLocaleString()}` : ""}`
                  : totals.processed > 0
                    ? "Finished."
                    : "Not started."}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CutoverAction({
  label,
  icon,
  running,
  disabled,
  onRun,
  totals,
  successLabel,
}: {
  label: string;
  icon: React.ReactNode;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
  totals: RunTotals;
  successLabel: string;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <Button className="w-full" onClick={onRun} disabled={disabled}>
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {label}
      </Button>
      <div className="grid grid-cols-3 gap-2 text-center">
        <RunStat label="Processed" value={totals.processed} />
        <RunStat label={successLabel} value={totals.succeeded} />
        <RunStat label="Failed" value={totals.failed} accent={totals.failed > 0 ? "text-destructive" : undefined} />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {running
          ? `Running… ${totals.processed.toLocaleString()}${totals.total ? ` of ${totals.total.toLocaleString()}` : ""}`
          : totals.processed > 0
            ? "Finished."
            : "Not started."}
      </p>
    </div>
  );
}

function RunStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono tabular-nums text-sm font-semibold ${accent ?? ""}`}>{value.toLocaleString()}</div>
    </div>
  );
}