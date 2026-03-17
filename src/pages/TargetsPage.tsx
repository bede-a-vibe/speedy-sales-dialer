import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDeletePerformanceTarget, usePerformanceTargets, useUpsertPerformanceTarget } from "@/hooks/usePerformanceTargets";
import { useSalesReps } from "@/hooks/usePipelineItems";
import {
  formatTargetMetricValue,
  PERFORMANCE_TARGET_METRICS,
  PERFORMANCE_TARGET_METRIC_DEFINITIONS,
  PERFORMANCE_TARGET_PERIOD_LABELS,
  PERFORMANCE_TARGET_SCOPE_LABELS,
  type PerformanceTargetMetricKey,
  type PerformanceTargetPeriodType,
  type PerformanceTargetRecord,
  type PerformanceTargetScopeType,
} from "@/lib/performanceTargets";

const DEFAULT_FORM = {
  id: undefined as string | undefined,
  scope_type: "team" as PerformanceTargetScopeType,
  period_type: "daily" as PerformanceTargetPeriodType,
  metric_key: "bookings_made" as PerformanceTargetMetricKey,
  user_id: "",
  target_value: "",
};

export default function TargetsPage() {
  const { data: targets = [], isLoading } = usePerformanceTargets();
  const { data: reps = [] } = useSalesReps();
  const upsertTarget = useUpsertPerformanceTarget();
  const deleteTarget = useDeletePerformanceTarget();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);

  const repNameMap = useMemo(
    () => new Map(reps.map((rep) => [rep.user_id, rep.display_name || rep.email || "Unnamed rep"])),
    [reps],
  );

  const sortedTargets = useMemo(
    () =>
      [...targets].sort((a, b) => {
        if (a.period_type !== b.period_type) return a.period_type.localeCompare(b.period_type);
        if (a.scope_type !== b.scope_type) return a.scope_type.localeCompare(b.scope_type);
        if (a.metric_key !== b.metric_key) return a.metric_key.localeCompare(b.metric_key);
        return (repNameMap.get(a.user_id || "") || "Team").localeCompare(repNameMap.get(b.user_id || "") || "Team");
      }),
    [repNameMap, targets],
  );

  const openNew = () => {
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEdit = (target: PerformanceTargetRecord) => {
    setForm({
      id: target.id,
      scope_type: target.scope_type,
      period_type: target.period_type,
      metric_key: target.metric_key,
      user_id: target.user_id || "",
      target_value: String(target.target_value),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (form.scope_type === "individual" && !form.user_id) {
      toast.error("Select a rep for individual targets.");
      return;
    }

    if (!form.target_value || Number.isNaN(Number(form.target_value))) {
      toast.error("Enter a valid target value.");
      return;
    }

    try {
      await upsertTarget.mutateAsync({
        id: form.id,
        scope_type: form.scope_type,
        period_type: form.period_type,
        metric_key: form.metric_key,
        user_id: form.scope_type === "team" ? null : form.user_id,
        target_value: Number(form.target_value),
      });
      toast.success(form.id ? "Target updated." : "Target saved.");
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save target.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTarget.mutateAsync(id);
      toast.success("Target removed.");
    } catch {
      toast.error("Failed to delete target.");
    }
  };

  return (
    <AppLayout title="Targets">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Performance Targets</h2>
            <p className="text-sm text-muted-foreground">
              Manage daily and weekly goals for each rep and for the team.
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" />
                Add Target
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit target" : "Add target"}</DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select
                    value={form.scope_type}
                    onValueChange={(value: PerformanceTargetScopeType) =>
                      setForm((current) => ({
                        ...current,
                        scope_type: value,
                        user_id: value === "team" ? "" : current.user_id,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select scope" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PERFORMANCE_TARGET_SCOPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Period</Label>
                  <Select
                    value={form.period_type}
                    onValueChange={(value: PerformanceTargetPeriodType) =>
                      setForm((current) => ({ ...current, period_type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PERFORMANCE_TARGET_PERIOD_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Metric</Label>
                  <Select
                    value={form.metric_key}
                    onValueChange={(value: PerformanceTargetMetricKey) =>
                      setForm((current) => ({ ...current, metric_key: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {PERFORMANCE_TARGET_METRICS.map((metricKey) => (
                        <SelectItem key={metricKey} value={metricKey}>
                          {PERFORMANCE_TARGET_METRIC_DEFINITIONS[metricKey].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.scope_type === "individual" && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Rep</Label>
                    <Select
                      value={form.user_id}
                      onValueChange={(value) => setForm((current) => ({ ...current, user_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select rep" />
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
                )}

                <div className="space-y-2 sm:col-span-2">
                  <Label>Target Value</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.target_value}
                    onChange={(event) => setForm((current) => ({ ...current, target_value: event.target.value }))}
                    placeholder={form.metric_key === "show_up_rate" ? "e.g. 70" : "e.g. 12"}
                    className="font-mono"
                  />
                </div>
              </div>

              <Button onClick={handleSave} disabled={upsertTarget.isPending} className="mt-2 w-full">
                {upsertTarget.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {form.id ? "Update Target" : "Save Target"}
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading targets…</div>
          ) : sortedTargets.length === 0 ? (
            <div className="p-8 text-center">
              <Target className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No targets configured yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Metric</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTargets.map((target) => (
                  <TableRow key={target.id}>
                    <TableCell>{PERFORMANCE_TARGET_SCOPE_LABELS[target.scope_type]}</TableCell>
                    <TableCell>{PERFORMANCE_TARGET_PERIOD_LABELS[target.period_type]}</TableCell>
                    <TableCell>{PERFORMANCE_TARGET_METRIC_DEFINITIONS[target.metric_key].label}</TableCell>
                    <TableCell>{target.scope_type === "team" ? "Team" : repNameMap.get(target.user_id || "") || "Unknown rep"}</TableCell>
                    <TableCell className="font-mono">{formatTargetMetricValue(target.metric_key, Number(target.target_value))}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(target)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(target.id)}
                          disabled={deleteTarget.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
