import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Target, Trash2, Users, User, Calculator, Zap, Phone, Handshake } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeletePerformanceTarget, usePerformanceTargets, useUpsertPerformanceTarget } from "@/hooks/usePerformanceTargets";
import { useSalesReps } from "@/hooks/usePipelineItems";
import {
  deriveAllTargets,
  deriveSetterValues,
  deriveCloserValues,
  formatTargetMetricValue,
  INPUT_METRICS,
  SETTER_INPUT_METRICS,
  CLOSER_INPUT_METRICS,
  SETTER_METRICS,
  CLOSER_METRICS,
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

function getFormNumericValue(val: string): number | undefined {
  if (val === "" || Number.isNaN(Number(val))) return undefined;
  return Number(val);
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

  const storedDailyTargets = useMemo(
    () => targets.filter((t) => t.scope_type === "individual" && t.period_type === "daily"),
    [targets],
  );

  const derived = useMemo(() => deriveAllTargets(targets), [targets]);

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

  // Live-calculate derived values from current form
  const setterPreview = useMemo(() => deriveSetterValues({
    bookings_made: getFormNumericValue(bulkValues.bookings_made),
    pickup_to_booking_rate: getFormNumericValue(bulkValues.pickup_to_booking_rate),
    dial_to_pickup_rate: getFormNumericValue(bulkValues.dial_to_pickup_rate),
    setter_show_up_rate: getFormNumericValue(bulkValues.setter_show_up_rate),
    setter_close_rate: getFormNumericValue(bulkValues.setter_close_rate),
  }), [bulkValues.bookings_made, bulkValues.pickup_to_booking_rate, bulkValues.dial_to_pickup_rate, bulkValues.setter_show_up_rate, bulkValues.setter_close_rate]);

  const closerPreview = useMemo(() => deriveCloserValues({
    closer_meetings_booked: getFormNumericValue(bulkValues.closer_meetings_booked),
    closer_verbal_commitment_rate: getFormNumericValue(bulkValues.closer_verbal_commitment_rate),
    closer_close_rate: getFormNumericValue(bulkValues.closer_close_rate),
  }), [bulkValues.closer_meetings_booked, bulkValues.closer_verbal_commitment_rate, bulkValues.closer_close_rate]);

  const hasSetterDerived = setterPreview.pickups > 0 || setterPreview.dials > 0 || setterPreview.setter_showed > 0;
  const hasCloserDerived = closerPreview.closer_verbal_commitments > 0 || closerPreview.closer_closed_deals > 0;

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
      if (t.metric_key in values) {
        values[t.metric_key] = String(t.target_value);
      }
    }
    setBulkValues(values);
    setDialogOpen(true);
  };

  const handleBulkSave = async () => {
    if (!selectedRepId) {
      toast.error("Select a rep first.");
      return;
    }

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

  // ── Render helpers ──

  function renderInputMetricRow(metricKey: PerformanceTargetMetricKey) {
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
        {def.isRate ? <span className="text-xs text-muted-foreground w-4">%</span> : <span className="w-4" />}
      </div>
    );
  }

  function renderDerivedPreview(
    title: string,
    items: Array<{ label: string; value: number }>,
    formula: string,
  ) {
    const hasValues = items.some((i) => i.value > 0);
    if (!hasValues) return null;

    return (
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" />
          {title}
        </div>
        <div className={`grid gap-3 ${items.length <= 2 ? "grid-cols-2" : "grid-cols-4"}`}>
          {items.map((item) => (
            <div key={item.label} className="text-center rounded-md bg-background p-2">
              <p className="text-xl font-bold font-mono text-foreground">{item.value.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">{formula}</p>
      </div>
    );
  }

  function renderRepCardMetrics(repTargets: PerformanceTargetRecord[], groupMetrics: PerformanceTargetMetricKey[]) {
    const relevantTargets = repTargets.filter((t) => groupMetrics.includes(t.metric_key));
    if (relevantTargets.length === 0) return null;

    return (
      <div className="space-y-1">
        {relevantTargets.map((t) => {
          const def = PERFORMANCE_TARGET_METRIC_DEFINITIONS[t.metric_key];
          return (
            <div key={t.metric_key} className="flex justify-between text-sm">
              <span className={def.isDerived ? "text-muted-foreground/70 italic text-xs" : "text-muted-foreground text-xs"}>
                {def.label}
                {def.isDerived && <Badge variant="outline" className="ml-1 text-[9px] px-1 py-0 align-middle">auto</Badge>}
              </span>
              <span className="font-mono font-medium text-xs">{formatTargetMetricValue(t.metric_key, t.target_value)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <AppLayout title="Targets">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Performance Targets</h2>
            <p className="text-sm text-muted-foreground">
              Set setter & closer targets per rep — dials, pickups, showed, closed, weekly, and team totals are all auto-calculated.
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNewForRep}>
                <Plus className="mr-2 h-4 w-4" />
                Set Rep Targets
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedRepId ? `Edit targets — ${repNameMap.get(selectedRepId) || "Rep"}` : "Set daily targets for a rep"}
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

                {/* Setter Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Setter Targets</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Bookings, rates, and calling activity for the person setting appointments.</p>
                  <div className="grid gap-3">
                    {SETTER_INPUT_METRICS.map(renderInputMetricRow)}
                  </div>

                  {hasSetterDerived && renderDerivedPreview(
                    "Auto-calculated setter targets",
                    [
                      { label: "Pickups needed", value: setterPreview.pickups },
                      { label: "Dials needed", value: setterPreview.dials },
                      { label: "Expected showed", value: setterPreview.setter_showed },
                      { label: "Expected closed", value: setterPreview.setter_closed_deals },
                    ],
                    `${bulkValues.bookings_made || 0} bookings ÷ ${bulkValues.pickup_to_booking_rate || 0}% = ${setterPreview.pickups} pickups ÷ ${bulkValues.dial_to_pickup_rate || 0}% = ${setterPreview.dials} dials | ${bulkValues.bookings_made || 0} × ${bulkValues.setter_show_up_rate || 0}% = ${setterPreview.setter_showed} showed × ${bulkValues.setter_close_rate || 0}% = ${setterPreview.setter_closed_deals} closed`,
                  )}
                </div>

                <Separator />

                {/* Closer Section */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Handshake className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Closer Targets</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Meetings taken, verbal commitments, and closed deals for the person closing.</p>
                  <div className="grid gap-3">
                    {CLOSER_INPUT_METRICS.map(renderInputMetricRow)}
                  </div>

                  {hasCloserDerived && renderDerivedPreview(
                    "Auto-calculated closer targets",
                    [
                      { label: "Verbal commitments", value: closerPreview.closer_verbal_commitments },
                      { label: "Closed deals", value: closerPreview.closer_closed_deals },
                    ],
                    `${bulkValues.closer_meetings_booked || 0} meetings × ${bulkValues.closer_verbal_commitment_rate || 0}% = ${closerPreview.closer_verbal_commitments} verbal | × ${bulkValues.closer_close_rate || 0}% = ${closerPreview.closer_closed_deals} closed`,
                  )}
                </div>

                <Separator />

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
                const hasSetterTargets = allRepTargets.some((t) => SETTER_METRICS.includes(t.metric_key));
                const hasCloserTargets = allRepTargets.some((t) => CLOSER_METRICS.includes(t.metric_key));

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
                    <CardContent className="pt-0 space-y-3">
                      {hasSetterTargets && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
                            <Phone className="h-3 w-3" /> Setter
                          </p>
                          {renderRepCardMetrics(allRepTargets, SETTER_METRICS)}
                        </div>
                      )}
                      {hasCloserTargets && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5 flex items-center gap-1">
                            <Handshake className="h-3 w-3" /> Closer
                          </p>
                          {renderRepCardMetrics(allRepTargets, CLOSER_METRICS)}
                        </div>
                      )}
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

            <Tabs defaultValue="setter" className="w-full">
              <TabsList>
                <TabsTrigger value="setter" className="gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> Setter
                </TabsTrigger>
                <TabsTrigger value="closer" className="gap-1.5">
                  <Handshake className="h-3.5 w-3.5" /> Closer
                </TabsTrigger>
              </TabsList>

              {(["setter", "closer"] as const).map((group) => {
                const groupMetrics = group === "setter" ? SETTER_METRICS : CLOSER_METRICS;
                return (
                  <TabsContent key={group} value={group}>
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
                          {groupMetrics.map((metricKey) => {
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
                                      {def.isDerived && <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 align-middle">auto</Badge>}
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
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
