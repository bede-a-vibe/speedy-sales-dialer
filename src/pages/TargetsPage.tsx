import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Target, Trash2, Users, User, Calculator, Zap } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDeletePerformanceTarget, usePerformanceTargets, useUpsertPerformanceTarget } from "@/hooks/usePerformanceTargets";
import { useSalesReps } from "@/hooks/usePipelineItems";
import {
  deriveAllTargets,
  deriveDialsAndPickups,
  formatTargetMetricValue,
  INPUT_METRICS,
  PERFORMANCE_TARGET_METRICS,
  PERFORMANCE_TARGET_METRIC_DEFINITIONS,
  WEEKLY_MULTIPLIER,
  type PerformanceTargetMetricKey,
  type PerformanceTargetRecord,
} from "@/lib/performanceTargets";

type BulkFormValues = Record<PerformanceTargetMetricKey, string>;

function emptyBulkForm(): BulkFormValues {
  return Object.fromEntries(PERFORMANCE_TARGET_METRICS.map((k) => [k, ""])) as BulkFormValues;
}

export default function TargetsPage() {
  const { data: targets = [], isLoading } = usePerformanceTargets();
  const { data: reps = [] } = useSalesReps();
  const upsertTarget = useUpsertPerformanceTarget();
  const deleteTarget = useDeletePerformanceTarget();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRepId, setSelectedRepId] = useState("");
  const [bulkValues, setBulkValues] = useState<BulkFormValues>(emptyBulkForm);
  const [isSaving, setIsSaving] = useState(false);

  const repNameMap = useMemo(
    () => new Map(reps.map((rep) => [rep.user_id, rep.display_name || rep.email || "Unnamed rep"])),
    [reps],
  );

  // Only individual daily input targets are stored (not dials/pickups)
  const storedDailyTargets = useMemo(
    () => targets.filter((t) => t.scope_type === "individual" && t.period_type === "daily"),
    [targets],
  );

  const derived = useMemo(() => deriveAllTargets(targets), [targets]);

  // Group stored targets by rep
  const targetsByRep = useMemo(() => {
    const map = new Map<string, PerformanceTargetRecord[]>();
    for (const t of storedDailyTargets) {
      if (!t.user_id) continue;
      const list = map.get(t.user_id) || [];
      list.push(t);
      map.set(t.user_id, list);
    }
    return map;
  }, [storedDailyTargets]);

  // Live-calculate dials/pickups from current form values
  const derivedPreview = useMemo(() => {
    const bookings = bulkValues.bookings_made ? Number(bulkValues.bookings_made) : 0;
    const pickupRate = bulkValues.pickup_to_booking_rate ? Number(bulkValues.pickup_to_booking_rate) : 0;
    const dialRate = bulkValues.dial_to_pickup_rate ? Number(bulkValues.dial_to_pickup_rate) : 0;
    return deriveDialsAndPickups({
      bookings_made: bookings,
      pickup_to_booking_rate: pickupRate,
      dial_to_pickup_rate: dialRate,
    });
  }, [bulkValues.bookings_made, bulkValues.pickup_to_booking_rate, bulkValues.dial_to_pickup_rate]);

  const openNewForRep = () => {
    setSelectedRepId("");
    setBulkValues(emptyBulkForm());
    setDialogOpen(true);
  };

  const openEditForRep = (repUserId: string) => {
    setSelectedRepId(repUserId);
    const repTargets = targetsByRep.get(repUserId) || [];
    const values = emptyBulkForm();
    for (const t of repTargets) {
      values[t.metric_key] = String(t.target_value);
    }
    setBulkValues(values);
    setDialogOpen(true);
  };

  const handleBulkSave = async () => {
    if (!selectedRepId) {
      toast.error("Select a rep first.");
      return;
    }

    // Only save input metrics (not derived ones)
    const entries = INPUT_METRICS
      .filter((key) => bulkValues[key] !== "" && !Number.isNaN(Number(bulkValues[key])))
      .map((key) => ({ metric_key: key, target_value: Number(bulkValues[key]) }));

    if (entries.length === 0) {
      toast.error("Enter at least one target value.");
      return;
    }

    setIsSaving(true);
    try {
      const existingRepTargets = targetsByRep.get(selectedRepId) || [];
      const existingByMetric = new Map(existingRepTargets.map((t) => [t.metric_key, t]));

      for (const entry of entries) {
        const existing = existingByMetric.get(entry.metric_key);
        await upsertTarget.mutateAsync({
          id: existing?.id,
          scope_type: "individual",
          period_type: "daily",
          metric_key: entry.metric_key,
          user_id: selectedRepId,
          target_value: entry.target_value,
        });
      }

      // Delete targets for input metrics that were cleared
      const clearedMetrics = INPUT_METRICS.filter(
        (key) => bulkValues[key] === "" && existingByMetric.has(key),
      );
      for (const metricKey of clearedMetrics) {
        const existing = existingByMetric.get(metricKey);
        if (existing) {
          await deleteTarget.mutateAsync(existing.id);
        }
      }

      toast.success(`Targets saved for ${repNameMap.get(selectedRepId) || "rep"}.`);
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save targets.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAllForRep = async (repUserId: string) => {
    const repTargets = targetsByRep.get(repUserId) || [];
    if (repTargets.length === 0) return;
    try {
      for (const t of repTargets) {
        await deleteTarget.mutateAsync(t.id);
      }
      toast.success(`All targets removed for ${repNameMap.get(repUserId) || "rep"}.`);
    } catch {
      toast.error("Failed to delete targets.");
    }
  };

  const repsWithTargets = useMemo(() => Array.from(targetsByRep.keys()), [targetsByRep]);

  // Build full target list per rep (stored + derived) for display
  const fullTargetsByRep = useMemo(() => {
    const map = new Map<string, PerformanceTargetRecord[]>();
    for (const t of derived.individualDaily) {
      if (!t.user_id) continue;
      const list = map.get(t.user_id) || [];
      list.push(t);
      map.set(t.user_id, list);
    }
    return map;
  }, [derived.individualDaily]);

  return (
    <AppLayout title="Targets">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Performance Targets</h2>
            <p className="text-sm text-muted-foreground">
              Set bookings & rates per rep — dials, pickups, weekly, and team totals are calculated automatically.
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNewForRep}>
                <Plus className="mr-2 h-4 w-4" />
                Set Rep Targets
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {selectedRepId ? `Edit daily targets — ${repNameMap.get(selectedRepId) || "Rep"}` : "Set daily targets for a rep"}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Rep</Label>
                  <Select value={selectedRepId} onValueChange={setSelectedRepId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a rep" />
                    </SelectTrigger>
                    <SelectContent>
                      {reps.map((rep) => (
                        <SelectItem key={rep.user_id} value={rep.user_id}>
                          {rep.display_name || rep.email || "Unnamed rep"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {/* Input metrics */}
                <div className="grid gap-3">
                  {INPUT_METRICS.map((metricKey) => {
                    const def = PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey];
                    return (
                      <div key={metricKey} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{def.label}</p>
                          <p className="text-xs text-muted-foreground">{def.description}</p>
                        </div>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={bulkValues[metricKey]}
                          onChange={(e) => setBulkValues((prev) => ({ ...prev, [metricKey]: e.target.value }))}
                          placeholder={def.isRate ? "e.g. 30" : "e.g. 5"}
                          className="w-28 font-mono text-right"
                        />
                        {def.isRate && <span className="text-xs text-muted-foreground w-4">%</span>}
                        {!def.isRate && <span className="w-4" />}
                      </div>
                    );
                  })}
                </div>

                {/* Derived preview */}
                {(derivedPreview.pickups > 0 || derivedPreview.dials > 0) && (
                  <>
                    <Separator />
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        Auto-calculated daily targets
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center rounded-md bg-background p-2">
                          <p className="text-2xl font-bold font-mono text-foreground">{derivedPreview.pickups.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Pickups needed</p>
                        </div>
                        <div className="text-center rounded-md bg-background p-2">
                          <p className="text-2xl font-bold font-mono text-foreground">{derivedPreview.dials.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">Dials needed</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {bulkValues.bookings_made || 0} bookings ÷ {bulkValues.pickup_to_booking_rate || 0}% = {derivedPreview.pickups} pickups ÷ {bulkValues.dial_to_pickup_rate || 0}% = {derivedPreview.dials} dials
                      </p>
                    </div>
                  </>
                )}

                <div className="rounded-md border border-border bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Calculator className="h-3.5 w-3.5" />
                    How targets roll up
                  </div>
                  <p>Weekly = daily × {WEEKLY_MULTIPLIER} (rates stay the same)</p>
                  <p>Team = sum of all reps (rates averaged)</p>
                </div>

                <Button onClick={handleBulkSave} disabled={isSaving} className="w-full">
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Daily Targets
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Individual rep cards */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <User className="h-4 w-4" />
            Individual Daily Targets
          </h3>

          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading targets…</div>
          ) : repsWithTargets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Target className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No targets configured yet. Click "Set Rep Targets" to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {repsWithTargets.map((repId) => {
                const allRepTargets = fullTargetsByRep.get(repId) || [];
                return (
                  <Card key={repId}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{repNameMap.get(repId) || "Unknown rep"}</CardTitle>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForRep(repId)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteAllForRep(repId)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <CardDescription>Daily targets</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-1.5">
                        {allRepTargets.map((t) => {
                          const def = PERFORMANCE_TARGET_METRIC_DEFINITIONS[t.metric_key];
                          return (
                            <div key={t.metric_key} className="flex justify-between text-sm">
                              <span className={def.isDerived ? "text-muted-foreground italic" : "text-muted-foreground"}>
                                {def.label}
                                {def.isDerived && (
                                  <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 align-middle">auto</Badge>
                                )}
                              </span>
                              <span className="font-mono font-medium">{formatTargetMetricValue(t.metric_key, t.target_value)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Derived team targets */}
        {!isLoading && repsWithTargets.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Users className="h-4 w-4" />
              Auto-Calculated Team Targets
            </h3>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Team Daily</TableHead>
                    <TableHead className="text-right">Team Weekly</TableHead>
                    <TableHead className="text-right">How</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PERFORMANCE_TARGET_METRICS.map((metricKey) => {
                    const def = PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey];
                    const teamDailyTarget = derived.teamDaily.find((t) => t.metric_key === metricKey);
                    const teamWeeklyTarget = derived.teamWeekly.find((t) => t.metric_key === metricKey);

                    if (!teamDailyTarget && !teamWeeklyTarget) return null;

                    return (
                      <TableRow key={metricKey}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {def.label}
                              {def.isDerived && (
                                <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 align-middle">auto</Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground">{def.description}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {teamDailyTarget ? formatTargetMetricValue(metricKey, teamDailyTarget.target_value) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {teamWeeklyTarget ? formatTargetMetricValue(metricKey, teamWeeklyTarget.target_value) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="text-xs">
                            {def.isDerived ? "derived" : def.isRate ? "avg" : "sum"}
                            {!def.isRate ? ` × ${WEEKLY_MULTIPLIER}` : ""}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
